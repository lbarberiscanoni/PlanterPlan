import { describe, expect, it } from 'vitest';
import {
    handleIcsFeedRequest,
    type IcsSupabaseLike,
    type IcsTokenRow,
} from '@/../supabase/functions/ics-feed/handler';
import type { IcsTaskRow } from '@/../supabase/functions/ics-feed/ics';

interface TokenRow extends IcsTokenRow {
    token: string;
    label: string | null;
    last_accessed_at: string | null;
}

interface TaskRow extends IcsTaskRow {
    assignee_id: string | null;
}

interface FakeDb {
    tokens: TokenRow[];
    tasks: TaskRow[];
    memberships: Array<{ user_id: string; project_id: string }>;
}

type DbRow = Record<string, unknown>;
type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

function selectChain<T>(rows: DbRow[]) {
    let base = rows.slice();
    const filters: Array<(row: DbRow) => boolean> = [];

    const applyFilters = () => base.filter((row) => filters.every((filter) => filter(row))) as T[];
    const resetTo = (rowsAfterOperation: DbRow[]) => {
        base = rowsAfterOperation;
        filters.length = 0;
    };

    const chain = {
        eq(col: string, value: string) {
            filters.push((row) => row[col] === value);
            return chain;
        },
        not(col: string, op: string, value: unknown) {
            if (op === 'is' && value === null) filters.push((row) => row[col] !== null);
            return chain;
        },
        gte(col: string, value: string) {
            filters.push((row) => String(row[col] ?? '') >= value);
            return chain;
        },
        order(col: string, opts: { ascending: boolean }) {
            const sorted = applyFilters().slice().sort((a, b) => {
                const aValue = String((a as DbRow)[col] ?? '');
                const bValue = String((b as DbRow)[col] ?? '');
                return opts.ascending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            }) as unknown as DbRow[];
            resetTo(sorted);
            return chain;
        },
        limit(n: number) {
            resetTo(applyFilters().slice(0, n) as unknown as DbRow[]);
            return chain;
        },
        in(col: string, values: string[]) {
            const allowed = new Set(values);
            filters.push((row) => allowed.has(String(row[col] ?? '')));
            return chain;
        },
        async maybeSingle() {
            return { data: applyFilters()[0] ?? null, error: null };
        },
        then<TResult1, TResult2 = never>(
            onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
            return Promise.resolve({ data: applyFilters(), error: null }).then(onfulfilled, onrejected);
        },
    };

    return chain;
}

function updateChain<T>(tokens: TokenRow[], patch: Record<string, unknown>) {
    const conditions: Array<{ col: string; value: string }> = [];

    const chain = {
        eq(col: string, value: string) {
            conditions.push({ col, value });
            return chain;
        },
        then<TResult1, TResult2 = never>(
            onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
            const updated: TokenRow[] = [];
            for (const token of tokens) {
                const hit = conditions.every((condition) => token[condition.col as keyof TokenRow] === condition.value);
                if (!hit) continue;
                Object.assign(token, patch);
                updated.push({ ...token });
            }
            return Promise.resolve({ data: updated as unknown as T[], error: null }).then(onfulfilled, onrejected);
        },
    };

    return chain;
}

function makeSupabase(db: FakeDb): IcsSupabaseLike {
    return {
        from(table: string) {
            return {
                select<T>() {
                    if (table === 'ics_feed_tokens') return selectChain<T>(db.tokens as unknown as DbRow[]);
                    if (table === 'tasks') return selectChain<T>(db.tasks as unknown as DbRow[]);
                    if (table === 'project_members') return selectChain<T>(db.memberships as unknown as DbRow[]);
                    return selectChain<T>([]);
                },
                update<T>(patch: Record<string, unknown>) {
                    if (table === 'ics_feed_tokens') return updateChain<T>(db.tokens, patch);
                    return updateChain<T>([], patch);
                },
            };
        },
    };
}

function requestFor(token: string) {
    return new Request(`https://example.test/functions/v1/ics-feed?token=${token}`);
}

const NOW = new Date('2026-04-22T12:00:00.000Z');

