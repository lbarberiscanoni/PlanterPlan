import { describe, it, expect } from 'vitest';
import { filterAndSortTasks } from '@/features/tasks/hooks/useTaskFilters';
import { makeTask, makeProject } from '@test/factories';

const NOW = new Date('2026-04-16T12:00:00.000Z');
const USER_ID = 'user-1';

// Hierarchy:
//   project (root, instance, due_soon_threshold=3)
//   ├─ phase-1   (task_type='phase')
//   │   ├─ m-overdue   (task_type='milestone', due 2026-04-10)
//   │   ├─ m-soon      (task_type='milestone', due 2026-04-18)
//   │   └─ leak-task   (task_type='task'; grand-child but NOT a milestone —
//   │                   Wave 32 regression guard: structural predicate would
//   │                   have pulled this into the 'milestones' filter.)
//   ├─ phase-2   (task_type='phase')
//   │   └─ m-current   (task_type='milestone', due 2026-05-20)
//   ├─ t-priority      (task_type='task', priority='high', status='todo', due 2026-05-20)
//   ├─ t-future        (task_type='task', status='todo', start 2026-05-01, due 2026-05-10)
//   ├─ t-done          (task_type='task', status='completed', is_complete=true, due 2026-03-15)
//   └─ t-current       (task_type='task', status='in_progress', due 2026-05-15)
//
//   tpl-root (origin='template')
//   └─ tpl-m (origin='template', task_type='milestone') — excluded by origin
function buildFixture() {
 const project = makeProject({
  id: 'project',
  title: 'Z Project',
  origin: 'instance',
  settings: { due_soon_threshold: 3 },
 });
 const phase1 = makeTask({
  id: 'phase-1',
  title: 'Phase 1',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'phase',
 });
 const phase2 = makeTask({
  id: 'phase-2',
  title: 'Phase 2',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'phase',
 });
 const milestoneOverdue = makeTask({
  id: 'm-overdue',
  title: 'Alpha milestone overdue',
  parent_task_id: 'phase-1',
  root_id: 'project',
  origin: 'instance',
  task_type: 'milestone',
  due_date: '2026-04-10',
 });
 const milestoneDueSoon = makeTask({
  id: 'm-soon',
  title: 'Beta milestone soon',
  parent_task_id: 'phase-1',
  root_id: 'project',
  origin: 'instance',
  task_type: 'milestone',
  due_date: '2026-04-18',
 });
 // Wave 32 regression: a grand-child of the root that is NOT a milestone.
 // The pre-fix structural predicate would have incorrectly classified this
 // as a milestone; the task_type-based predicate must not.
 const leakGrandChildTask = makeTask({
  id: 'leak-task',
  title: 'Sigma leaked grand-child task',
  parent_task_id: 'phase-1',
  root_id: 'project',
  origin: 'instance',
  task_type: 'task',
  status: 'todo',
  creator: USER_ID,
  assignee_id: null,
  due_date: '2026-05-20',
 });
 const milestoneCurrent = makeTask({
  id: 'm-current',
  title: 'Gamma milestone current',
  parent_task_id: 'phase-2',
  root_id: 'project',
  origin: 'instance',
  task_type: 'milestone',
  due_date: '2026-05-20',
 });
 const taskPriority = makeTask({
  id: 't-priority',
  title: 'Zeta priority task',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'task',
  status: 'todo',
  priority: 'high',
  assignee_id: USER_ID,
  due_date: '2026-05-20',
 });
 const taskFuture = makeTask({
  id: 't-future',
  title: 'Delta future task',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'task',
  status: 'todo',
  start_date: '2026-05-01',
  due_date: '2026-05-10',
 });
 const taskDone = makeTask({
  id: 't-done',
  title: 'Epsilon done task',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'task',
  status: 'completed',
  is_complete: true,
  due_date: '2026-03-15',
 });
 const taskCurrent = makeTask({
  id: 't-current',
  title: 'Eta in-progress task',
  parent_task_id: 'project',
  root_id: 'project',
  origin: 'instance',
  task_type: 'task',
  status: 'in_progress',
  due_date: '2026-05-15',
 });
 const templateRoot = makeProject({
  id: 'tpl-root',
  title: 'Template root',
  origin: 'template',
 });
 const templateMilestone = makeTask({
  id: 'tpl-m',
  title: 'Template milestone',
  parent_task_id: 'tpl-root',
  root_id: 'tpl-root',
  origin: 'template',
  task_type: 'milestone',
  due_date: '2026-04-10',
 });
 return [
  project,
  phase1,
  phase2,
  milestoneOverdue,
  milestoneDueSoon,
  leakGrandChildTask,
  milestoneCurrent,
  taskPriority,
  taskFuture,
  taskDone,
  taskCurrent,
  templateRoot,
  templateMilestone,
 ];
}

