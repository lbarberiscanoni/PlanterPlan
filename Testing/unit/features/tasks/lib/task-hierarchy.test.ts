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

    it('allows valid task and subtree moves that preserve max depth', () => {
        expect(canReparentTask('task-a', 'task-b', rows)).toBe(true);
        expect(canReparentTask('task-with-subtask', 'milestone-b', rows)).toBe(true);
    });

    it('rejects subtask children, cycle moves, and moves that push descendants too deep', () => {
        expect(canReparentTask('task-a', 'subtask-a', rows)).toBe(false);
        expect(canReparentTask('task-with-subtask', 'task-b', rows)).toBe(false);
        expect(canReparentTask('task-with-subtask', 'subtask-a', rows)).toBe(false);
    });

    it('hides child-creation affordances only at the final subtask level', () => {
        expect(canTaskHaveChildren(rows[4], rows)).toBe(true);
        expect(canTaskHaveChildren(rows[7], rows)).toBe(false);
        expect(canTaskHaveChildren(makeTask({ id: 'typed-subtask', task_type: 'subtask' }), [])).toBe(false);
    });
});
