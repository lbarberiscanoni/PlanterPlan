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
const REAPER_CEILING = 5000;

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

  // Delete NON-ROOT descendants first, then the roots. Deleting a root in the same statement as
  // its children raises FK 23503: a child-delete trigger logs to activity_log(project_id -> tasks)
  // referencing the root that's being concurrently deleted, and the whole delete rolls back.
  // Non-roots log against the still-present root; the root delete is skipped by the logging trigger
  // and cascades the activity_log rows (FK is ON DELETE CASCADE).
  if (rootIds.length > 0) {
    const { error: eKids } = await admin
      .from('tasks')
      .delete()
      .in('root_id', rootIds)
      .not('parent_task_id', 'is', null)
      .in('creator', creatorIds);
    if (eKids) throw eKids;

    const { error: eRoots } = await admin.from('tasks').delete().in('id', rootIds).in('creator', creatorIds);
    if (eRoots) throw eRoots;
  }

  // Any remaining directly-tagged rows (custom tasks in pre-existing projects whose root is NOT
  // being deleted — logging against a present root is fine).
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

/**
 * Nightly reaper backstop: delete ANY `[e2e-*]` data older than `olderThanHours`, owned by the
 * test accounts. This catches runs whose globalTeardown crashed or was skipped (no service key).
 * Not run-scoped — guarded instead by the fixed [e2e- prefix, creator pinning, age cutoff, and a
 * high ceiling. (Date is fine here — the ban is only on Workflow scripts.)
 */
export async function reapStale(olderThanHours = 6): Promise<void> {
  const admin = adminClient();
  if (!admin) {
    console.warn('[e2e reaper] SKIPPED — no E2E_SUPABASE_SERVICE_ROLE_KEY (+ url).');
    return;
  }
  const creatorIds = await testAccountIds(admin);
  if (creatorIds.length === 0) {
    console.warn('[e2e reaper] SKIPPED — could not resolve any test-account ids.');
    return;
  }

  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
  const like = '[e2e-%';

  const { data: stale, error } = await admin
    .from('tasks')
    .select('id, parent_task_id, root_id')
    .like('title', like)
    .in('creator', creatorIds)
    .lt('created_at', cutoff);
  if (error) throw error;

  if (!stale || stale.length === 0) {
    console.log('[e2e reaper] nothing stale to remove.');
    return;
  }
  if (stale.length > REAPER_CEILING) {
    throw new Error(`[e2e reaper] ABORT — ${stale.length} stale rows (ceiling ${REAPER_CEILING}). Inspect manually.`);
  }

  // Non-roots first, then roots (see reapByTag for the activity_log FK rationale).
  const rootIds = stale.filter((t) => t.parent_task_id === null).map((t) => t.id);
  if (rootIds.length > 0) {
    const { error: eKids } = await admin
      .from('tasks')
      .delete()
      .in('root_id', rootIds)
      .not('parent_task_id', 'is', null)
      .in('creator', creatorIds);
    if (eKids) throw eKids;

    const { error: eRoots } = await admin.from('tasks').delete().in('id', rootIds).in('creator', creatorIds);
    if (eRoots) throw eRoots;
  }
  {
    const { error: e } = await admin
      .from('tasks')
      .delete()
      .like('title', like)
      .in('creator', creatorIds)
      .lt('created_at', cutoff);
    if (e) throw e;
  }
  try {
    await admin.from('resources').delete().like('name', like).lt('created_at', cutoff);
  } catch (e) {
    console.warn('[e2e reaper] resource sweep skipped:', (e as Error).message);
  }

  console.log(`[e2e reaper] removed ${stale.length} stale tagged task(s) (${rootIds.length} root(s)).`);
}
