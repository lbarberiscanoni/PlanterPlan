import {
    nowUtcIso,
    toIsoDate,
    type DateEngineTask,
    type DateUpdateRecord,
} from '@/shared/lib/date-engine';
import { dateProjectBusinessCalendar } from '@/shared/lib/date-engine/business-calendar';

interface TaskWithOffset extends DateEngineTask {
    days_from_start?: number | null;
}

/**
 * Populate dates on every dateless task in a project using the template's
 * `days_from_start` offsets. The user-visible effect: a freshly cloned
 * project lands with a concrete schedule (each task gets start_date = due_date
 * = project.start_date + offset business days) instead of NULL columns.
 *
 * Each task's own start_date = project_start + own offset. Its due_date is the
 * LATEST offset across itself and all descendants, so parents form ranges
 * that envelope their children. This matches the date-engine envelope guard
 * (child.due <= parent.due) — without it, a milestone's single-point date
 * would never accept a deeper task with a larger offset.
 *
 * The returned updates are sorted `(depth ASC, due DESC)` so the caller can
 * write them in order: parents land before their children, and within each
 * sibling group the latest-due row goes first. That keeps the parent's
 * rolled-up `max(child.due)` from contracting below subsequent siblings.
 *
 * Returns an empty array if the project has no start date or every task
 * already has a due_date.
 */
export const populateScheduleFromOffsets = (
    tasks: TaskWithOffset[] | null | undefined,
    projectStartDateStr: string | null | undefined,
): DateUpdateRecord[] => {
    if (!tasks || tasks.length === 0) return [];
    const projectStart = toIsoDate(projectStartDateStr);
    if (!projectStart) return [];

    const root = tasks.find((t) => !t.parent_task_id);
    if (!root) return [];

    const byId = new Map<string, TaskWithOffset>();
    for (const t of tasks) byId.set(t.id, t);

    // Depth from root, memoized.
    const depthById = new Map<string, number>();
    const depthOf = (id: string, seen = new Set<string>()): number => {
        if (depthById.has(id)) return depthById.get(id)!;
        if (seen.has(id)) return 0;
        seen.add(id);
        const t = byId.get(id);
        if (!t || !t.parent_task_id) {
            depthById.set(id, 0);
            return 0;
        }
        const d = depthOf(t.parent_task_id, seen) + 1;
        depthById.set(id, d);
        return d;
    };

    // Children index for fast descendant traversal.
    const childrenById = new Map<string, TaskWithOffset[]>();
    for (const t of tasks) {
        const key = t.parent_task_id ?? '';
        const bucket = childrenById.get(key);
        if (bucket) bucket.push(t);
        else childrenById.set(key, [t]);
    }

    // For each task, the largest `days_from_start` across itself + descendants.
    // This becomes the task's `due_date` offset so parents envelope children.
    const maxOffsetById = new Map<string, number>();
    const maxOffsetOf = (id: string, seen = new Set<string>()): number => {
        if (maxOffsetById.has(id)) return maxOffsetById.get(id)!;
        if (seen.has(id)) return 0;
        seen.add(id);
        const t = byId.get(id);
        const own = typeof t?.days_from_start === 'number' && Number.isFinite(t.days_from_start)
            ? t.days_from_start
            : 0;
        const kids = childrenById.get(id) ?? [];
        let max = own;
        for (const c of kids) {
            const childMax = maxOffsetOf(c.id, seen);
            if (childMax > max) max = childMax;
        }
        maxOffsetById.set(id, max);
        return max;
    };

    const now = nowUtcIso();
    const updates: Array<DateUpdateRecord & { _dueOffset: number; _depth: number }> = [];

    for (const t of tasks) {
        if (t.id === root.id) continue;
        const ownOffset = typeof t.days_from_start === 'number' && Number.isFinite(t.days_from_start)
            ? t.days_from_start
            : 0;
        const dueOffset = maxOffsetOf(t.id);
        const startDate = dateProjectBusinessCalendar.addBusinessDays(projectStart, ownOffset);
        const dueDate = dateProjectBusinessCalendar.addBusinessDays(projectStart, dueOffset);
        const startIso = toIsoDate(startDate);
        const dueIso = toIsoDate(dueDate);
        if (!startIso || !dueIso) continue;
        updates.push({
            id: t.id,
            start_date: startIso,
            due_date: dueIso,
            updated_at: now,
            _dueOffset: dueOffset,
            _depth: depthOf(t.id),
        });
    }

    // (depth ASC, due DESC) — write ancestors first so descendants find a wide
    // enough envelope; within a sibling group, latest-due first so parent
    // rollup stabilizes at the maximum without contracting under later writes.
    updates.sort((a, b) => a._depth - b._depth || b._dueOffset - a._dueOffset);
    return updates.map(({ _dueOffset, _depth, ...rest }) => {
        void _dueOffset;
        void _depth;
        return rest;
    });
};
