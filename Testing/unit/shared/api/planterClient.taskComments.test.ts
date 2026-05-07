import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — chainable query builder (same pattern as planterClient.test.ts)
// ---------------------------------------------------------------------------

function createChain(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'is', 'or', 'order', 'range', 'limit',
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
const mockRpc = vi.fn();

vi.mock('@/shared/db/client', () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
        rpc: (...args: unknown[]) => mockRpc(...args),
    },
}));

vi.mock('@/shared/lib/retry', () => ({
    retry: (fn: () => unknown) => fn(),
}));

vi.mock('@/shared/lib/date-engine', () => ({
    toIsoDate: (v: unknown) => (v ? String(v) : null),
    nowUtcIso: () => '2026-04-18T12:00:00.000Z',
    calculateMinMaxDates: vi.fn().mockReturnValue({ start_date: null, due_date: null }),
}));

import { planter } from '@/shared/api/planterClient';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('planter.entities.TaskComment (Wave 26)', () => {
    describe('listByTask', () => {
        it('uses the gated comment author hydration RPC instead of a cross-schema author join', async () => {
            mockRpc.mockResolvedValueOnce({ data: [], error: null });

            await planter.entities.TaskComment.listByTask('task-1');

            expect(mockRpc).toHaveBeenCalledWith('list_task_comments_with_authors', {
                p_task_id: 'task-1',
                p_comment_id: null,
            });
            expect(mockFrom).not.toHaveBeenCalledWith('task_comments');
        });

        it('does NOT filter out soft-deleted rows (tombstones preserve thread lineage; body is already blanked)', async () => {
            mockRpc.mockResolvedValueOnce({ data: [], error: null });

            await planter.entities.TaskComment.listByTask('task-1');

            expect(mockRpc).toHaveBeenCalledWith('list_task_comments_with_authors', {
                p_task_id: 'task-1',
                p_comment_id: null,
            });
        });

        it('returns [] when Supabase returns null data without error', async () => {
            mockRpc.mockResolvedValueOnce({ data: null, error: null });
            const rows = await planter.entities.TaskComment.listByTask('task-1');
            expect(rows).toEqual([]);
        });

        it('normalizes hydrated author DTOs from the RPC', async () => {
            mockRpc.mockResolvedValueOnce({
                data: [{
                    id: 'c1',
                    task_id: 'task-1',
                    root_id: 'project-1',
                    parent_comment_id: null,
                    author_id: 'u1',
                    body: 'hi',
                    mentions: [],
                    created_at: '2026-04-18T12:00:00.000Z',
                    updated_at: '2026-04-18T12:00:00.000Z',
                    edited_at: null,
                    deleted_at: null,
                    author: {
                        id: 'u1',
                        email: 'user@example.test',
                        user_metadata: { full_name: 'User One' },
                    },
                }],
                error: null,
            });

            const rows = await planter.entities.TaskComment.listByTask('task-1');

            expect(rows[0]?.author).toEqual({
                id: 'u1',
                email: 'user@example.test',
                user_metadata: { full_name: 'User One' },
            });
        });

        it('keeps deleted/anonymized authors as intentional null authors', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            mockRpc.mockResolvedValueOnce({
                data: [{
                    id: 'c-deleted',
                    task_id: 'task-1',
                    root_id: 'project-1',
                    parent_comment_id: null,
                    author_id: null,
                    body: 'historical',
                    mentions: [],
                    created_at: '2026-04-18T12:00:00.000Z',
                    updated_at: '2026-04-18T12:00:00.000Z',
                    edited_at: null,
                    deleted_at: null,
                    author: null,
                }],
                error: null,
            });

            const rows = await planter.entities.TaskComment.listByTask('task-1');

            expect(rows[0]?.author).toBeNull();
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('warns and nulls impossible non-null author_id hydration misses', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            mockRpc.mockResolvedValueOnce({
                data: [{
                    id: 'c-missing-author',
                    task_id: 'task-1',
                    root_id: 'project-1',
                    parent_comment_id: null,
                    author_id: 'u1',
                    body: 'historical',
                    mentions: [],
                    created_at: '2026-04-18T12:00:00.000Z',
                    updated_at: '2026-04-18T12:00:00.000Z',
                    edited_at: null,
                    deleted_at: null,
                    author: null,
                }],
                error: null,
            });

            const rows = await planter.entities.TaskComment.listByTask('task-1');

            expect(rows[0]?.author).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                '[planter.TaskComment] author payload missing for non-null author_id',
                { commentId: 'c-missing-author', authorId: 'u1' },
            );
            warnSpy.mockRestore();
        });
    });

    describe('create', () => {
        it('inserts task_id + author_id + body + defaulted parent/mentions, then hydrates via RPC', async () => {
            const chain = createChain({
                data: { id: 'c1', task_id: 'task-1', author_id: 'u1', body: 'hi' },
                error: null,
            });
            mockFrom.mockReturnValue(chain);
            mockRpc.mockResolvedValueOnce({
                data: [{
                    id: 'c1',
                    task_id: 'task-1',
                    root_id: 'project-1',
                    parent_comment_id: null,
                    author_id: 'u1',
                    body: 'hi',
                    mentions: [],
                    created_at: '2026-04-18T12:00:00.000Z',
                    updated_at: '2026-04-18T12:00:00.000Z',
                    edited_at: null,
                    deleted_at: null,
                    author: { id: 'u1', email: 'u1@example.test', user_metadata: {} },
                }],
                error: null,
            });

            await planter.entities.TaskComment.create({
                task_id: 'task-1',
                author_id: 'u1',
                body: 'hi',
            });

            expect(chain.insert).toHaveBeenCalledWith({
                task_id: 'task-1',
                author_id: 'u1',
                parent_comment_id: null,
                body: 'hi',
                mentions: [],
            });
            expect(chain.select).toHaveBeenCalledWith('*');
            expect(chain.single).toHaveBeenCalled();
            expect(mockRpc).toHaveBeenCalledWith('list_task_comments_with_authors', {
                p_task_id: 'task-1',
                p_comment_id: 'c1',
            });
        });

        it('passes through parent_comment_id and mentions when provided', async () => {
            const chain = createChain({
                data: { id: 'c2', task_id: 'task-1', author_id: 'u1', body: 'reply body' },
                error: null,
            });
            mockFrom.mockReturnValue(chain);
            mockRpc.mockResolvedValueOnce({
                data: [{
                    id: 'c2',
                    task_id: 'task-1',
                    root_id: 'project-1',
                    parent_comment_id: 'parent-c',
                    author_id: 'u1',
                    body: 'reply body',
                    mentions: ['alice', 'bob'],
                    created_at: '2026-04-18T12:00:00.000Z',
                    updated_at: '2026-04-18T12:00:00.000Z',
                    edited_at: null,
                    deleted_at: null,
                    author: { id: 'u1', email: 'u1@example.test', user_metadata: {} },
                }],
                error: null,
            });

            await planter.entities.TaskComment.create({
                task_id: 'task-1',
                author_id: 'u1',
                parent_comment_id: 'parent-c',
                body: 'reply body',
                mentions: ['alice', 'bob'],
            });

            expect(chain.insert).toHaveBeenCalledWith({
                task_id: 'task-1',
                author_id: 'u1',
                parent_comment_id: 'parent-c',
                body: 'reply body',
                mentions: ['alice', 'bob'],
            });
        });
    });

    describe('updateBody', () => {
        it('stamps edited_at + body, keeps mentions absent when unspecified', async () => {
            const chain = createChain({ data: { id: 'c1' }, error: null });
            mockFrom.mockReturnValue(chain);

            await planter.entities.TaskComment.updateBody('c1', { body: 'edited' });

            expect(chain.update).toHaveBeenCalledWith({
                body: 'edited',
                edited_at: '2026-04-18T12:00:00.000Z',
            });
            expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
        });

        it('includes mentions when explicitly passed', async () => {
            const chain = createChain({ data: { id: 'c1' }, error: null });
            mockFrom.mockReturnValue(chain);

            await planter.entities.TaskComment.updateBody('c1', { body: 'edited', mentions: ['dee'] });

            expect(chain.update).toHaveBeenCalledWith({
                body: 'edited',
                edited_at: '2026-04-18T12:00:00.000Z',
                mentions: ['dee'],
            });
        });
    });

    describe('softDelete', () => {
        it('writes deleted_at = now() and clears body (scrubs cached payload)', async () => {
            const chain = createChain({ data: { id: 'c1' }, error: null });
            mockFrom.mockReturnValue(chain);

            await planter.entities.TaskComment.softDelete('c1');

            expect(chain.update).toHaveBeenCalledWith({
                deleted_at: '2026-04-18T12:00:00.000Z',
                body: '',
            });
            expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
        });
    });
});
