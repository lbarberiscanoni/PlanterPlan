import { describe, expect, it } from 'vitest';
import { makeTask } from '@test/factories';
import {
    canCreateChildTask,
    canDeleteTask,
    canEditTaskContent,
    canEditTemplates,
    canReorderTask,
    canUpdateTaskProgress,
} from '@/features/tasks/lib/task-permissions';

describe('task permission capabilities', () => {
    const instanceTask = makeTask({ origin: 'instance', settings: {} });

    it('grants any project member full task edit capabilities on instance rows', () => {
        for (const role of ['planter', 'team', 'admin'] as const) {
            expect(canEditTaskContent(role)).toBe(true);
            expect(canCreateChildTask(role)).toBe(true);
            expect(canReorderTask(role)).toBe(true);
            expect(canUpdateTaskProgress(role)).toBe(true);
        }
    });

    it('restricts delete to admins; provenance is ignored (gating in the delete_task RPC)', () => {
        // Planters/Team retire tasks via the 'na' status, never DELETE — delete
        // is admin-only on both the client gate and the SECURITY DEFINER
        // `delete_task` RPC. Provenance (cloned_from_task_id) is not consulted.
        const cloned = makeTask({ cloned_from_task_id: 'template-task-id' });
        expect(canDeleteTask('admin', instanceTask)).toBe(true);
        expect(canDeleteTask('admin', cloned)).toBe(true);
        for (const role of ['planter', 'team'] as const) {
            expect(canDeleteTask(role, instanceTask)).toBe(false);
            expect(canDeleteTask(role, cloned)).toBe(false);
        }
    });

    it('denies delete to non-members regardless of provenance', () => {
        const cloned = makeTask({ cloned_from_task_id: 'template-task-id' });
        for (const role of [null, undefined, 'owner', 'viewer'] as const) {
            expect(canDeleteTask(role, cloned)).toBe(false);
        }
    });

    it('denies non-members and unknown roles', () => {
        expect(canEditTaskContent(null)).toBe(false);
        expect(canEditTaskContent(undefined)).toBe(false);
        expect(canEditTaskContent('owner')).toBe(false);
        expect(canEditTaskContent('viewer')).toBe(false);
        expect(canCreateChildTask(null)).toBe(false);
        expect(canReorderTask('limited')).toBe(false);
    });

    it('restricts template flag edits to admins', () => {
        expect(canEditTemplates('admin')).toBe(true);
        expect(canEditTemplates('planter')).toBe(false);
        expect(canEditTemplates('team')).toBe(false);
        expect(canEditTemplates(null)).toBe(false);
    });
});
