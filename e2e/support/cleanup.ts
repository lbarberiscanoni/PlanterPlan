import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { E2E_TAG, assertSafeRunId } from './runId';

/**
 * Tag-scoped, owner-pinned teardown that runs against LIVE Supabase (there is no test DB).
 *
 * Safety rails — because a bad DELETE here hits real data:
 *   1. assertSafeRunId() aborts on a missing/short run id (no broad-match wipe).
 *   2. Every delete is scoped to BOTH the run tag AND the test-account creator ids.
 *   3. A sanity ceiling aborts if the match set is implausibly large.
 *
 * Deletes:
 *   - cloned subtrees: all tasks whose root_id is a tagged root (children carry the
 *     creator but not the tag, so root_id is how we reach them).
 *   - directly-tagged tasks: custom tasks added to pre-existing projects (delete only
 *     the tagged row, never its project).
 *   - tagged resources (best-effort).
 */

const SANITY_CEILING = 500;

function adminClient(): SupabaseClient | null {
  const url = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function testAccountIds(admin: SupabaseClient): Promise<string[]> {
  const wanted = [
    process.env.E2E_ADMIN_EMAIL,
    process.env.E2E_PLANTER_EMAIL,
    process.env.E2E_TEAM_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => (e as string).toLowerCase());

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users
    .filter((u) => u.email && wanted.includes(u.email.toLowerCase()))
    .map((u) => u.id);
}

export async function reapByTag(): Promise<void> {
  assertSafeRunId();

  const admin = adminClient();
  if (!admin) {
    console.warn(
      `[e2e cleanup] SKIPPED — no E2E_SUPABASE_SERVICE_ROLE_KEY (+ url). Test data tagged ` +
        `${E2E_TAG} was left in the DB; the nightly reaper must catch it.`,
    );
    return;
  }

  const creatorIds = await testAccountIds(admin);
  if (creatorIds.length === 0) {
    console.warn('[e2e cleanup] SKIPPED — could not resolve any test-account ids; refusing to delete.');
    return;
  }

  const like = `${E2E_TAG}%`;

  // Find the tagged rows (roots + custom tasks), pinned to test-account creators.
  const { data: tagged, error: findErr } = await admin
    .from('tasks')
    .select('id, parent_task_id, root_id, creator')
    .like('title', like)
    .in('creator', creatorIds);
  if (findErr) throw findErr;

  if (!tagged || tagged.length === 0) {
    console.log(`[e2e cleanup] nothing tagged ${E2E_TAG} to remove.`);
    return;
  }
  if (tagged.length > SANITY_CEILING) {
    throw new Error(
      `[e2e cleanup] ABORT — ${tagged.length} rows match ${E2E_TAG} (ceiling ${SANITY_CEILING}). ` +
        `Refusing to mass-delete; inspect manually.`,
    );
  }

  const rootIds = tagged.filter((t) => t.parent_task_id === null).map((t) => t.id);

  // 1. Whole cloned subtrees (children reached via root_id), creator-pinned.
  if (rootIds.length > 0) {
    const { error } = await admin.from('tasks').delete().in('root_id', rootIds).in('creator', creatorIds);
    if (error) throw error;
  }

  // 2. Any remaining directly-tagged rows (custom tasks in pre-existing projects).
  {
    const { error } = await admin.from('tasks').delete().like('title', like).in('creator', creatorIds);
    if (error) throw error;
  }

  // 3. Tagged resources (best-effort; resources may not expose a creator column).
  try {
    await admin.from('resources').delete().like('name', like);
  } catch (e) {
    console.warn('[e2e cleanup] resource sweep skipped:', (e as Error).message);
  }

  console.log(
    `[e2e cleanup] removed ${tagged.length} tagged task(s) (${rootIds.length} project root(s)) for ${E2E_TAG}.`,
  );
}
