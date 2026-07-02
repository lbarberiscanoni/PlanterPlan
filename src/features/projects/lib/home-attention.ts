import { diffInCalendarDays, getNow, toIsoDate } from '@/shared/lib/date-engine';
import { TASK_STATUS } from '@/shared/constants';

/** A milestone as surfaced by `useProjectReports().milestones`. */
export interface AttentionMilestoneInput {
    id: string;
    title: string;
    due_date: string | null;
    status: string | null;
    is_complete: boolean | null;
}

export type AttentionTone = 'overdue' | 'due_soon' | 'neutral';

export interface AttentionMilestone {
    id: string;
    title: string;
    due_date: string;
    /** Calendar-day delta from today (negative = overdue). */
    diffDays: number;
    tone: AttentionTone;
    /** i18n key suffix for the pill label — `home.badge_*`. */
    badgeKey: 'overdue' | 'this_week' | 'today' | 'upcoming';
}

/** How many calendar days ahead still counts as "needing attention". */
const ATTENTION_WINDOW_DAYS = 14;
/** Upper bound on the "This Week" pill. */
const THIS_WEEK_DAYS = 7;

function isComplete(m: AttentionMilestoneInput): boolean {
    return Boolean(m.is_complete) || m.status === TASK_STATUS.COMPLETED;
}

/**
 * Build the "Milestones Needing Attention" feed for the Home page.
 *
 * Includes every incomplete milestone that is overdue OR due within the next
 * {@link ATTENTION_WINDOW_DAYS} calendar days, sorted soonest-first (most
 * overdue at the top), capped at `limit`. Dates are compared on UTC calendar-day
 * boundaries via the date-engine, matching the rest of the app.
 *
 * @param milestones Milestones from `useProjectReports().milestones`.
 * @param opts.now Injected clock (testable). Defaults to the date-engine clock.
 * @param opts.limit Max rows to return. Defaults to 6.
 */
export function buildAttentionMilestones(
    milestones: AttentionMilestoneInput[],
    opts: { now?: Date; limit?: number } = {},
): AttentionMilestone[] {
    const { now = getNow(), limit = 6 } = opts;
    const todayIso = toIsoDate(now);
    if (!todayIso) return [];

    const rows: AttentionMilestone[] = [];
    for (const m of milestones) {
        if (isComplete(m) || !m.due_date) continue;
        const dueIso = toIsoDate(m.due_date);
        if (!dueIso) continue;
        const diffDays = diffInCalendarDays(dueIso, todayIso);
        if (diffDays == null) continue;
        if (diffDays > ATTENTION_WINDOW_DAYS) continue;

        let tone: AttentionTone;
        let badgeKey: AttentionMilestone['badgeKey'];
        if (diffDays < 0) {
            tone = 'overdue';
            badgeKey = 'overdue';
        } else if (diffDays === 0) {
            tone = 'due_soon';
            badgeKey = 'today';
        } else if (diffDays <= THIS_WEEK_DAYS) {
            tone = 'due_soon';
            badgeKey = 'this_week';
        } else {
            tone = 'neutral';
            badgeKey = 'upcoming';
        }

        rows.push({ id: m.id, title: m.title, due_date: m.due_date, diffDays, tone, badgeKey });
    }

    rows.sort((a, b) => a.diffDays - b.diffDays);
    return rows.slice(0, limit);
}
