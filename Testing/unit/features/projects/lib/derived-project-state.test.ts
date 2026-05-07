import { describe, expect, it } from 'vitest';
import { makeTask } from '@test';
import { TASK_STATUS } from '@/shared/constants/domain';
import { deriveProjectState } from '@/features/projects/lib/derived-project-state';

describe('deriveProjectState', () => {
    it('treats archive as a visibility state before lifecycle derivation', () => {
        const project = makeTask({ id: 'project-1', status: 'archived', is_complete: false });

        expect(deriveProjectState(project, [
            project,
            makeTask({ id: 'task-1', status: TASK_STATUS.IN_PROGRESS }),
        ])).toEqual({
            state: 'archived',
            completedTasks: 0,
            totalTasks: 1,
        });
    });

    it('derives complete when every child task is complete', () => {
        const project = makeTask({ id: 'project-1', status: 'planning', is_complete: false });

        expect(deriveProjectState(project, [
            makeTask({ id: 'task-1', status: TASK_STATUS.COMPLETED }),
            makeTask({ id: 'task-2', is_complete: true }),
        ])).toEqual({
            state: 'complete',
            completedTasks: 2,
            totalTasks: 2,
        });
    });

    it('derives in_progress when any child task has started', () => {
        const project = makeTask({ id: 'project-1', status: 'planning', is_complete: false });

        expect(deriveProjectState(project, [
            makeTask({ id: 'task-1', status: 'not_started' }),
            makeTask({ id: 'task-2', status: TASK_STATUS.IN_PROGRESS }),
        ])).toEqual({
            state: 'in_progress',
            completedTasks: 0,
            totalTasks: 2,
        });
    });

    it('derives not_started when child tasks exist but none have started', () => {
        const project = makeTask({ id: 'project-1', status: 'launched', is_complete: false });

        expect(deriveProjectState(project, [
            makeTask({ id: 'task-1', status: 'not_started' }),
            makeTask({ id: 'task-2', status: TASK_STATUS.TODO }),
        ])).toEqual({
            state: 'not_started',
            completedTasks: 0,
            totalTasks: 2,
        });
    });
});
