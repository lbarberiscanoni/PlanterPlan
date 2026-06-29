import { test, expect } from '@playwright/test';
import { reapStale } from '../support/cleanup';

/**
 * @reaper — the nightly backstop. Deletes any [e2e-*] data older than 6h owned by the test
 * accounts (catches teardowns that crashed or ran without a service key). No browser navigation;
 * run via the reaper project / e2e-reaper workflow, NOT as part of smoke/regression.
 */
test('@reaper sweep stale e2e data', async () => {
  await expect(reapStale(6)).resolves.toBeUndefined();
});
