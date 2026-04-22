import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTask } from '@test';

// Chainable Supabase query mock — matches the harness in planterClient.test.ts
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

// Import after mocks
import { planter } from '@/shared/api/planterClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Task.clone — spawnedFromTemplate stamping (Wave 22)', () => {
  it('stamps settings.spawnedFromTemplate on the cloned root after a successful RPC', async () => {
    const rpcResult = {
      new_root_id: 'cloned-root-uuid',
      root_project_id: 'project-root-uuid',
      tasks_cloned: 5,
    };
    mockRpc.mockResolvedValueOnce({ data: rpcResult, error: null });

    // First from() call: Task.get(new_root_id) — returns existing row with empty settings.
    const existingRow = makeTask({ id: 'cloned-root-uuid', settings: null });
    const getChain = createChain({ data: existingRow, error: null });
    // Second from() call: Task.get(templateId) for the Wave 36 template_version
    // lookup. Return a template without the column so the stamp is omitted —
    // keeps this test focused on spawnedFromTemplate.
    const templateLookupChain = createChain({
      data: makeTask({ id: 'tmpl-xyz', origin: 'template' }),
      error: null,
    });
    // Third from() call: Task.update(...) — echoes back the updated row.
    const updateChain = createChain({
      data: [{ ...existingRow, settings: { spawnedFromTemplate: 'tmpl-xyz' } }],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(getChain)
      .mockReturnValueOnce(templateLookupChain)
      .mockReturnValueOnce(updateChain);

    const result = await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');

    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('clone_project_template', expect.objectContaining({
      p_template_id: 'tmpl-xyz',
    }));
    // The follow-up update call must target the cloned row.
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const [updatePayload] = updateChain.update.mock.calls[0];
    expect(updatePayload).toEqual({ settings: { spawnedFromTemplate: 'tmpl-xyz' } });
  });

  it('preserves existing settings keys when merging the stamp', async () => {
    const rpcResult = { new_root_id: 'cloned-root-uuid', tasks_cloned: 1 };
    mockRpc.mockResolvedValueOnce({ data: rpcResult, error: null });

    const existingRow = makeTask({
      id: 'cloned-root-uuid',
      settings: { published: true, due_soon_threshold: 5 },
    });
    const getChain = createChain({ data: existingRow, error: null });
    const templateLookupChain = createChain({
      data: makeTask({ id: 'tmpl-xyz', origin: 'template' }),
      error: null,
    });
    const updateChain = createChain({ data: [existingRow], error: null });
    mockFrom
      .mockReturnValueOnce(getChain)
      .mockReturnValueOnce(templateLookupChain)
      .mockReturnValueOnce(updateChain);

    await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');

    const [updatePayload] = updateChain.update.mock.calls[0];
    expect(updatePayload).toEqual({
      settings: {
        published: true,
        due_soon_threshold: 5,
        spawnedFromTemplate: 'tmpl-xyz',
      },
    });
  });

  it('still returns a successful clone when the follow-up stamp update fails', async () => {
    const rpcResult = { new_root_id: 'cloned-root-uuid', tasks_cloned: 1 };
    mockRpc.mockResolvedValueOnce({ data: rpcResult, error: null });

    // get() resolves normally, but the update() call rejects — stamp is best-effort.
    const existingRow = makeTask({ id: 'cloned-root-uuid', settings: null });
    const getChain = createChain({ data: existingRow, error: null });
    const templateLookupChain = createChain({
      data: makeTask({ id: 'tmpl-xyz', origin: 'template' }),
      error: null,
    });
    const failingUpdateChain = createChain({
      data: null,
      error: { message: 'rls violation', code: '42501' },
    });
    mockFrom
      .mockReturnValueOnce(getChain)
      .mockReturnValueOnce(templateLookupChain)
      .mockReturnValueOnce(failingUpdateChain);

    // Suppress the expected console.error so test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');
    errSpy.mockRestore();

    expect(result.error).toBeNull();
    expect(result.data).toEqual(rpcResult);
  });

  it('skips the stamp entirely when the RPC response has no new_root_id', async () => {
    // Degenerate shape (shouldn't happen with current RPC, but defensive coverage).
    mockRpc.mockResolvedValueOnce({ data: { tasks_cloned: 0 }, error: null });

    const result = await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');

    expect(result.error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips the stamp UPDATE when the cloned row cannot be fetched (null), preserving any RPC-populated settings', async () => {
    // Guard against a transient Task.get → null from clobbering settings the
    // RPC (or a future migration) might have populated on the clone.
    const rpcResult = { new_root_id: 'cloned-root-uuid', tasks_cloned: 1 };
    mockRpc.mockResolvedValueOnce({ data: rpcResult, error: null });

    const nullGetChain = createChain({ data: null, error: null });
    // Fallback Task.get after the skip — return null too, so clone falls back
    // to returning the raw RPC result.
    const fallbackGetChain = createChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(nullGetChain)
      .mockReturnValueOnce(fallbackGetChain);

    const result = await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');

    expect(result.error).toBeNull();
    // Critical: no update was issued — we never clobber settings on a null read.
    expect(nullGetChain.update).not.toHaveBeenCalled();
    expect(fallbackGetChain.update).not.toHaveBeenCalled();
  });

  it('returns a hydrated Task object (not the raw RPC result) after a successful stamp', async () => {
    const rpcResult = { new_root_id: 'cloned-root-uuid', tasks_cloned: 1 };
    mockRpc.mockResolvedValueOnce({ data: rpcResult, error: null });

    const existingRow = makeTask({ id: 'cloned-root-uuid', settings: null });
    const updatedRow = { ...existingRow, settings: { spawnedFromTemplate: 'tmpl-xyz' } };
    const getChain = createChain({ data: existingRow, error: null });
    const templateLookupChain = createChain({
      data: makeTask({ id: 'tmpl-xyz', origin: 'template' }),
      error: null,
    });
    const updateChain = createChain({ data: [updatedRow], error: null });
    mockFrom
      .mockReturnValueOnce(getChain)
      .mockReturnValueOnce(templateLookupChain)
      .mockReturnValueOnce(updateChain);

    const result = await planter.entities.Task.clone('tmpl-xyz', null, 'instance', 'user-1');

    expect(result.error).toBeNull();
    // Not the RPC result — the returned data must be a Task (has `id`).
    expect((result.data as { id?: string } | null)?.id).toBe('cloned-root-uuid');
    expect((result.data as { new_root_id?: string } | null)?.new_root_id).toBeUndefined();
  });
});
