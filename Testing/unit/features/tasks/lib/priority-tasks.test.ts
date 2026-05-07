import { describe, expect, it } from 'vitest';
import {
  buildPriorityTaskGroups,
  filterPriorityTasks,
  getPriorityTaskMatch,
  PRIORITY_EXCLUDED_STATUSES,
} from '@/features/tasks/lib/priority-tasks';
import { makeProject, makeTask } from '@test/factories';

const NOW = new Date('2026-04-16T12:00:00');

describe('priority task date matching', () => {
  it('qualifies tasks due yesterday as overdue', () => {
    expect(getPriorityTaskMatch(makeTask({ due_date: '2026-04-15' }), NOW)).toEqual({
      overdue: true,
      dueSoon: false,
      current: false,
    });
  });

  it('qualifies tasks due today as due soon', () => {
    expect(getPriorityTaskMatch(makeTask({ due_date: '2026-04-16' }), NOW)).toMatchObject({
      overdue: false,
      dueSoon: true,
    });
  });

  it('qualifies tasks due exactly 7 days from today as due soon', () => {
    expect(getPriorityTaskMatch(makeTask({ due_date: '2026-04-23' }), NOW)).toMatchObject({
      dueSoon: true,
    });
  });

  it('does not qualify due dates 8 days from today without a started start date', () => {
    expect(getPriorityTaskMatch(makeTask({ due_date: '2026-04-24' }), NOW)).toEqual({
      overdue: false,
      dueSoon: false,
      current: false,
    });
  });

  it('qualifies tasks that start today even when due date is missing', () => {
    expect(getPriorityTaskMatch(makeTask({ start_date: '2026-04-16', due_date: null }), NOW)).toMatchObject({
      current: true,
    });
  });

  it('does not qualify tasks that start tomorrow', () => {
    expect(getPriorityTaskMatch(makeTask({ start_date: '2026-04-17', due_date: null }), NOW)).toEqual({
      overdue: false,
      dueSoon: false,
      current: false,
    });
  });

  it('excludes completed tasks that would otherwise qualify', () => {
    expect(
      getPriorityTaskMatch(
        makeTask({ status: 'completed', is_complete: true, due_date: '2026-04-15', start_date: '2026-04-01' }),
        NOW,
      ),
    ).toEqual({
      overdue: false,
      dueSoon: false,
      current: false,
    });
  });

  it('excludes archived, deleted, and cancelled statuses', () => {
    for (const status of PRIORITY_EXCLUDED_STATUSES) {
      expect(getPriorityTaskMatch(makeTask({ status, due_date: '2026-04-15' }), NOW)).toEqual({
        overdue: false,
        dueSoon: false,
        current: false,
      });
    }
  });

  it('does not qualify tasks with missing dates', () => {
    expect(getPriorityTaskMatch(makeTask({ start_date: null, due_date: null }), NOW)).toEqual({
      overdue: false,
      dueSoon: false,
      current: false,
    });
  });
});

describe('priority task milestone grouping', () => {
  const buildGroupingFixture = () => {
    const project = makeProject({
      id: 'project',
      title: 'Alpha Project',
      task_type: 'project',
      position: 100,
    });
    const phase = makeTask({
      id: 'phase',
      title: 'Launch Phase',
      parent_task_id: 'project',
      root_id: 'project',
      task_type: 'phase',
      position: 100,
    });
    const emptyMilestone = makeTask({
      id: 'milestone-empty',
      title: 'Empty Milestone',
      parent_task_id: 'phase',
      root_id: 'project',
      task_type: 'milestone',
      position: 100,
    });
    const activeMilestone = makeTask({
      id: 'milestone-active',
      title: 'Active Milestone',
      parent_task_id: 'phase',
      root_id: 'project',
      task_type: 'milestone',
      position: 200,
    });
    const laterDue = makeTask({
      id: 'task-later-due',
      title: 'Later due',
      parent_task_id: 'milestone-active',
      root_id: 'project',
      task_type: 'task',
      due_date: '2026-04-18',
      position: 100,
    });
    const earlierDue = makeTask({
      id: 'task-earlier-due',
      title: 'Earlier due',
      parent_task_id: 'milestone-active',
      root_id: 'project',
      task_type: 'task',
      due_date: '2026-04-16',
      position: 200,
    });
    const missingDueStarted = makeTask({
      id: 'task-started-no-due',
      title: 'Started without due date',
      parent_task_id: 'milestone-active',
      root_id: 'project',
      task_type: 'task',
      start_date: '2026-04-01',
      due_date: null,
      position: 300,
    });
    const hiddenFuture = makeTask({
      id: 'task-hidden-future',
      title: 'Future hidden',
      parent_task_id: 'milestone-active',
      root_id: 'project',
      task_type: 'task',
      start_date: '2026-04-17',
      due_date: '2026-04-24',
      position: 400,
    });
    const orphan = makeTask({
      id: 'task-orphan',
      title: 'Orphan due soon',
      parent_task_id: 'phase',
      root_id: 'project',
      task_type: 'task',
      due_date: '2026-04-17',
      position: 500,
    });

    return [
      project,
      phase,
      emptyMilestone,
      activeMilestone,
      laterDue,
      earlierDue,
      missingDueStarted,
      hiddenFuture,
      orphan,
    ];
  };

  it('hides empty milestones and shows milestones with qualifying tasks', () => {
    const groups = buildPriorityTaskGroups({ tasks: buildGroupingFixture(), now: NOW });
    expect(groups.map((group) => group.title)).toContain('Active Milestone');
    expect(groups.map((group) => group.title)).not.toContain('Empty Milestone');
  });

  it('hides non-qualifying tasks inside a visible milestone', () => {
    const groups = buildPriorityTaskGroups({ tasks: buildGroupingFixture(), now: NOW });
    const activeGroup = groups.find((group) => group.title === 'Active Milestone');
    expect(activeGroup?.tasks.map((entry) => entry.task.id)).not.toContain('task-hidden-future');
  });

  it('sorts tasks inside a milestone by due date and places missing due dates last', () => {
    const groups = buildPriorityTaskGroups({ tasks: buildGroupingFixture(), now: NOW });
    const activeGroup = groups.find((group) => group.title === 'Active Milestone');
    expect(activeGroup?.tasks.map((entry) => entry.task.id)).toEqual([
      'task-earlier-due',
      'task-later-due',
      'task-started-no-due',
    ]);
  });

  it('keeps qualifying orphan tasks in a clearly labeled project group', () => {
    const groups = buildPriorityTaskGroups({ tasks: buildGroupingFixture(), now: NOW });
    const orphanGroup = groups.find((group) => group.id === 'orphan-project');
    expect(orphanGroup?.title).toBe('No milestone');
    expect(orphanGroup?.projectTitle).toBe('Alpha Project');
    expect(orphanGroup?.tasks.map((entry) => entry.task.id)).toEqual(['task-orphan']);
  });

  it('assigns display-only Dewey-style task numbers from group and task order', () => {
    const groups = buildPriorityTaskGroups({ tasks: buildGroupingFixture(), now: NOW });
    const activeGroup = groups.find((group) => group.title === 'Active Milestone');
    expect(activeGroup?.tasks.map((entry) => entry.displayNumber)).toEqual(['1.1', '1.2', '1.3']);
  });

  it('filters to only qualifying candidate tasks', () => {
    const result = filterPriorityTasks(buildGroupingFixture(), NOW);
    expect(result.map((task) => task.id)).toEqual([
      'task-earlier-due',
      'task-later-due',
      'task-started-no-due',
      'task-orphan',
    ]);
  });
});
