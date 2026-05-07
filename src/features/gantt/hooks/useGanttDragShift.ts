import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { compareDateAsc, isBeforeDate, toIsoDate } from '@/shared/lib/date-engine';
import type { HierarchyTask } from '@/shared/db/app.types';

export interface GanttTaskDateUpdate {
    id: string;
    root_id: string;
    start_date: string;
    due_date: string;
}

export interface UseGanttDragShiftArgs {
    projectId: string;
    /** Flat snapshot of the project's tasks for parent-bounds lookup. */
    tasks: HierarchyTask[];
    /** Page-composed mutation callback that persists the validated date shift. */
    updateTaskDates: (update: GanttTaskDateUpdate) => Promise<unknown>;
}

export type OnShiftDates = (taskId: string, newStart: Date, newEnd: Date) => Promise<void>;

/**
 * Returns a handler that validates a drag-end against the parent phase's bounds
 * and the start ≤ end invariant, then persists via `updateTaskDates`. Cascade-up
 * on parent dates is handled by `updateParentDates` in the Wave 18 mutation
 * wiring — no manual child shifts here.
 *
 * @param args - The project id (for query invalidation) and the flat task snapshot.
 * @returns A handler suitable for `gantt-task-react`'s `onDateChange` adapter.
 */
export function useGanttDragShift({ projectId, tasks, updateTaskDates }: UseGanttDragShiftArgs): OnShiftDates {
    const qc = useQueryClient();

    return async function onShiftDates(taskId, newStart, newEnd) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const newStartIso = toIsoDate(newStart);
        const newEndIso = toIsoDate(newEnd);
        if (!newStartIso || !newEndIso) {
            toast.error('Invalid date range.');
            return;
        }

        // Parent-bounds check: child bars cannot exceed the parent phase's bounds.
        if (task.parent_task_id) {
            const parent = tasks.find((t) => t.id === task.parent_task_id);
            if (parent?.start_date && parent?.due_date) {
                if (isBeforeDate(newStartIso, parent.start_date)
                    || compareDateAsc(newEndIso, parent.due_date) > 0) {
                    toast.error('Move the parent phase first.');
                    return;
                }
            }
        }

        // Sanity: end must be ≥ start.
        if (compareDateAsc(newStartIso, newEndIso) > 0) {
            toast.error('Invalid date range.');
            return;
        }

        try {
            await updateTaskDates({
                id: taskId,
                root_id: task.root_id ?? projectId,
                start_date: newStartIso,
                due_date: newEndIso,
            });
        } catch {
            // Force-refetch on rollback per styleguide §5.
            qc.invalidateQueries({ queryKey: ['projectHierarchy', projectId] });
            toast.error('Could not save change.');
        }
    };
}
