/**
 * Adapter from PlanterPlan's hierarchical task model to gantt-task-react's flat row model.
 *
 * BOUNDARY EXEMPTION: this file constructs Date objects from ISO strings via `new Date(...)`.
 * That's allowed because the gantt library requires Date objects for its internal pixel-width
 * computation. Internal date math (sorting, comparison, persistence) still routes through
 * `@/shared/lib/date-engine` — never compute durations or row positions with raw arithmetic.
 */
import type { Task as GanttTaskApiType } from 'gantt-task-react';
import type { HierarchyTask } from '@/shared/db/app.types';
import { addDaysToDate, compareDateAsc } from '@/shared/lib/date-engine';

export interface GanttRowOptions {
    includeLeafTasks: boolean;
}

export interface AdapterResult {
    rows: GanttTaskApiType[];
    skippedCount: number;
}

/** Fallback bar fill when a task has no `settings.color`. Matches `--brand-600` in `src/index.css`. */
const BRAND_COLOR_FALLBACK = 'hsl(19, 96%, 41%)';

type WithChildren = HierarchyTask & { __kids?: HierarchyTask[] };

const toGanttDate = (iso: string): Date | null => addDaysToDate(
    /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00.000Z` : iso,
    0,
);

/**
 * Walks a flat hierarchy of tasks and emits one gantt row per phase + milestone,
 * plus leaf tasks when `opts.includeLeafTasks` is true. Subtasks (max-depth-1
 * invariant) are never emitted. Rows missing derivable bounds after ancestor
 * fallback are counted in `skippedCount`.
 *
 * @param tasks - Flat list of hierarchy tasks rooted at a single project.
 * @param opts - Rendering options (leaf-task inclusion).
 * @returns Ordered gantt rows plus the count of rows dropped for missing bounds.
 */
export function tasksToGanttRows(tasks: HierarchyTask[], opts: GanttRowOptions): AdapterResult {
    if (tasks.length === 0) return { rows: [], skippedCount: 0 };

    // Build a parent → children index for the hierarchy walk.
    const byId = new Map<string, WithChildren>();
    const byParent = new Map<string | null, WithChildren[]>();
    for (const t of tasks) {
        const node = t as WithChildren;
        byId.set(t.id, node);
        const parent = t.parent_task_id ?? null;
        const bucket = byParent.get(parent);
        if (bucket) bucket.push(node);
        else byParent.set(parent, [node]);
    }

    // Resolve the project root: the single task whose parent_task_id is null.
    const roots = byParent.get(null) ?? [];
    const root = roots[0];
    if (!root) return { rows: [], skippedCount: 0 };

    const rows: GanttTaskApiType[] = [];
    let skippedCount = 0;

    /** Walks up the parent chain until it finds a task with both dates set. */
    function resolveAncestorBounds(node: HierarchyTask): { start: string; end: string } | null {
        let cursor: HierarchyTask | undefined = node.parent_task_id
            ? byId.get(node.parent_task_id)
            : undefined;
        while (cursor) {
            if (cursor.start_date && cursor.due_date) {
                return { start: cursor.start_date, end: cursor.due_date };
            }
            cursor = cursor.parent_task_id ? byId.get(cursor.parent_task_id) : undefined;
        }
        return null;
    }

    /** Counts completed vs total descendants under `node` (excluding subtasks). */
    function collectProgress(node: HierarchyTask): { completed: number; total: number } {
        let completed = 0;
        let total = 0;
        const stack: HierarchyTask[] = [...(byParent.get(node.id) ?? [])];
        while (stack.length > 0) {
            const cur = stack.pop() as HierarchyTask;
            if (cur.task_type === 'subtask') continue;
            total += 1;
            if (cur.is_complete) completed += 1;
            for (const child of byParent.get(cur.id) ?? []) stack.push(child);
        }
        return { completed, total };
    }

    /** Reads `settings.color` safely (settings is loose JSONB). */
    function readColor(task: HierarchyTask): string | undefined {
        const settings = task.settings as Record<string, unknown> | null | undefined;
        const color = settings?.color;
        return typeof color === 'string' && color.length > 0 ? color : undefined;
    }

    function emit(node: HierarchyTask, ganttType: GanttTaskApiType['type']) {
        const fallback = (!node.start_date || !node.due_date)
            ? resolveAncestorBounds(node)
            : null;
        const startIso = node.start_date ?? fallback?.start ?? null;
        const endIso = node.due_date ?? fallback?.end ?? null;

        if (!startIso || !endIso) {
            skippedCount += 1;
            return;
        }

        const start = toGanttDate(startIso);
        let end = toGanttDate(endIso);
        if (!start || !end) {
            skippedCount += 1;
            return;
        }
        if (compareDateAsc(startIso, endIso) > 0) {
            console.warn(`[gantt-adapter] Task ${node.id} has due_date before start_date; collapsing to start.`);
            end = start;
        }

        const progress = collectProgress(node);
        const pct = progress.total === 0
            ? (node.is_complete ? 100 : 0)
            : Math.round((progress.completed / progress.total) * 100);

        const color = readColor(node) ?? BRAND_COLOR_FALLBACK;

        rows.push({
            id: node.id,
            type: ganttType,
            name: node.title ?? '(untitled)',
            start,
            end,
            progress: pct,
            styles: { backgroundColor: color, progressColor: color },
        });
    }

    // Phases: direct children of the project root, ordered by position.
    const phases = [...(byParent.get(root.id) ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );

    for (const phase of phases) {
        if (phase.task_type === 'subtask') continue;
        emit(phase, 'project');

        // Milestones: direct children of the phase, ordered by position.
        const milestones = [...(byParent.get(phase.id) ?? [])].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        for (const milestone of milestones) {
            if (milestone.task_type === 'subtask') continue;
            emit(milestone, 'task');

            if (!opts.includeLeafTasks) continue;

            // Leaf tasks: direct children of the milestone (exclude subtasks).
            const leaves = [...(byParent.get(milestone.id) ?? [])].sort(
                (a, b) => (a.position ?? 0) - (b.position ?? 0),
            );
            for (const leaf of leaves) {
                if (leaf.task_type === 'subtask') continue;
                emit(leaf, 'task');
            }
        }
    }

    return { rows, skippedCount };
}
