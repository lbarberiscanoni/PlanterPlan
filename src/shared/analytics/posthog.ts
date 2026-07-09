import posthog from 'posthog-js';

/**
 * Privacy-first PostHog integration for PlanterPlan.
 *
 * Design constraints (per stakeholder / Patrick, 2026-07):
 * - CUSTOM EVENTS ONLY. No autocapture, no pageview capture, no session
 *   replay, no network/performance capture, no surveys.
 * - No PII in event properties: no emails, no `people` names, no task/phase/
 *   project titles or descriptions. `distinct_id` is the Supabase auth UID
 *   (already a random UUID).
 * - Our routes embed identifiers (`/project/:id`, `/admin/users/:uid`), so we
 *   strip URL/referrer autoproperties before anything is sent.
 *
 * The ONLY way to emit an event is `track()`, which is locked to the
 * `AnalyticsEvent` union below. This enforces "custom events only" in code,
 * not just policy — nothing can send an ad-hoc event name.
 */

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim();
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

let initialized = false;

/** Autoproperties that can leak IDs (routes embed project_id / uid). Stripped before send. */
const URL_PROPERTY_DENYLIST = [
  '$current_url',
  '$pathname',
  '$host',
  '$referrer',
  '$referring_domain',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
  '$initial_referring_domain',
] as const;

/**
 * Initialize PostHog with all broad-capture surfaces disabled. No-op when
 * `VITE_POSTHOG_KEY` is absent (local dev without analytics, tests, CI).
 * Call once, before the app renders.
 */
export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,

    // --- No broad capture ---
    autocapture: false, // no automatic click/DOM/input capture
    capture_pageview: false, // we send semantic events, not raw pageviews
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_performance: false, // no web-vitals / network performance capture
    capture_heatmaps: false,

    // --- Feature flags off (analytics-only scope). Also drops the /decide
    //     network round-trip. Flip this if we later enable PostHog flags. ---
    advanced_disable_decide: true,

    // --- Privacy posture ---
    person_profiles: 'identified_only', // no profiles for anonymous traffic
    persistence: 'localStorage', // avoid analytics cookies
    cross_subdomain_cookie: false,
    ip: false, // do not record client IP

    // Strip route-embedded identifiers from every event.
    sanitize_properties: (properties) => {
      if (!properties) return properties;
      for (const key of URL_PROPERTY_DENYLIST) {
        if (key in properties) delete properties[key];
      }
      return properties;
    },
  });

  initialized = true;
}

/**
 * Associate subsequent events with a signed-in user. `userId` is the Supabase
 * auth UID. We pass NO PII (no email) as person properties — only the role, so
 * we can segment activation/engagement by role without storing identifiers.
 */
export function identifyUser(userId: string, role?: string): void {
  if (!initialized) return;
  posthog.identify(userId, role ? { role } : undefined);
}

/** Clear the identified person on sign-out so the next user starts clean. */
export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

// ---------------------------------------------------------------------------
// Event catalogue — the tracking plan, expressed as types.
// Adding an event means adding it here; nothing else can be sent.
// Properties are IDs, enums, and counts only — never free text.
// ---------------------------------------------------------------------------

export interface AnalyticsEventProperties {
  signup_completed: { role: string; has_invite: boolean };
  onboarding_completed: { steps_completed: number; created_first_project: boolean };
  project_created: { project_kind: 'date' | 'checkpoint'; from_template: boolean };
  template_cloned: { template_id: string; cloned_from_template_version?: number; task_count: number };
  task_status_changed: {
    project_id: string;
    from_status: string;
    to_status: string;
    depth: number;
  };
  task_created: { project_id: string; depth: number; origin: 'template' | 'instance' };
  project_progress_snapshot: { project_id: string; pct_complete: number; overdue_count: number };
  member_invited: { project_id: string; role: string };
  member_joined: { project_id: string; role: string };
  tasks_view_opened: { range_filter: string; overdue_count: number };
  report_viewed: { project_id: string };
  gantt_opened: { project_id: string };
  ics_feed_generated: Record<string, never>;
  notification_pref_changed: { channel: string; cadence: string };
}

export type AnalyticsEvent = keyof AnalyticsEventProperties;

/**
 * The single, type-safe entry point for emitting analytics. The event name is
 * constrained to `AnalyticsEvent` and its properties to the matching shape, so
 * ad-hoc or mistyped events fail at compile time. No-op when analytics is
 * uninitialized (no key configured).
 */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  if (import.meta.env.DEV) console.debug('[analytics]', event, properties);
  if (!initialized) return;
  posthog.capture(event, properties);
}
