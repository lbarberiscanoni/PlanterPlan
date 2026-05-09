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
    const phaseLeadUserId = 'viewer-phase-lead';
    const root = makeTask({
        id: 'project-root',
        parent_task_id: null,
        root_id: 'project-root',
        settings: {},
    });
    const phase = makeTask({
        id: 'phase-1',
        parent_task_id: root.id,
        root_id: root.id,
        settings: { phase_lead_user_ids: [phaseLeadUserId] },
    });
    const milestone = makeTask({
        id: 'milestone-1',
        parent_task_id: phase.id,
        root_id: root.id,
        settings: {},
    });
    const phaseLeadTask = makeTask({
        id: 'task-under-phase-lead',
        parent_task_id: milestone.id,
        root_id: root.id,
        origin: 'instance',
        settings: {},
    });
    const siblingPhase = makeTask({
        id: 'phase-2',
        parent_task_id: root.id,
        root_id: root.id,
        settings: {},
    });
    const siblingTask = makeTask({
        id: 'task-outside-phase-lead',
        parent_task_id: siblingPhase.id,
        root_id: root.id,
        origin: 'instance',
        settings: {},
    });
    const allProjectTasks = [root, phase, milestone, phaseLeadTask, siblingPhase, siblingTask];
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
        expect(canEditTaskContent('editor')).toBe(true);
        expect(canEditTaskContent('admin')).toBe(true);
        expect(canCreateChildTask('editor')).toBe(true);
        expect(canReorderTask('owner')).toBe(true);
        expect(canUpdateTaskProgress('editor', plainTask)).toBe(true);
        expect(canDeleteTask('editor', plainTask)).toBe(true);
        expect(canDeleteTask('owner', makeTask({ cloned_from_task_id: 'template-task-id' }))).toBe(false);
    });

    it('keeps viewer and limited users read-only unless they lead an ancestor phase or milestone', () => {
        const phaseLeadContext = {
            task: phaseLeadTask,
            allProjectTasks,
            userId: phaseLeadUserId,
        };

        expect(canEditTaskContent('viewer')).toBe(false);
        expect(canEditTaskContent('limited')).toBe(false);
        expect(canEditTaskContent('viewer', phaseLeadContext)).toBe(true);
        expect(canEditTaskContent('limited', phaseLeadContext)).toBe(true);
        expect(canUpdateTaskProgress('viewer', phaseLeadTask, {
            allProjectTasks,
            userId: phaseLeadUserId,
        })).toBe(true);
    });

    it('does not treat phase lead assignment as self, sibling, create, delete, or reorder authority', () => {
        expect(canEditTaskContent('viewer', {
            task: phase,
            allProjectTasks,
            userId: phaseLeadUserId,
        })).toBe(false);
        expect(canEditTaskContent('viewer', {
            task: siblingTask,
            allProjectTasks,
            userId: phaseLeadUserId,
        })).toBe(false);
        expect(canCreateChildTask('viewer')).toBe(false);
        expect(canCreateChildTask('limited')).toBe(false);
        expect(canReorderTask('viewer')).toBe(false);
        expect(canDeleteTask('viewer', phaseLeadTask)).toBe(false);
        expect(canDeleteTask('limited', phaseLeadTask)).toBe(false);
    });
});
