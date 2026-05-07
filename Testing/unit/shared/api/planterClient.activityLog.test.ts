import { describe, it, expect, vi, beforeEach } from 'vitest';

function createChain(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'is', 'in', 'lt', 'or', 'order', 'range', 'limit',
        'maybeSingle', 'single', 'abortSignal', 'overrideTypes',
    ];
    for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
    }
    (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (resolve: (v: unknown) => void) =>
        resolve(resolvedValue);
    return chain;
}

const mockFrom = vi.fn();
vi.mock('@/shared/db/client', () => ({
    supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('@/shared/lib/retry', () => ({ retry: (fn: () => unknown) => fn() }));
vi.mock('@/shared/lib/date-engine', () => ({
    toIsoDate: (v: unknown) => (v ? String(v) : null),
    nowUtcIso: () => '2026-04-18T12:00:00.000Z',
    calculateMinMaxDates: vi.fn().mockReturnValue({ start_date: null, due_date: null }),
}));

import { planter } from '@/shared/api/planterClient';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('planter.entities.ActivityLog (Wave 27)', () => {
    describe('listByProject', () => {
        it('selects with actor join, filters by project_id, orders newest-first, limit 50 default', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);

            await planter.entities.ActivityLog.listByProject('p1');

            expect(mockFrom).toHaveBeenCalledWith('activity_log');
            expect(chain.select).toHaveBeenCalledWith('*, actor:users(id, email, user_metadata)');
            expect(chain.eq).toHaveBeenCalledWith('project_id', 'p1');
            expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
            expect(chain.limit).toHaveBeenCalledWith(50);
        });

        it('applies custom limit', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByProject('p1', { limit: 25 });
            expect(chain.limit).toHaveBeenCalledWith(25);
        });

        it('applies the `before` cursor via lt("created_at", before)', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByProject('p1', { before: '2026-04-18T09:00:00.000Z' });
            expect(chain.lt).toHaveBeenCalledWith('created_at', '2026-04-18T09:00:00.000Z');
        });

        it('applies entityTypes filter via `in` when provided', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByProject('p1', { entityTypes: ['task', 'comment'] });
            expect(chain.in).toHaveBeenCalledWith('entity_type', ['task', 'comment']);
        });

        it('does NOT apply the entityTypes filter when the array is empty', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByProject('p1', { entityTypes: [] });
            expect(chain.in).not.toHaveBeenCalled();
        });

        it('returns [] on null data', async () => {
            const chain = createChain({ data: null, error: null });
            mockFrom.mockReturnValue(chain);
            const rows = await planter.entities.ActivityLog.listByProject('p1');
            expect(rows).toEqual([]);
        });
    });

    describe('listByEntity', () => {
        it('filters entity_type + entity_id, orders newest-first, limit 20 default', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByEntity('task', 't1');
            expect(chain.eq).toHaveBeenCalledWith('entity_type', 'task');
            expect(chain.eq).toHaveBeenCalledWith('entity_id', 't1');
            expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
            expect(chain.limit).toHaveBeenCalledWith(20);
        });

        it('respects custom limit', async () => {
            const chain = createChain({ data: [], error: null });
            mockFrom.mockReturnValue(chain);
            await planter.entities.ActivityLog.listByEntity('comment', 'c1', { limit: 5 });
            expect(chain.limit).toHaveBeenCalledWith(5);
        });
    });
});
