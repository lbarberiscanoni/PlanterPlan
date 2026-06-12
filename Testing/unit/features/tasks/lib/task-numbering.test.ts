import { describe, expect, it } from 'vitest';
import { computeProjectTaskNumbers } from '@/features/tasks/lib/task-numbering';
import { makeProject, makeTask } from '@test/factories';

// Project tree (positions ascending in document order):
//   project
//   ├─ phase-1
//   │   ├─ milestone-1
//   │   │   ├─ task-1
//   │   │   └─ task-2
//   │   └─ milestone-2
//   │       └─ task-3
//   └─ phase-2
//       ├─ milestone-3
//       │   └─ task-4
//       └─ loose-task        (directly under the phase — no milestone above it)
function buildProject(rootId = 'project') {
  const project = makeProject({ id: rootId, origin: 'instance' });
  const phase1 = makeTask({ id: `${rootId}-p1`, parent_task_id: rootId, root_id: rootId, task_type: 'phase', position: 1 });
  const m1 = makeTask({ id: `${rootId}-m1`, parent_task_id: `${rootId}-p1`, root_id: rootId, task_type: 'milestone', position: 1 });
  const t1 = makeTask({ id: `${rootId}-t1`, parent_task_id: `${rootId}-m1`, root_id: rootId, task_type: 'task', position: 1 });
  const t2 = makeTask({ id: `${rootId}-t2`, parent_task_id: `${rootId}-m1`, root_id: rootId, task_type: 'task', position: 2 });
  const m2 = makeTask({ id: `${rootId}-m2`, parent_task_id: `${rootId}-p1`, root_id: rootId, task_type: 'milestone', position: 2 });
  const t3 = makeTask({ id: `${rootId}-t3`, parent_task_id: `${rootId}-m2`, root_id: rootId, task_type: 'task', position: 1 });
  const phase2 = makeTask({ id: `${rootId}-p2`, parent_task_id: rootId, root_id: rootId, task_type: 'phase', position: 2 });
  const m3 = makeTask({ id: `${rootId}-m3`, parent_task_id: `${rootId}-p2`, root_id: rootId, task_type: 'milestone', position: 1 });
  const t4 = makeTask({ id: `${rootId}-t4`, parent_task_id: `${rootId}-m3`, root_id: rootId, task_type: 'task', position: 1 });
  const loose = makeTask({ id: `${rootId}-loose`, parent_task_id: `${rootId}-p2`, root_id: rootId, task_type: 'task', position: 2 });
  return [project, phase1, m1, t1, t2, m2, t3, phase2, m3, t4, loose];
}

describe('computeProjectTaskNumbers', () => {
  it('numbers containers sequentially across the project and leaves as C.k', () => {
    const numbers = computeProjectTaskNumbers(buildProject());

    // Milestones get the integer; their tasks get C.k by document order.
    expect(numbers.get('project-m1')).toBe('1');
    expect(numbers.get('project-t1')).toBe('1.1');
    expect(numbers.get('project-t2')).toBe('1.2');

    expect(numbers.get('project-m2')).toBe('2');
    expect(numbers.get('project-t3')).toBe('2.1');

    expect(numbers.get('project-m3')).toBe('3');
    expect(numbers.get('project-t4')).toBe('3.1');
  });

  it('treats a phase as the container for loose tasks with no milestone above them', () => {
    const numbers = computeProjectTaskNumbers(buildProject());
    // The loose task falls under phase-2, which becomes the 4th container.
    expect(numbers.get('project-loose')).toBe('4.1');
  });

  it('does not number structural rows (phases/project) that only contain containers', () => {
    const numbers = computeProjectTaskNumbers(buildProject());
    // phase-1 holds milestones (not loose leaves), so it never becomes a
    // numbered container; the project root is never numbered.
    expect(numbers.has('project-p1')).toBe(false);
    expect(numbers.has('project')).toBe(false);
  });

  it('is per-project: a task keeps the same number regardless of other projects in the set', () => {
    const single = computeProjectTaskNumbers(buildProject('project'));
    const combined = computeProjectTaskNumbers([...buildProject('project'), ...buildProject('other')]);

    for (const id of ['project-m1', 'project-t1', 'project-t2', 'project-t3', 'project-t4', 'project-loose']) {
      expect(combined.get(id)).toBe(single.get(id));
    }
    // The second project restarts its own numbering at 1.
    expect(combined.get('other-m1')).toBe('1');
    expect(combined.get('other-t1')).toBe('1.1');
  });
});
