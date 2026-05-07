import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  constructUpdatePayload,
  constructCreatePayload,
  type TaskFormData,
  type CurrentTask,
  type UpdateContext,
  type CreateContext,
} from '@/shared/lib/date-engine/payloadHelpers';
import { POSITION_STEP } from '@/shared/constants';

// Mock nowUtcIso to return a deterministic value
vi.mock('@/shared/lib/date-engine/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/date-engine/index')>();
  return {
    ...actual,
    nowUtcIso: () => '2026-03-25T00:00:00.000Z',
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// constructUpdatePayload
// ---------------------------------------------------------------------------
describe('constructUpdatePayload', () => {
  const baseForm: TaskFormData = {
    title: 'Test Task',
    description: 'desc',
    notes: 'note',
    purpose: 'purpose',
    actions: 'actions',
  };

  const currentTask: CurrentTask = {
    id: 'task-1',
    start_date: '2026-01-10',
    due_date: '2026-01-20',
  };

  it('returns base fields for template origin (no date math)', () => {
    const ctx: UpdateContext = { origin: 'template', parentId: null };
    const result = constructUpdatePayload(baseForm, currentTask, ctx);
    expect(result.title).toBe('Test Task');
    expect(result.description).toBe('desc');
    expect(result.updated_at).toBe('2026-03-25T00:00:00.000Z');
    expect(result.start_date).toBeUndefined();
    expect(result.due_date).toBeUndefined();
  });

  it('calculates dates from days_from_start for instances', () => {
    const projectRoot = { id: 'proj', parent_task_id: null, start_date: '2026-01-01', due_date: null };
    const parent = { id: 'parent', parent_task_id: 'proj', start_date: '2026-01-01', due_date: null };
    const ctx: UpdateContext = {
      origin: 'instance',
      parentId: 'parent',
      contextTasks: [projectRoot, parent],
    };
    const form: TaskFormData = { ...baseForm, days_from_start: 10 };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.start_date).toBe('2026-01-15');
    expect(result.due_date).toBe('2026-01-15');
    expect(result.days_from_start).toBe(10);
  });

  it('uses manual dates when provided (overrides calculated)', () => {
    const ctx: UpdateContext = {
      origin: 'instance',
      parentId: 'parent',
      contextTasks: [],
    };
    const form: TaskFormData = {
      ...baseForm,
      days_from_start: 10,
      start_date: '2026-06-01',
      due_date: '2026-06-15',
    };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.start_date).toBe('2026-06-01');
    expect(result.due_date).toBe('2026-06-15');
  });

  it('clears schedule when no days and no manual dates for instance', () => {
    const ctx: UpdateContext = {
      origin: 'instance',
      parentId: 'parent',
      contextTasks: [],
    };
    const form: TaskFormData = { ...baseForm };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.start_date).toBeUndefined();
    expect(result.due_date).toBeUndefined();
    expect(result.days_from_start).toBeNull();
  });

  it('handles null description/notes/purpose/actions', () => {
    const ctx: UpdateContext = { origin: 'template', parentId: null };
    const form: TaskFormData = { title: 'Minimal' };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.description).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.purpose).toBeNull();
    expect(result.actions).toBeNull();
  });

  it('uses start_date as due_date fallback when only start_date is manual', () => {
    const ctx: UpdateContext = {
      origin: 'instance',
      parentId: null,
      contextTasks: [],
    };
    const form: TaskFormData = {
      ...baseForm,
      start_date: '2026-06-01',
    };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.start_date).toBe('2026-06-01');
    expect(result.due_date).toBe('2026-06-01');
  });

  it('parses string days_from_start as number', () => {
    const ctx: UpdateContext = { origin: 'template', parentId: null };
    const form: TaskFormData = { ...baseForm, days_from_start: '15' as unknown as string | number };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.days_from_start).toBe(15);
  });

  it('treats empty string days_from_start as null', () => {
    const ctx: UpdateContext = { origin: 'template', parentId: null };
    const form: TaskFormData = { ...baseForm, days_from_start: '' as unknown as string | number };
    const result = constructUpdatePayload(form, currentTask, ctx);
    expect(result.days_from_start).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// constructCreatePayload
// ---------------------------------------------------------------------------
describe('constructCreatePayload', () => {
  const baseForm: TaskFormData = {
    title: 'New Task',
    description: 'desc',
    notes: null,
    purpose: null,
    actions: null,
  };

  const baseCtx: CreateContext = {
    origin: 'instance',
    parentId: 'parent-1',
    rootId: 'root-1',
    contextTasks: [],
    userId: 'user-1',
    maxPosition: 20000,
  };

  it('sets position to maxPosition + POSITION_STEP', () => {
    const result = constructCreatePayload(baseForm, baseCtx);
    expect(result.position).toBe(20000 + POSITION_STEP);
  });

  it('defaults position to POSITION_STEP when maxPosition is null', () => {
    const ctx: CreateContext = { ...baseCtx, maxPosition: null };
    const result = constructCreatePayload(baseForm, ctx);
    expect(result.position).toBe(POSITION_STEP);
  });

  it('sets creator, parent_task_id, root_id, origin', () => {
    const result = constructCreatePayload(baseForm, baseCtx);
    expect(result.creator).toBe('user-1');
    expect(result.parent_task_id).toBe('parent-1');
    expect(result.root_id).toBe('root-1');
    expect(result.origin).toBe('instance');
    expect(result.is_complete).toBe(false);
  });

  it('calculates dates from days_from_start for instances', () => {
    const projectRoot = { id: 'root-1', parent_task_id: null, start_date: '2026-01-01', due_date: null };
    const parent = { id: 'parent-1', parent_task_id: 'root-1', start_date: '2026-01-01', due_date: null };
    const ctx: CreateContext = {
      ...baseCtx,
      contextTasks: [projectRoot, parent],
    };
    const form: TaskFormData = { ...baseForm, days_from_start: 5 };
    const result = constructCreatePayload(form, ctx);
    expect(result.start_date).toBe('2026-01-08');
    expect(result.due_date).toBe('2026-01-08');
  });

  it('uses manual dates when provided', () => {
    const form: TaskFormData = {
      ...baseForm,
      start_date: '2026-06-01',
      due_date: '2026-06-30',
    };
    const result = constructCreatePayload(form, baseCtx);
    expect(result.start_date).toBe('2026-06-01');
    expect(result.due_date).toBe('2026-06-30');
  });

  it('skips date math for template origin', () => {
    const ctx: CreateContext = { ...baseCtx, origin: 'template' };
    const form: TaskFormData = { ...baseForm, days_from_start: 10 };
    const result = constructCreatePayload(form, ctx);
    expect(result.start_date).toBeUndefined();
    expect(result.due_date).toBeUndefined();
    expect(result.days_from_start).toBe(10);
  });

  it('uses start_date as due_date fallback for manual dates', () => {
    const form: TaskFormData = { ...baseForm, start_date: '2026-06-01' };
    const result = constructCreatePayload(form, baseCtx);
    expect(result.start_date).toBe('2026-06-01');
    expect(result.due_date).toBe('2026-06-01');
  });

  it('handles full form data with all fields', () => {
    const form: TaskFormData = {
      title: 'Full Task',
      description: 'full desc',
      notes: 'full notes',
      purpose: 'full purpose',
      actions: 'full actions',
      days_from_start: 0,
    };
    const result = constructCreatePayload(form, baseCtx);
    expect(result.title).toBe('Full Task');
    expect(result.description).toBe('full desc');
    expect(result.notes).toBe('full notes');
    expect(result.purpose).toBe('full purpose');
    expect(result.actions).toBe('full actions');
    expect(result.days_from_start).toBe(0);
  });
});
