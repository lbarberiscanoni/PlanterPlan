import { reapByTag } from './cleanup';

/**
 * Runs once after the whole suite. Deletes everything this run tagged, against live Supabase.
 * Never throws into the runner in a way that masks test results — but a cleanup failure IS
 * logged loudly so leftover data gets noticed (the nightly reaper is the backstop).
 */
export default async function globalTeardown(): Promise<void> {
  try {
    await reapByTag();
  } catch (err) {
    console.error('[e2e cleanup] FAILED — test data may be left in the DB:', err);
  }
}
