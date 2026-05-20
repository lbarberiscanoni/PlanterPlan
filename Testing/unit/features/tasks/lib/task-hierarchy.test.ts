import { describe, expect, it } from 'vitest';
import { makeTask } from '@test/factories';
import {
    canReparentTask,
    canTaskHaveChildren,
    getTaskDepth,
    getTaskSubtreeHeight,
    isTaskDescendant,
} from '@/features/tasks/lib/task-hierarchy';

const rows = [
    makeTask({ id: 'project', parent_task_id: null, task_type: 'project' }),
    makeTask({ id: 'phase', parent_task_id: 'project', task_type: 'phase' }),
    makeTask({ id: 'milestone-a', parent_task_id: 'phase', task_type: 'milestone' }),
    makeTask({ id: 'milestone-b', parent_task_id: 'phase', task_type: 'milestone' }),
    makeTask({ id: 'task-a', parent_task_id: 'milestone-a', task_type: 'task' }),
    makeTask({ id: 'task-b', parent_task_id: 'milestone-b', task_type: 'task' }),
    makeTask({ id: 'task-with-subtask', parent_task_id: 'milestone-a', task_type: 'task' }),
    makeTask({ id: 'subtask-a', parent_task_id: 'task-with-subtask', task_type: 'subtask' }),
];

describe('task hierarchy guard helpers', () => {
    it('calculates depth and subtree height from a flat hierarchy', () => {
        expect(getTaskDepth('project', rows)).toBe(0);
        expect(getTaskDepth('subtask-a', rows)).toBe(4);
        expect(getTaskSubtreeHeight('task-with-subtask', rows)).toBe(1);
        expect(isTaskDescendant('task-with-subtask', 'subtask-a', rows)).toBe(true);
    });

    it('allows valid task and subtree moves under the relaxed depth cap (10)', () => {
        expect(canReparentTask('task-a', 'task-b', rows)).toBe(true);
        expect(canReparentTask('task-with-subtask', 'milestone-b', rows)).toBe(true);
        // Deeper nesting is now allowed up to depth 10. task-with-subtask has
        // subtreeHeight=1; placing it under task-b puts the subtree at depth 5.
        expect(canReparentTask('task-with-subtask', 'task-b', rows)).toBe(true);
        // A leaf placed under a subtask lands at depth 5 — fine.
        expect(canReparentTask('task-a', 'subtask-a', rows)).toBe(true);
    });

    it('rejects self-parenting and cycle moves regardless of depth', () => {
        expect(canReparentTask('task-a', 'task-a', rows)).toBe(false);
        // Cycle: task-with-subtask under its own descendant subtask-a.
        expect(canReparentTask('task-with-subtask', 'subtask-a', rows)).toBe(false);
    });

    it('rejects malformed reparent payloads with missing active tasks or parents', () => {
        expect(canReparentTask('missing-task', 'task-b', rows)).toBe(false);
        expect(canReparentTask('task-a', 'missing-parent', rows)).toBe(false);
        expect(canReparentTask('task-a', 'task-b', [])).toBe(false);
    });

    it('allows child-creation affordances within the depth cap and rejects beyond', () => {
        // Depth 3 (task) → can have children up to depth 10.
        expect(canTaskHaveChildren(rows[4], rows)).toBe(true);
        // Depth 4 (subtask) → also within cap, still allowed.
        expect(canTaskHaveChildren(rows[7], rows)).toBe(true);
        // task_type='subtask' fallback (no hierarchy index) is conservative and
        // still rejects. Tasks present in the rows array use the depth check
        // and override this.
        expect(canTaskHaveChildren(makeTask({ id: 'typed-subtask', task_type: 'subtask' }), [])).toBe(false);
    });
});
