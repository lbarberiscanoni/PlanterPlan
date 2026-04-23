/**
 * Vitest exercise of the Deno edge-fn `_shared/auth.ts` helpers:
 * `isServiceRoleRequest` + `requireServiceRole`. The module references
 * `Deno.env.get` at call time, so we stub it on `globalThis` before
 * each test. Matches the pattern used by `date.test.ts` in this folder.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

type EnvGetter = (key: string) => string | undefined;
type DenoShim = { env: { get: EnvGetter } };

const originalDeno = (globalThis as unknown as { Deno?: DenoShim }).Deno;

function setEnv(env: Record<string, string | undefined>) {
    (globalThis as unknown as { Deno: DenoShim }).Deno = {
        env: { get: (k: string) => env[k] },
    };
}

afterAll(() => {
    if (originalDeno === undefined) {
        delete (globalThis as unknown as { Deno?: DenoShim }).Deno;
    } else {
        (globalThis as unknown as { Deno: DenoShim }).Deno = originalDeno;
    }
});

const SERVICE_KEY = 'sbp-test-service-role-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// Dynamically import AFTER Deno is stubbed so the top-level env lookups
// (if any) see our shim. Each test can re-set env and re-import via the
// module cache; we use `beforeEach` to reset state.
async function loadAuth() {
    const mod = await import('../../../../../supabase/functions/_shared/auth');
    return mod;
}

describe('isServiceRoleRequest', () => {
    beforeEach(() => {
        setEnv({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
    });

    it('returns true for a matching Bearer <service-key>', async () => {
        const { isServiceRoleRequest } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        expect(isServiceRoleRequest(req)).toBe(true);
    });

    it('returns false for a mismatched key', async () => {
        const { isServiceRoleRequest } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: 'Bearer definitely-not-the-key' },
        });
        expect(isServiceRoleRequest(req)).toBe(false);
    });

    it('returns false for a key that differs only in length (length short-circuit)', async () => {
        const { isServiceRoleRequest } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: `Bearer ${SERVICE_KEY}x` },
        });
        expect(isServiceRoleRequest(req)).toBe(false);
    });

    it('returns false when the Authorization header is missing', async () => {
        const { isServiceRoleRequest } = await loadAuth();
        const req = new Request('https://example.invalid');
        expect(isServiceRoleRequest(req)).toBe(false);
    });

    it('returns false when SUPABASE_SERVICE_ROLE_KEY is not configured', async () => {
        setEnv({});
        const { isServiceRoleRequest } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        expect(isServiceRoleRequest(req)).toBe(false);
    });
});

describe('requireServiceRole', () => {
    beforeEach(() => {
        setEnv({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
    });

    it('returns null (continue) for a matching bearer', async () => {
        const { requireServiceRole } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        expect(requireServiceRole(req)).toBeNull();
    });

    it('returns 403 Forbidden for a mismatched bearer', async () => {
        const { requireServiceRole } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: 'Bearer wrong' },
        });
        const res = requireServiceRole(req);
        expect(res).toBeInstanceOf(Response);
        expect(res?.status).toBe(403);
    });

    it('returns 500 Server misconfigured when the env var is missing', async () => {
        setEnv({});
        const { requireServiceRole } = await loadAuth();
        const req = new Request('https://example.invalid', {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        const res = requireServiceRole(req);
        expect(res).toBeInstanceOf(Response);
        expect(res?.status).toBe(500);
    });
});
