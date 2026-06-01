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

    it('grants any project member full task capabilities on instance rows', () => {
        for (const role of ['planter', 'team', 'admin'] as const) {
            expect(canEditTaskContent(role)).toBe(true);
            expect(canCreateChildTask(role)).toBe(true);
            expect(canReorderTask(role)).toBe(true);
            expect(canUpdateTaskProgress(role)).toBe(true);
            expect(canDeleteTask(role, instanceTask)).toBe(true);
        }
    });

    it('grants delete on cloned-from-template rows — provenance gating moved to the delete_task RPC', () => {
        // The old `!task?.cloned_from_task_id` client clause hid the delete
        // button on every scaffold row (the bulk of real projects). Deletion is
        // now authoritatively gated by the SECURITY DEFINER `delete_task` RPC,
        // so the client permission is role-only and ignores provenance.
        const cloned = makeTask({ cloned_from_task_id: 'template-task-id' });
        for (const role of ['planter', 'team', 'admin'] as const) {
            expect(canDeleteTask(role, cloned)).toBe(true);
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