const ALL_INSTANCE_CHILDREN = [
 'phase-1',
 'phase-2',
 'm-overdue',
 'm-soon',
 'leak-task',
 'm-current',
 't-priority',
 't-future',
 't-done',
 't-current',
];

describe('filterAndSortTasks — views', () => {
 it("'my_tasks' returns assigned tasks plus unassigned tasks created by the current user", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'my_tasks',
   sort: 'chronological',
   now: NOW,
   currentUserId: USER_ID,
  });
  expect(result.map((t) => t.id).sort()).toEqual(['leak-task', 't-priority'].sort());
 });

 it("'my_tasks' returns no rows without a current user id", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'my_tasks', sort: 'chronological', now: NOW });
  expect(result).toEqual([]);
 });

 it("'priority' keeps only priority==='high' and excludes completed", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'priority', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id)).toEqual(['t-priority']);
 });

 it("'overdue' keeps only urgency==='overdue'", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'overdue', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id)).toEqual(['m-overdue']);
 });

 it("'due_soon' keeps tasks within the default 3-day window", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'due_soon', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id)).toEqual(['m-soon']);
 });

 it("'current' keeps active tasks past start, not imminent", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'current', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id).sort()).toEqual(
   ['leak-task', 'm-current', 't-current', 't-priority'].sort(),
  );
 });

 it("'not_yet_due' keeps tasks with start_date in the future", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'not_yet_due', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id)).toEqual(['t-future']);
 });

 it("'completed' keeps is_complete OR status==='completed'", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'completed', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id)).toEqual(['t-done']);
 });

 it("'all_tasks' returns every instance non-root task", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'all_tasks', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id).sort()).toEqual([...ALL_INSTANCE_CHILDREN].sort());
 });

 it("'milestones' returns ONLY rows with task_type='milestone'", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'milestones', sort: 'chronological', now: NOW });
  expect(result.map((t) => t.id).sort()).toEqual(['m-current', 'm-overdue', 'm-soon'].sort());
 });

 it("'milestones' excludes template-origin rows (origin='template') even when task_type='milestone'", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'milestones', sort: 'chronological', now: NOW });
  expect(result.every((t) => t.origin === 'instance')).toBe(true);
  expect(result.find((t) => t.id === 'tpl-m')).toBeUndefined();
 });

 it("'milestones' excludes grand-children whose task_type !== 'milestone' (Wave 32 regression)", () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'milestones', sort: 'chronological', now: NOW });
  expect(result.find((t) => t.id === 'leak-task')).toBeUndefined();
 });

 it("'milestones' uses the task_type discriminator, not hierarchical depth", () => {
  // Depth-1 row (direct child of root) explicitly marked as a milestone.
  // The discriminator is the source of truth — the predicate must not reject
  // it on structural grounds.
  const project = makeProject({ id: 'p', origin: 'instance' });
  const depth1Milestone = makeTask({
   id: 'm-depth1',
   parent_task_id: 'p',
   root_id: 'p',
   origin: 'instance',
   task_type: 'milestone',
  });
  const result = filterAndSortTasks({
   tasks: [project, depth1Milestone],
   filter: 'milestones',
   sort: 'chronological',
   now: NOW,
  });
  expect(result.map((t) => t.id)).toEqual(['m-depth1']);
 });
});

