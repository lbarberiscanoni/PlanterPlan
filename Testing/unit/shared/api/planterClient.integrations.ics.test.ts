import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable Supabase stub. Mirrors the pattern used in
// planterClient.test.ts — simple builder that returns the final resolved
// { data, error } when awaited via Thenable `.then()` shim.
function makeChain(resolved: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        single: vi.fn(() => chain),
        then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved),
    };
    return chain;
}

const fromMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/shared/db/client', () => ({
    supabase: {
        from: (...args: unknown[]) => fromMock(...args),
        auth: {
            getUser: () => getUserMock(),
        },
    },
}));

import { planter } from '@/shared/api/planterClient';

describe('planter.integrations.ics (Wave 35)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    });

    it('listIcsFeedTokens returns rows scoped to the caller', async () => {
        fromMock.mockReturnValue(
            makeChain({
                data: [
                    {
                        id: 't1',
                        user_id: 'user-1',
                        token: 'abc',
                        label: null,
                        project_filter: null,
                        created_at: '2026-04-22T00:00:00Z',
                        revoked_at: null,
                        last_accessed_at: null,
                    },
                ],
                error: null,
            }),
        );
        const rows = await planter.integrations.listIcsFeedTokens();
        expect(fromMock).toHaveBeenCalledWith('ics_feed_tokens');
        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe('user-1');
    });

    it('createIcsFeedToken inserts a row with a crypto-random token', async () => {
        const chain = makeChain({
            data: {
                id: 'new-id',
                user_id: 'user-1',
                token: 'deadbeef'.repeat(8),
                label: 'work',
                project_filter: null,
                created_at: '2026-04-22T00:00:00Z',
                revoked_at: null,
                last_accessed_at: null,
            },
            error: null,
        });
        fromMock.mockReturnValue(chain);

        const row = await planter.integrations.createIcsFeedToken({ label: 'work', project_filter: null });
        expect(fromMock).toHaveBeenCalledWith('ics_feed_tokens');
        expect(chain.insert).toHaveBeenCalledTimes(1);
        const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
        expect(insertArg.user_id).toBe('user-1');
        expect(typeof insertArg.token).toBe('string');
        expect((insertArg.token as string).length).toBeGreaterThanOrEqual(32);
        expect(row.id).toBe('new-id');
    });

    it('revokeIcsFeedToken updates revoked_at and returns the row', async () => {
        const chain = makeChain({
            data: {
                id: 't2',
                user_id: 'user-1',
                token: 't',
                label: null,
                project_filter: null,
                created_at: '2026-04-22T00:00:00Z',
                revoked_at: '2026-04-22T12:00:00Z',
                last_accessed_at: null,
            },
            error: null,
        });
        fromMock.mockReturnValue(chain);

        const row = await planter.integrations.revokeIcsFeedToken('t2');
        expect(chain.update).toHaveBeenCalledTimes(1);
        const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
        expect(typeof updateArg.revoked_at).toBe('string');
        expect(row.revoked_at).toBe('2026-04-22T12:00:00Z');
    });

    it('createIcsFeedToken bubbles Supabase errors through PlanterError', async () => {
        fromMock.mockReturnValue(
            makeChain({
                data: null,
                error: { message: 'rls denied', code: '42501' },
            }),
        );
        await expect(planter.integrations.createIcsFeedToken({})).rejects.toThrow(/rls denied/);
    });
});
