import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    dispatchPendingMentions,
    type EmailSender,
    type PushInvoker,
    type SupabaseLike,
    type SelectFilter,
    type UpdateFilter,
} from '../../../../supabase/functions/dispatch-notifications/dispatch';

// ----------------------------------------------------------------------------
// Fake Supabase client tailored to this dispatcher.
//
// Shape the fake must support:
//   .from('notification_log').select('...').eq('event_type', 'mention_pending').limit(N)
//   .from('notification_preferences').select('...').in('user_id', [...])
//   .from('users_public').select('...').in('id', [...])
//   .from('notification_log').update({...}).eq('id', $1).eq('event_type', $2).select()
//
// Each chain terminator is awaited directly (no `.then((r) => r)` boilerplate).
// We model this as thenable builder nodes whose final `await` returns `{ data, error }`.
// ----------------------------------------------------------------------------

interface LogRow {
    id: string;
    user_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    sent_at?: string;
    provider_id?: string | null;
    error?: string | null;
}

interface PrefsRow {
    user_id: string;
    email_mentions: boolean;
    push_mentions: boolean;
    push_overdue: boolean;
    push_assignment: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
}

interface UserPublicRow {
    id: string;
    email: string | null;
}

interface FakeDb {
    notification_log: LogRow[];
    notification_preferences: PrefsRow[];
    users_public: UserPublicRow[];
}

