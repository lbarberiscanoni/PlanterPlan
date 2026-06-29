/**
 * A per-run identifier and the tag stamped onto every entity a run creates.
 *
 * MUST be stable across the config process, the worker processes, and global-teardown,
 * so it is derived ONLY from env (never Date.now() at import time, which would differ
 * per process and break cleanup matching).
 *
 *   - CI:    set E2E_RUN_ID to `${{ github.run_id }}-${{ github.run_attempt }}`
 *   - local: the `test:e2e` npm script sets `E2E_RUN_ID=local-<timestamp>`
 *
 * Cleanup deletes exactly what matches E2E_TAG, so a missing/short id is fatal, not silent.
 */
export const E2E_RUN_ID = process.env.E2E_RUN_ID ?? '';

/** Title/name prefix applied to every test-created row. Cleanup matches on this. */
export const E2E_TAG = `[e2e-${E2E_RUN_ID}]`;

/** Prefix an entity title so teardown can find and delete it. */
export function tagged(title: string): string {
  return `${E2E_TAG} ${title}`;
}

/**
 * Guard: refuse to proceed if the run id is missing or implausibly short.
 * This is what stops a malformed tag from widening a cleanup DELETE to real data.
 */
export function assertSafeRunId(): void {
  if (!E2E_RUN_ID || E2E_RUN_ID.length < 6) {
    throw new Error(
      `E2E_RUN_ID is missing or too short ("${E2E_RUN_ID}"). Refusing to run/clean up ` +
        `against live Supabase without a unique tag. Set E2E_RUN_ID (the npm script does this locally).`,
    );
  }
}
