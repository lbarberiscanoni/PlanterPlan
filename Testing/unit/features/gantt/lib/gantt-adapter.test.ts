import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { HierarchyTask } from '@/shared/db/app.types';
import { tasksToGanttRows } from '@/features/gantt/lib/gantt-adapter';

type PartialTask = Partial<HierarchyTask> & { id: string };

function makeTask(overrides: PartialTask): HierarchyTask {
    return {
        id: overrides.id,
        root_id: overrides.root_id ?? 'p1',
        parent_task_id: overrides.parent_task_id ?? null,
        position: overrides.position ?? 0,
        title: overrides.title ?? 'Task',
        task_type: overrides.task_type ?? 'task',
        start_date: overrides.start_date ?? null,
        due_date: overrides.due_date ?? null,
        is_complete: overrides.is_complete ?? false,
        status: overrides.status ?? 'todo',
        settings: overrides.settings ?? null,
        description: null,
        notes: null,
        purpose: null,
        actions: null,
        days_from_start: null,
        duration_days: null,
        assignee_id: null,
        is_locked: null,
        prerequisite_phase_id: null,
        origin: 'instance',
        creator: null,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        ...overrides,
    } as HierarchyTask;
}

describe('tasksToGanttRows (Wave 28)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns empty output for empty input', () => {
        expect(tasksToGanttRows([], { includeLeafTasks: false })).toEqual({ rows: [], skippedCount: 0 });
    });

    it('emits nothing when the only task is the root (no phases)', () => {
        const rows = tasksToGanttRows(
            [makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' })],
            { includeLeafTasks: false },
        );
        expect(rows.rows).toHaveLength(0);
        expect(rows.skippedCount).toBe(0);
    });

    it('maps phases to gantt type "project" and milestones to type "task"', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase', title: 'Discovery',
                start_date: '2026-01-01', due_date: '2026-01-31', position: 1,
            }),
            makeTask({
                id: 'm1', parent_task_id: 'ph1', task_type: 'milestone', title: 'Kickoff',
                start_date: '2026-01-05', due_date: '2026-01-10', position: 1,
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0]).toMatchObject({ id: 'ph1', type: 'project', name: 'Discovery' });
        expect(result.rows[1]).toMatchObject({ id: 'm1', type: 'task', name: 'Kickoff' });
        expect(result.skippedCount).toBe(0);
    });

    it('falls back to ancestor bounds when a phase has no dates', () => {
        const tasks: HierarchyTask[] = [
            makeTask({
                id: 'p1', parent_task_id: null, task_type: 'project',
                start_date: '2026-01-01', due_date: '2026-03-31',
            }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: null, due_date: null,
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].start.toISOString().slice(0, 10)).toBe('2026-01-01');
        expect(result.rows[0].end.toISOString().slice(0, 10)).toBe('2026-03-31');
        expect(result.skippedCount).toBe(0);
    });

    it('counts rows with no derivable bounds in skippedCount', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: null, due_date: null,
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(result.rows).toHaveLength(0);
        expect(result.skippedCount).toBe(1);
    });

    it('includes leaf tasks only when the toggle is on', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-01-01', due_date: '2026-01-31',
            }),
            makeTask({
                id: 'm1', parent_task_id: 'ph1', task_type: 'milestone',
                start_date: '2026-01-05', due_date: '2026-01-10',
            }),
            makeTask({
                id: 't1', parent_task_id: 'm1', task_type: 'task', title: 'Write plan',
                start_date: '2026-01-05', due_date: '2026-01-07',
            }),
        ];

        const off = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(off.rows.map((r) => r.id)).toEqual(['ph1', 'm1']);

        const on = tasksToGanttRows(tasks, { includeLeafTasks: true });
        expect(on.rows.map((r) => r.id)).toEqual(['ph1', 'm1', 't1']);
    });

    it('maps a 500+ row hierarchy with leaf-task rendering enabled', () => {
        const root = makeTask({ id: 'large-project', parent_task_id: null, task_type: 'project' });
        const phases = Array.from({ length: 12 }, (_, phaseIndex) =>
            makeTask({
                id: `large-phase-${phaseIndex}`,
                parent_task_id: root.id,
                task_type: 'phase',
                title: `Phase ${phaseIndex}`,
                start_date: '2026-01-01',
                due_date: '2026-12-31',
                position: phaseIndex,
            }),
        );
        const milestones = phases.flatMap((phase, phaseIndex) =>
            Array.from({ length: 10 }, (_, milestoneIndex) =>
                makeTask({
                    id: `large-milestone-${phaseIndex}-${milestoneIndex}`,
                    parent_task_id: phase.id,
                    task_type: 'milestone',
                    title: `Milestone ${phaseIndex}.${milestoneIndex}`,
                    start_date: '2026-02-01',
                    due_date: '2026-11-30',
                    position: milestoneIndex,
                }),
            ),
        );
        const leafTasks = milestones.flatMap((milestone, milestoneIndex) =>
            Array.from({ length: 4 }, (_, taskIndex) =>
                makeTask({
                    id: `large-task-${milestoneIndex}-${taskIndex}`,
                    parent_task_id: milestone.id,
                    task_type: 'task',
                    title: `Task ${milestoneIndex}.${taskIndex}`,
                    start_date: '2026-03-01',
                    due_date: '2026-03-15',
                    position: taskIndex,
                }),
            ),
        );

        const result = tasksToGanttRows(
            [root, ...phases, ...milestones, ...leafTasks],
            { includeLeafTasks: true },
        );

        expect(result.skippedCount).toBe(0);
        expect(result.rows).toHaveLength(612);
        expect(result.rows[0].id).toBe('large-phase-0');
        expect(result.rows.at(-1)?.id).toBe('large-task-119-3');
    });

    it('always excludes subtasks', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-01-01', due_date: '2026-01-31',
            }),
            makeTask({
                id: 'm1', parent_task_id: 'ph1', task_type: 'milestone',
                start_date: '2026-01-05', due_date: '2026-01-10',
            }),
            makeTask({
                id: 't1', parent_task_id: 'm1', task_type: 'task',
                start_date: '2026-01-05', due_date: '2026-01-07',
            }),
            makeTask({
                id: 's1', parent_task_id: 't1', task_type: 'subtask',
                start_date: '2026-01-05', due_date: '2026-01-06',
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: true });
        expect(result.rows.map((r) => r.id)).not.toContain('s1');
    });

    it('applies settings.color when present and falls back otherwise', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-01-01', due_date: '2026-01-31',
                settings: { color: '#abcdef' },
            }),
            makeTask({
                id: 'ph2', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-02-01', due_date: '2026-02-28',
                settings: null, position: 2,
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(result.rows[0].styles?.backgroundColor).toBe('#abcdef');
        expect(result.rows[1].styles?.backgroundColor).toMatch(/^hsl\(/);
    });

    it('collapses a row to start when due < start and emits a warn', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-02-01', due_date: '2026-01-01',
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].start.getTime()).toBe(result.rows[0].end.getTime());
        expect(warn).toHaveBeenCalled();
    });

    it('computes phase progress from completed descendants', () => {
        const tasks: HierarchyTask[] = [
            makeTask({ id: 'p1', parent_task_id: null, task_type: 'project' }),
            makeTask({
                id: 'ph1', parent_task_id: 'p1', task_type: 'phase',
                start_date: '2026-01-01', due_date: '2026-01-31',
            }),
            makeTask({
                id: 'm1', parent_task_id: 'ph1', task_type: 'milestone',
                start_date: '2026-01-05', due_date: '2026-01-10',
                is_complete: true,
            }),
            makeTask({
                id: 'm2', parent_task_id: 'ph1', task_type: 'milestone',
                start_date: '2026-01-11', due_date: '2026-01-20',
                is_complete: false, position: 2,
            }),
        ];

        const result = tasksToGanttRows(tasks, { includeLeafTasks: false });
        // Phase ph1: 1 of 2 milestones complete → 50%.
        expect(result.rows[0].id).toBe('ph1');
        expect(result.rows[0].progress).toBe(50);
    });
});