describe('filterAndSortTasks — sort', () => {
 it('chronological sorts ascending by due_date, nulls last', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'all_tasks', sort: 'chronological', now: NOW });
  const ids = result.map((t) => t.id);
  // 't-done' has the earliest due (2026-03-15) among instance children.
  expect(ids[0]).toBe('t-done');
  // Null-due rows (phase-1, phase-2) sort last. Stable sort preserves
  // insertion order among them, so either could be final — assert
  // containment rather than position.
  expect(['phase-1', 'phase-2']).toContain(ids[ids.length - 1]);
  expect(['phase-1', 'phase-2']).toContain(ids[ids.length - 2]);
 });

 it('alphabetical sorts by title', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({ tasks, filter: 'all_tasks', sort: 'alphabetical', now: NOW });
  const titles = result.map((t) => t.title);
  const sorted = [...titles].sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  expect(titles).toEqual(sorted);
 });
});

describe('filterAndSortTasks — per-project threshold', () => {
 it('respects a custom due_soon_threshold from the root task settings', () => {
  const project = makeProject({
   id: 'p2',
   origin: 'instance',
   settings: { due_soon_threshold: 10 },
  });
  const child = makeTask({
   id: 'c2',
   title: 'Task',
   parent_task_id: 'p2',
   root_id: 'p2',
   origin: 'instance',
   due_date: '2026-04-25', // 9 days out — within 10-day threshold
  });
  const result = filterAndSortTasks({
   tasks: [project, child],
   filter: 'due_soon',
   sort: 'chronological',
   now: NOW,
  });
  expect(result.map((t) => t.id)).toEqual(['c2']);
 });
});

describe('filterAndSortTasks — dueDateRange (Wave 33)', () => {
 it('passes through when both bounds are null', () => {
  const tasks = buildFixture();
  const base = filterAndSortTasks({ tasks, filter: 'all_tasks', sort: 'chronological', now: NOW });
  const ranged = filterAndSortTasks({
   tasks,
   filter: 'all_tasks',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: null, end: null },
  });
  expect(ranged.map((t) => t.id)).toEqual(base.map((t) => t.id));
 });

 it('includes tasks with due_date within inclusive bounds', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'all_tasks',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: '2026-04-10', end: '2026-04-18' },
  });
  expect(result.map((t) => t.id).sort()).toEqual(['m-overdue', 'm-soon'].sort());
 });

 it('supports an open-ended lower bound (start=null, end=X)', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'all_tasks',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: null, end: '2026-04-18' },
  });
  expect(result.map((t) => t.id).sort()).toEqual(['m-overdue', 'm-soon', 't-done'].sort());
 });

 it('supports an open-ended upper bound (start=X, end=null)', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'all_tasks',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: '2026-05-01', end: null },
  });
  expect(result.map((t) => t.id).sort()).toEqual(
   ['leak-task', 'm-current', 't-current', 't-future', 't-priority'].sort(),
  );
 });

 it('excludes tasks with null due_date when any bound is set', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'all_tasks',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: '2026-01-01', end: null },
  });
  // phase-1 / phase-2 are null-due — dropped the moment either bound is set.
  expect(result.find((t) => t.id === 'phase-1')).toBeUndefined();
  expect(result.find((t) => t.id === 'phase-2')).toBeUndefined();
 });

 it('combines with status filters via AND (completed AND in range)', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'completed',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: '2026-03-01', end: '2026-03-31' },
  });
  // t-done (due 2026-03-15, completed) matches; no other completed rows in the range.
  expect(result.map((t) => t.id)).toEqual(['t-done']);
 });

 it('ANDs with the milestones filter to narrow to milestones in range', () => {
  const tasks = buildFixture();
  const result = filterAndSortTasks({
   tasks,
   filter: 'milestones',
   sort: 'chronological',
   now: NOW,
   dueDateRange: { start: '2026-05-01', end: '2026-05-31' },
  });
  // m-current is the only milestone in May.
  expect(result.map((t) => t.id)).toEqual(['m-current']);
 });
});
