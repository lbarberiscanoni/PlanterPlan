interface SortableTask {
    due_date?: string | null;
    position?: number | null;
}

/**
 * Sibling sort comparator: chronological by `due_date` (earliest first),
 * with `position` as the tiebreaker. Tasks without a `due_date` fall to
 * the bottom of the list and are then ordered by `position`.
 *
 * Why date-primary: after the date engine populates a project, users expect
 * to scan the tree top-to-bottom and see work in the order it's due.
 * `position` remains the authoritative manual-ordering field — it just
 * only matters when two tasks share a date or both are undated.
 */
export const compareByDueThenPosition = (a: SortableTask, b: SortableTask): number => {
    const aDue = a.due_date ?? '';
    const bDue = b.due_date ?? '';
    if (aDue && bDue) {
        if (aDue < bDue) return -1;
        if (aDue > bDue) return 1;
    } else if (aDue) {
        return -1;
    } else if (bDue) {
        return 1;
    }
    return (a.position ?? 0) - (b.position ?? 0);
};
