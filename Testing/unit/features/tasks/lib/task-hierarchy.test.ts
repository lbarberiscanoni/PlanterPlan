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

    it('allows valid reparent moves within the depth-4 cap', () => {
        // Leaf-to-leaf reparent: task-a under task-b puts task-a at depth 4. ✓
        expect(canReparentTask('task-a', 'task-b', rows)).toBe(true);
        // task-with-subtask (height 1) under milestone-b: depth 2 + 1 + 1 = 4. ✓
        expect(canReparentTask('task-with-subtask', 'milestone-b', rows)).toBe(true);
    });

    it('rejects reparent moves that would exceed the 4-level cap', () => {
        // task-with-subtask has subtreeHeight 1; placing it under task-b would
        // put the subtree at depth 5 → rejected.
        expect(canReparentTask('task-with-subtask', 'task-b', rows)).toBe(false);
        // Anything under a subtask lands at depth 5 → rejected. Subtasks terminal.
        expect(canReparentTask('task-a', 'subtask-a', rows)).toBe(false);
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

    it('exposes child-creation affordances per the 4-level taxonomy', () => {
        // Depth 3 (task) → can still gain a subtask child (depth 4). ✓
        expect(canTaskHaveChildren(rows[4], rows)).toBe(true);
        // Depth 4 (subtask) → terminal, no children. ✗
        expect(canTaskHaveChildren(rows[7], rows)).toBe(false);
        // task_type='subtask' fallback (no hierarchy index) is conservative and
        // rejects, matching the canonical taxonomy.
        expect(canTaskHaveChildren(makeTask({ id: 'typed-subtask', task_type: 'subtask' }), [])).toBe(false);
    });
});
