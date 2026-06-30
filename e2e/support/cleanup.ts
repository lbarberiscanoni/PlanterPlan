import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { E2E_TAG, assertSafeRunId } from './runId';

/**
 * Tag-scoped teardown against LIVE Supabase (there is no test DB). Task deletion goes through the
 * `e2e_purge_tagged` RPC (migration 20260629040000) — raw PostgREST deletes can't coordinate with
 * the activity_log logging trigger during a subtree cascade and hit FK 23503. The RPC uses the same
 * GUC the app's delete_project path uses, so the cascade is logged-skipped and deletes cleanly.
 *
 * Guards: missing/short run id aborts; the RPC itself enforces the '[e2e-' prefix + creator pinning.
 */

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

async function purge(prefix: string, olderThanHours: number, label: string): Promise<void> {
  const admin = adminClient();
  if (!admin) {
    console.warn(`[${label}] SKIPPED — no E2E_SUPABASE_SERVICE_ROLE_KEY (+ url).`);
    return;
  }
  const creatorIds = await testAccountIds(admin);
  if (creatorIds.length === 0) {
    console.warn(`[${label}] SKIPPED — could not resolve any test-account ids.`);
    return;
  }

  const { data, error } = await admin.rpc('e2e_purge_tagged', {
    p_tag_prefix: prefix,
    p_creator_ids: creatorIds,
    p_older_than_hours: olderThanHours,
  });
  if (error) {
    // Most likely the migration (20260629040000) isn't applied to this project yet.
    throw new Error(
      `${label}: e2e_purge_tagged RPC failed (${error.message}). ` +
        `Ensure migration 20260629040000_e2e_purge_tagged_cleanup_rpc.sql is applied.`,
    );
  }

  // Best-effort tagged-resource sweep (no FK-cascade concern on resources).
  const resourceQuery = admin.from('resources').delete().like('name', `${prefix}%`);
  const { error: resErr } = await resourceQuery;
  if (resErr) console.warn(`[${label}] resource sweep skipped: ${resErr.message}`);

  console.log(`[${label}] purged ${data ?? 0} task row(s) for prefix ${prefix}.`);
}

/** Run-scoped teardown: delete everything this run tagged. */
export async function reapByTag(): Promise<void> {
  assertSafeRunId();
  await purge(E2E_TAG, 0, 'e2e cleanup');
}

/**
 * Nightly reaper backstop: delete ANY [e2e-*] data older than `olderThanHours`, catching runs whose
 * teardown crashed or ran without a service key. olderThanHours = 0 means "everything" (one-time sweep).
 */
export async function reapStale(olderThanHours = 6): Promise<void> {
  await purge('[e2e-', olderThanHours, 'e2e reaper');
}
