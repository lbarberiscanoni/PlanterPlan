/**
 * Wave-follow-up security helper — resource URL sanitization.
 *
 * Blocks stored-XSS via `javascript:` / `data:` / `vbscript:` schemes on
 * user-supplied `task_resources.resource_url` values. React escapes element
 * text but an anchor's `href` attribute is passed through verbatim; a click
 * on `<a href="javascript:alert(document.cookie)">` runs attacker JS in the
 * viewer's origin with session-cookie access. The `type="url"` input
 * validates at form submit time but can be bypassed by anyone with a
 * PostgREST client (e.g., `planter.entities.TaskResource.create(...)`),
 * so we sanitize at the API boundary too via {@link assertSafeUrl}.
 */

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// Purely synthetic base used when parsing candidate URLs server-side (no
// `window` available). Its only job is to let `new URL()` accept relative
// paths like `/docs/guide.pdf` without throwing. Absolute URLs — including
// dangerous schemes like `javascript:` — ignore the base entirely, so the
// scheme check below still fires.
const PLACEHOLDER_BASE = 'https://planterplan.invalid';

/**
 * Returns a safe href string when the scheme is one of the allowed values,
 * or `'#'` for anything else (including malformed inputs, relative paths
 * that resolve to a disallowed scheme, etc.). Never throws.
 *
 * @param url Candidate URL string. Accepts `null`/`undefined`.
 * @returns A safe href string. `'#'` when the input is unsafe or invalid.
 */
export function safeUrl(url: string | null | undefined): string {
    if (typeof url !== 'string' || url.trim() === '') return '#';
    try {
        // Prefer the real origin in the browser so relative paths resolve to
        // the app's own host; fall back to the placeholder base server-side
        // (SSR, edge, tests without a jsdom `window`).
        const base = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : PLACEHOLDER_BASE;
        const parsed = new URL(url, base);
        if (!ALLOWED_SCHEMES.has(parsed.protocol)) return '#';
        return parsed.toString();
    } catch {
        return '#';
    }
}

/**
 * Server-boundary companion to {@link safeUrl}. Throws (via the `onUnsafe`
 * callback) when the URL's scheme is outside the allowlist or the input is
 * unparseable; returns quietly on `null` / `undefined` / empty inputs so
 * UPDATE payloads that don't touch `resource_url` are no-ops.
 *
 * Uses the same placeholder-base parse as `safeUrl` so relative paths like
 * `/docs/guide.pdf` (which the render layer resolves against the app origin)
 * are accepted by the API too — otherwise the two layers would disagree on
 * what "safe" means and legitimate inputs would fail validation at write
 * time but succeed at render time.
 */
export function assertSafeUrl(
    urlCandidate: unknown,
    onUnsafe: (reason: string) => Error,
): void {
    if (typeof urlCandidate !== 'string' || urlCandidate.trim() === '') return;
    let parsed: URL;
    try {
        parsed = new URL(urlCandidate, PLACEHOLDER_BASE);
    } catch {
        throw onUnsafe('Invalid resource_url format');
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        throw onUnsafe(`Unsafe resource_url scheme: ${parsed.protocol}`);
    }
}