function task(overrides: Partial<TaskRow>): TaskRow {
    return {
        id: 'task-1',
        title: 'Task',
        description: null,
        due_date: '2026-04-25',
        start_date: null,
        status: 'todo',
        root_id: 'project-a',
        assignee_id: 'user-1',
        ...overrides,
    };
}

function token(overrides: Partial<TokenRow>): TokenRow {
    return {
        id: 'token-1',
        user_id: 'user-1',
        token: 'active-token-00000000000000000000000000000000',
        label: null,
        project_filter: null,
        revoked_at: null,
        last_accessed_at: null,
        ...overrides,
    };
}

describe('handleIcsFeedRequest', () => {
    it('returns only tasks assigned to the token owner', async () => {
        const db: FakeDb = {
            tokens: [token({})],
            memberships: [{ user_id: 'user-1', project_id: 'project-a' }],
            tasks: [
                task({ id: 'owner-task', title: 'Owner task', assignee_id: 'user-1' }),
                task({ id: 'other-task', title: 'Other user task', assignee_id: 'user-2' }),
            ],
        };

        const response = await handleIcsFeedRequest(requestFor(db.tokens[0].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
        expect(body).toContain('UID:task-owner-task@planterplan');
        expect(body).not.toContain('UID:task-other-task@planterplan');
        expect(db.tokens[0].last_accessed_at).toBe(NOW.toISOString());
    });

    it('returns 404 for revoked tokens', async () => {
        const db: FakeDb = {
            tokens: [token({ revoked_at: '2026-04-22T00:00:00.000Z' })],
            memberships: [{ user_id: 'user-1', project_id: 'project-a' }],
            tasks: [task({ id: 'owner-task' })],
        };

        const response = await handleIcsFeedRequest(requestFor(db.tokens[0].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });

        expect(response.status).toBe(404);
        expect(db.tokens[0].last_accessed_at).toBeNull();
    });

    it('treats a rotated old token as revoked while the replacement token works', async () => {
        const db: FakeDb = {
            tokens: [
                token({
                    id: 'old-token',
                    token: 'old-token-000000000000000000000000000000000',
                    revoked_at: '2026-04-22T00:00:00.000Z',
                }),
                token({
                    id: 'new-token',
                    token: 'new-token-000000000000000000000000000000000',
                    revoked_at: null,
                }),
            ],
            memberships: [{ user_id: 'user-1', project_id: 'project-a' }],
            tasks: [task({ id: 'owner-task' })],
        };

        const oldResponse = await handleIcsFeedRequest(requestFor(db.tokens[0].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });
        const newResponse = await handleIcsFeedRequest(requestFor(db.tokens[1].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });

        expect(oldResponse.status).toBe(404);
        expect(newResponse.status).toBe(200);
        await expect(newResponse.text()).resolves.toContain('UID:task-owner-task@planterplan');
    });

    it('honors token project filters', async () => {
        const db: FakeDb = {
            tokens: [token({ project_filter: ['project-a'] })],
            memberships: [
                { user_id: 'user-1', project_id: 'project-a' },
                { user_id: 'user-1', project_id: 'project-b' },
            ],
            tasks: [
                task({ id: 'project-a-task', title: 'Allowed project', root_id: 'project-a' }),
                task({ id: 'project-b-task', title: 'Filtered project', root_id: 'project-b' }),
            ],
        };

        const response = await handleIcsFeedRequest(requestFor(db.tokens[0].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('UID:task-project-a-task@planterplan');
        expect(body).not.toContain('UID:task-project-b-task@planterplan');
    });

    it('excludes assigned tasks from projects where the token owner is no longer a member', async () => {
        const db: FakeDb = {
            tokens: [token({})],
            memberships: [{ user_id: 'user-1', project_id: 'project-a' }],
            tasks: [
                task({ id: 'member-task', title: 'Member project', root_id: 'project-a' }),
                task({ id: 'removed-task', title: 'Removed project', root_id: 'project-b' }),
            ],
        };

        const response = await handleIcsFeedRequest(requestFor(db.tokens[0].token), {
            supabase: makeSupabase(db),
            now: NOW,
        });
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain('UID:task-member-task@planterplan');
        expect(body).not.toContain('UID:task-removed-task@planterplan');
    });
});
