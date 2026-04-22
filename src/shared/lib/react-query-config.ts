/**
 * Centralized React Query `staleTime` presets.
 *
 * Previously, every hook that wanted a non-default stale window inlined its
 * own `1000 * 60 * N` literal. The result was 7+ hooks drifting out of
 * lock-step on the refresh cadence. The presets here give each consumer a
 * named policy so tuning is a one-file change.
 *
 * Keep the set small — if a hook genuinely needs a bespoke window, it can
 * still pass a literal, but the default is to pick one of these.
 */
export const STALE_TIMES = {
    /** 30 seconds — server-side-filtered admin queries; debounce + user action. */
    short: 30_000,
    /** 2 minutes — task lists, project hierarchies, team rosters. */
    medium: 2 * 60_000,
    /** 5 minutes — analytics dashboards, library search. */
    long: 5 * 60_000,
    /** 30 minutes — master-library listings that rarely change. */
    veryLong: 30 * 60_000,
} as const;

export type StaleTimeKey = keyof typeof STALE_TIMES;
