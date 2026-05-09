import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTask } from '@test';

// ---------------------------------------------------------------------------
// Supabase mock — chainable query builder (mirrors planterClient.test.ts)
// ---------------------------------------------------------------------------

function createChain(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'is', 'or', 'order', 'range', 'limit',
    'maybeSingle', 'single', 'abortSignal',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then =
    (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/shared/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

vi.mock('@/shared/lib/retry', () => ({
  retry: (fn: () => unknown) => fn(),
}));

vi.mock('@/shared/lib/date-engine', () => ({
  toIsoDate: (v: unknown) => (v ? String(v) : null),
  nowUtcIso: () => '2026-04-17T00:00:00.000Z',
  calculateMinMaxDates: vi.fn().mockReturnValue({ start_date: null, due_date: null }),
}));

import { planter } from '@/shared/api/planterClient';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Wave 23 Task 3: Task.updateStatus must send only `status` to the server.
// The `sync_task_completion_flags` BEFORE trigger derives `is_complete` at the
// DB layer; the client no longer needs (and should not) mirror that.
// ---------------------------------------------------------------------------

describe('Task.updateStatus — server payload trim (Wave 23 Task 3)', () => {
  it('sends only `status` (no is_complete) when moving a leaf task to completed', async () => {
    const task = makeTask({ id: 't1', parent_task_id: null });
    // Call 1: the root update. Call 2: Task.filter for descendants (empty → no recursion).
    const updateChain = createChain({ data: [task], error: null });
    const filterChain = createChain({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(filterChain);

    await planter.entities.Task.updateStatus('t1', 'completed');

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const payload = updateChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({ status: 'completed' });
    expect(payload).not.toHaveProperty('is_complete');
  });

  it('sends only `status` when moving a task to a non-completed state', async () => {
    const task = makeTask({ id: 't2', parent_task_id: null });
    const updateChain = createChain({ data: [task], error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    await planter.entities.Task.updateStatus('t2', 'in_progress');

    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const payload = updateChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({ status: 'in_progress' });
    expect(payload).not.toHaveProperty('is_complete');
  });

  it('reconcileAncestors parent patch also omits is_complete', async () => {
    // Layout: child 't-child' with parent 't-parent'. Flipping child → completed
    // triggers reconcileAncestors; parent becomes the single sibling and should
    // be marked complete — but the server payload must carry only `status` and
    // `updated_at`, no `is_complete`.
    const child = makeTask({ id: 't-child', parent_task_id: 't-parent', status: 'completed' });
    const parent = makeTask({ id: 't-parent', parent_task_id: null });

    const updateChildChain = createChain({ data: [{ ...child, parent_task_id: 't-parent' }], error: null });
    const filterChildrenOfChild = createChain({ data: [], error: null });       // descendants of child
    const filterChildrenOfParent = createChain({ data: [child], error: null }); // children of parent (for reconcile)
    const updateParentChain = createChain({ data: [parent], error: null });     // parent patch
    const filterChildrenOfGrandparent = createChain({ data: [], error: null }); // no grandparent filter expected

    mockFrom
      .mockReturnValueOnce(updateChildChain)          // child update
      .mockReturnValueOnce(filterChildrenOfChild)     // cascade-down: child has no descendants
      .mockReturnValueOnce(filterChildrenOfParent)    // reconcileAncestors children lookup
      .mockReturnValueOnce(updateParentChain)         // parent update
      .mockReturnValue(filterChildrenOfGrandparent);  // anything further

    await planter.entities.Task.updateStatus('t-child', 'completed');

    expect(updateParentChain.update).toHaveBeenCalled();
    const parentPayload = updateParentChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(parentPayload).not.toHaveProperty('is_complete');
    expect(parentPayload).toHaveProperty('status', 'completed');
    expect(parentPayload).toHaveProperty('updated_at');
  });

  it('reopening a subtask reconciles the task, milestone, and phase ancestors', async () => {
    const subtask = makeTask({
      id: 'subtask-1',
      parent_task_id: 'task-1',
      status: 'in_progress',
      task_type: 'subtask',
    });
    const task = makeTask({
      id: 'task-1',
      parent_task_id: 'milestone-1',
      status: 'in_progress',
      task_type: 'task',
    });
    const milestone = makeTask({
      id: 'milestone-1',
      parent_task_id: 'phase-1',
      status: 'in_progress',
      task_type: 'milestone',
    });
    const phase = makeTask({
      id: 'phase-1',
      parent_task_id: 'project-1',
      status: 'in_progress',
      task_type: 'phase',
    });

    const updateSubtaskChain = createChain({ data: [subtask], error: null });
    const filterTaskChildren = createChain({ data: [subtask], error: null });
    const updateTaskChain = createChain({ data: [task], error: null });
    const filterMilestoneChildren = createChain({ data: [task], error: null });
    const updateMilestoneChain = createChain({ data: [milestone], error: null });
    const filterPhaseChildren = createChain({ data: [milestone], error: null });
    const updatePhaseChain = createChain({ data: [phase], error: null });
    const unexpectedRootChain = createChain({ data: [], error: null });

    mockFrom
      .mockReturnValueOnce(updateSubtaskChain)
      .mockReturnValueOnce(filterTaskChildren)
      .mockReturnValueOnce(updateTaskChain)
      .mockReturnValueOnce(filterMilestoneChildren)
      .mockReturnValueOnce(updateMilestoneChain)
      .mockReturnValueOnce(filterPhaseChildren)
      .mockReturnValueOnce(updatePhaseChain)
      .mockReturnValue(unexpectedRootChain);

    await planter.entities.Task.updateStatus('subtask-1', 'in_progress');

    expect(updateTaskChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    expect(updateMilestoneChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    expect(updatePhaseChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    expect(unexpectedRootChain.update).not.toHaveBeenCalled();
  });
});
