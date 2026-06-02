/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern */
import { test as base } from 'playwright-bdd';
import { AUTH_STATES } from './test-data';

/** Extend base test with an authenticated browser context */
export const test = base.extend<{ authenticatedPage: ReturnType<typeof base['extend']> }>({
  storageState: async ({}, use) => {
    await use(AUTH_STATES.user);
  },
});