function chainSelect<T>(rows: T[]): SelectFilter<T> {
    let filtered = rows.slice();
    const filters: Array<(r: T) => boolean> = [];

    const applyFilters = () => filtered.filter((row) => filters.every((f) => f(row)));

    const node: SelectFilter<T> = {
        eq(col: string, value: string) {
            filters.push((r) => (r as Record<string, unknown>)[col] === value);
            return node;
        },
        in(col: string, values: string[]) {
            const set = new Set(values);
            filters.push((r) => set.has((r as Record<string, unknown>)[col] as string));
            return node;
        },
        limit(n: number) {
            filtered = applyFilters().slice(0, n);
            // Short-circuit the subsequent filter state so `then` uses the sliced snapshot.
            filters.length = 0;
            return node;
        },
        then<TResult1, TResult2 = never>(
            onfulfilled?: ((v: { data: T[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
            const data = filters.length ? applyFilters() : filtered;
            const resolved = Promise.resolve({ data, error: null });
            return resolved.then(onfulfilled, onrejected);
        },
    };

    return node;
}

function chainUpdate(
    target: LogRow[],
    patch: Record<string, unknown>,
): UpdateFilter<LogRow> {
    const conditions: Array<{ col: string; value: unknown }> = [];

    const node: UpdateFilter<LogRow> = {
        eq(col: string, value: string) {
            conditions.push({ col, value });
            return node;
        },
        select() {
            return node;
        },
        then<TResult1, TResult2 = never>(
            onfulfilled?: ((v: { data: LogRow[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
            const matching: LogRow[] = [];
            for (const row of target) {
                const hit = conditions.every((c) => (row as unknown as Record<string, unknown>)[c.col] === c.value);
                if (!hit) continue;
                Object.assign(row, patch);
                matching.push({ ...row });
            }
            const resolved = Promise.resolve({ data: matching, error: null });
            return resolved.then(onfulfilled, onrejected);
        },
    };

    return node;
}

function makeSupabase(db: FakeDb): SupabaseLike {
    return {
        from: (table: string) => ({
            select: <T>(cols: string) => {
                void cols;
                if (table === 'notification_log') return chainSelect<T>(db.notification_log as unknown as T[]);
                if (table === 'notification_preferences') return chainSelect<T>(db.notification_preferences as unknown as T[]);
                if (table === 'users_public') return chainSelect<T>(db.users_public as unknown as T[]);
                return chainSelect<T>([]);
            },
            update: <T>(patch: Record<string, unknown>) => {
                if (table === 'notification_log') return chainUpdate(db.notification_log, patch) as unknown as UpdateFilter<T>;
                // Other tables: no-op chain.
                return chainUpdate([], patch) as unknown as UpdateFilter<T>;
            },
        }),
    };
}

const baseNow = new Date('2026-04-20T12:00:00Z');

function basePrefs(overrides: Partial<PrefsRow> = {}): PrefsRow {
    return {
        user_id: 'u-1',
        email_mentions: true,
        push_mentions: true,
        push_overdue: true,
        push_assignment: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        timezone: 'UTC',
        ...overrides,
    };
}

function basePending(overrides: Partial<LogRow> = {}): LogRow {
    return {
        id: 'log-1',
        user_id: 'u-1',
        event_type: 'mention_pending',
        payload: {
            recipient_id: 'u-1',
            actor_id: 'u-other',
            author_id: 'u-other',
            comment_id: 'c-1',
            task_id: 't-1',
            project_id: 'p-1',
            root_id: 'p-1',
            body_preview: 'Hello',
        },
        ...overrides,
    };
}

describe('dispatchPendingMentions (Wave 30 Task 3)', () => {
    let emailSender: ReturnType<typeof vi.fn<EmailSender>>;
    let pushInvoker: ReturnType<typeof vi.fn<PushInvoker>>;

    beforeEach(() => {
        emailSender = vi.fn<EmailSender>().mockResolvedValue({ ok: true, id: 'resend-msg-1' });
        pushInvoker = vi.fn<PushInvoker>().mockResolvedValue({ ok: true, sent: 1, skipped: 0, failed: 0 });
    });

    it('returns zero summary when there are no pending rows', async () => {
        const db: FakeDb = { notification_log: [], notification_preferences: [], users_public: [] };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary).toEqual({ claimed: 0, sent_email: 0, sent_push: 0, skipped: 0, failed: 0 });
        expect(emailSender).not.toHaveBeenCalled();
        expect(pushInvoker).not.toHaveBeenCalled();
    });

    it('delivers email + push when both prefs are true, transitions to mention_sent', async () => {
        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs()],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.claimed).toBe(1);
        expect(summary.sent_email).toBe(1);
        expect(summary.sent_push).toBe(1);
        expect(emailSender).toHaveBeenCalledOnce();
        expect(pushInvoker).toHaveBeenCalledOnce();
        expect(pushInvoker).toHaveBeenCalledWith(expect.objectContaining({ url: '/project/p-1' }));
        expect(db.notification_log[0].event_type).toBe('mention_sent');
        expect(db.notification_log[0].provider_id).toBe('resend-msg-1');
    });

    it('uses project_id from the hardened mention payload when root_id is absent', async () => {
        const db: FakeDb = {
            notification_log: [basePending({
                payload: {
                    recipient_id: 'u-1',
                    actor_id: 'u-other',
                    author_id: 'u-other',
                    comment_id: 'c-1',
                    task_id: 't-1',
                    project_id: 'project-from-payload',
                    body_preview: 'Hello',
                },
            })],
            notification_preferences: [basePrefs({ email_mentions: false, push_mentions: true })],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(pushInvoker).toHaveBeenCalledWith(expect.objectContaining({ url: '/project/project-from-payload' }));
    });

    it('skips to mention_skipped with pref_disabled when both email and push are off', async () => {
        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs({ email_mentions: false, push_mentions: false })],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.skipped).toBe(1);
        expect(summary.sent_email).toBe(0);
        expect(summary.sent_push).toBe(0);
        expect(db.notification_log[0].event_type).toBe('mention_skipped');
        expect(db.notification_log[0].error).toBe('pref_disabled');
        expect(emailSender).not.toHaveBeenCalled();
        expect(pushInvoker).not.toHaveBeenCalled();
    });

    it('skips to mention_skipped with quiet_hours when local-now is in the window', async () => {
        // 08:00–20:00 UTC; baseNow 12:00 UTC ⇒ in window.
        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs({
                quiet_hours_start: '08:00:00',
                quiet_hours_end: '20:00:00',
                timezone: 'UTC',
            })],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.skipped).toBe(1);
        expect(db.notification_log[0].event_type).toBe('mention_skipped');
        expect(db.notification_log[0].error).toBe('quiet_hours');
        expect(emailSender).not.toHaveBeenCalled();
        expect(pushInvoker).not.toHaveBeenCalled();
    });

    it('delivers push only when email_mentions is false', async () => {
        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs({ email_mentions: false })],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.sent_push).toBe(1);
        expect(summary.sent_email).toBe(0);
        expect(emailSender).not.toHaveBeenCalled();
        expect(pushInvoker).toHaveBeenCalledOnce();
        expect(db.notification_log[0].event_type).toBe('mention_sent');
    });

    it('terminal state is mention_failed when every enabled transport fails', async () => {
        emailSender.mockResolvedValueOnce({ ok: false, error: 'boom' });
        pushInvoker.mockResolvedValueOnce({ ok: false, error: 'boom' });

        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs()],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.failed).toBe(1);
        expect(summary.sent_email).toBe(0);
        expect(summary.sent_push).toBe(0);
        expect(db.notification_log[0].event_type).toBe('mention_failed');
        expect(db.notification_log[0].error).toContain('email:boom');
        expect(db.notification_log[0].error).toContain('push:boom');
    });

    it('does not mark push-only mentions sent when the push function delivered nothing', async () => {
        pushInvoker.mockResolvedValueOnce({ ok: false, sent: 0, skipped: 1, failed: 0, error: 'no_subscription' });

        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs({ email_mentions: false, push_mentions: true })],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        const summary = await dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker);

        expect(summary.failed).toBe(1);
        expect(summary.sent_push).toBe(0);
        expect(db.notification_log[0].event_type).toBe('mention_failed');
        expect(db.notification_log[0].error).toContain('push:no_subscription');
    });

    it('does not dispatch the row twice under concurrent invocations (idempotency)', async () => {
        const db: FakeDb = {
            notification_log: [basePending()],
            notification_preferences: [basePrefs()],
            users_public: [{ id: 'u-1', email: 'u1@example.com' }],
        };
        const supabase = makeSupabase(db);

        // Simulate two overlapping cron ticks. The first wins the UPDATE...WHERE;
        // the second finds `event_type` is already 'mention_processing' (or beyond)
        // and its claim returns zero rows.
        const [firstSummary, secondSummary] = await Promise.all([
            dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker),
            dispatchPendingMentions(supabase, baseNow, emailSender, pushInvoker),
        ]);

        const totalClaims = firstSummary.claimed + secondSummary.claimed;
        const totalEmails = firstSummary.sent_email + secondSummary.sent_email;
        const totalPushes = firstSummary.sent_push + secondSummary.sent_push;

        expect(totalClaims).toBe(1);
        expect(totalEmails).toBe(1);
        expect(totalPushes).toBe(1);
        expect(db.notification_log[0].event_type).toBe('mention_sent');
    });
});
