import { describe, expect, it } from 'vitest';
import { makeTask } from '@test/factories';
import { getTaskMoveParentOptions } from '@/features/tasks/lib/task-move-options';

const rows = [
    makeTask({ id: 'project', parent_task_id: null, root_id: 'project', task_type: 'project' }),
    makeTask({ id: 'phase', parent_task_id: 'project', root_id: 'project', task_type: 'phase' }),
    makeTask({ id: 'milestone-a', parent_task_id: 'phase', root_id: 'project', task_type: 'milestone', title: 'Milestone A' }),
    makeTask({ id: 'milestone-b', parent_task_id: 'phase', root_id: 'project', task_type: 'milestone', title: 'Milestone B' }),
    makeTask({ id: 'task-a', parent_task_id: 'milestone-a', root_id: 'project', task_type: 'task', title: 'Task A' }),
    makeTask({ id: 'task-b', parent_task_id: 'milestone-b', root_id: 'project', task_type: 'task', title: 'Task B' }),
    makeTask({ id: 'task-with-subtask', parent_task_id: 'milestone-a', root_id: 'project', task_type: 'task', title: 'Task With Subtask' }),
    makeTask({ id: 'subtask-a', parent_task_id: 'task-with-subtask', root_id: 'project', task_type: 'subtask', title: 'Subtask A' }),
];

describe('getTaskMoveParentOptions', () => {
    it('returns valid alternate parent destinations for a task', () => {
        const task = rows.find((row) => row.id === 'task-a');

        const options = getTaskMoveParentOptions(task!, rows).map((row) => row.id);

        expect(options).toContain('milestone-b');
        expect(options).toContain('task-b');
        expect(options).not.toContain('milestone-a');
        expect(options).not.toContain('task-a');
        expect(options).not.toContain('subtask-a');
    });

    it('uses the shared hierarchy guard for descendants and max-depth moves', () => {
        const task = rows.find((row) => row.id === 'task-with-subtask');

        const options = getTaskMoveParentOptions(task!, rows).map((row) => row.id);

        expect(options).toContain('milestone-b');
        expect(options).not.toContain('task-b');
        expect(options).not.toContain('subtask-a');
    });

    it('does not expose root or template tasks to project-instance move controls', () => {
        const root = rows.find((row) => row.id === 'project');
        const template = makeTask({
            id: 'template-task',
            origin: 'template',
            parent_task_id: 'template-parent',
            root_id: 'template-root',
            task_type: 'task',
        });

        expect(getTaskMoveParentOptions(root!, rows)).toEqual([]);
        expect(getTaskMoveParentOptions(template, [...rows, template])).toEqual([]);
    });
});
