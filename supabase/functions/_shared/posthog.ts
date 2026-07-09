// Server-side PostHog capture for edge functions.
//
// Mirrors the client's privacy-first posture (src/shared/analytics/posthog.ts):
// custom events only, no PII in properties, and `$process_person_profile: false`
// so we never eagerly create person profiles — the browser client owns identity
// via `identify()` (person_profiles: 'identified_only'). A snapshot event keyed
// by project_id therefore won't spawn a junk "person" for that id, and a
// user-scoped event (member_joined) still links to the real user id and picks
// up its profile once that user logs in.
//
// Config: POSTHOG_KEY (publishable phc_… project key) + optional POSTHOG_HOST
// (defaults to US cloud), set as Supabase function secrets:
//   supabase secrets set POSTHOG_KEY=phc_... POSTHOG_HOST=https://us.i.posthog.com
// No-ops entirely when POSTHOG_KEY is unset, so existing behavior is unaffected.

const POSTHOG_HOST = (Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com').replace(/\/$/, '');
const POSTHOG_KEY = Deno.env.get('POSTHOG_KEY');

/**
 * Send one custom event to PostHog's capture API. Never throws — analytics must
 * not break the dispatcher that calls it. Awaitable so the caller can ensure
 * delivery before the (stateless) edge function terminates.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!POSTHOG_KEY || !distinctId) return;
  try {
    const res = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $process_person_profile: false },
      }),
    });
    if (!res.ok) {
      console.error('[posthog] capture non-2xx', { event, status: res.status });
    }
  } catch (err) {
    console.error('[posthog] capture failed', { event, message: (err as Error)?.message });
  }
}
