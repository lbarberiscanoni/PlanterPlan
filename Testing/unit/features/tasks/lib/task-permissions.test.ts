import { describe, expect, it } from 'vitest';
import { makeTask } from '@test/factories';
import {
    canCreateChildTask,
    canDeleteTask,
    canEditTaskContent,
    canReorderTask,
    canUpdateTaskProgress,
} from '@/features/tasks/lib/task-permissions';

describe('task permission capabilities', () => {
    const coachingTask = makeTask({
        origin: 'instance',
        settings: { is_coaching_task: true },
    });
    const plainTask = makeTask({
        origin: 'instance',
        settings: {},
    });
    const templateTask = makeTask({
        origin: 'template',
        settings: { is_coaching_task: true },
    });

    it('lets coaches update progress only on Coaching-labeled instance tasks', () => {
        expect(canUpdateTaskProgress('coach', coachingTask)).toBe(true);
        expect(canUpdateTaskProgress('coach', plainTask)).toBe(false);
        expect(canUpdateTaskProgress('coach', templateTask)).toBe(false);
    });

    it('does not grant coaches structural/content capabilities', () => {
        expect(canEditTaskContent('coach')).toBe(false);
        expect(canCreateChildTask('coach')).toBe(false);
        expect(canReorderTask('coach')).toBe(false);
        expect(canDeleteTask('coach', coachingTask)).toBe(false);
    });

    it('keeps owner/editor full task capabilities while preserving template-origin delete protection', () => {
        expect(canEditTaskContent('owner')).toBe(true);
        expect(canCreateChildTask('editor')).toBe(true);
        expect(canReorderTask('owner')).toBe(true);
        expect(canUpdateTaskProgress('editor', plainTask)).toBe(true);
        expect(canDeleteTask('editor', plainTask)).toBe(true);
        expect(canDeleteTask('owner', makeTask({ cloned_from_task_id: 'template-task-id' }))).toBe(false);
    });
});
