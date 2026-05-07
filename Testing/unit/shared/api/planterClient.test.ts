import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTask } from '@test';
import type { PersonInsert, PersonUpdate, PersonRow, TaskRow, TaskUpdate, UserMetadata } from '@/shared/db/app.types';

// ---------------------------------------------------------------------------
// Supabase mock — chainable query builder
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
  // Make the chain thenable so `await query` resolves
  (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockGetUser = vi.fn();
const mockSignOut = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock('@/shared/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
  },
}));

// Mock retry as passthrough (retry logic tested separately in retry.test.ts)
vi.mock('@/shared/lib/retry', () => ({
  retry: (fn: () => unknown) => fn(),
}));

// Mock date-engine helpers
vi.mock('@/shared/lib/date-engine', () => ({
  toIsoDate: (v: unknown) => (v ? String(v) : null),
  nowUtcIso: () => '2026-03-25T00:00:00.000Z',
  calculateMinMaxDates: vi.fn().mockReturnValue({ start_date: '2026-01-01', due_date: '2026-06-01' }),
}));

// Import after mocks
import { planter, PlanterError } from '@/shared/api/planterClient';
import { calculateMinMaxDates } from '@/shared/lib/date-engine';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 4a-1: Base CRUD via Person entity (simplest — `people` table)
// ---------------------------------------------------------------------------
describe('Base EntityClient CRUD (Person)', () => {
  it('list() calls supabase.from("people").select("*")', async () => {
    const chain = createChain({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Person.list();

    expect(mockFrom).toHaveBeenCalledWith('people');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('get(id) chains .eq("id", id).maybeSingle()', async () => {
    const chain = createChain({ data: { id: 'p1', name: 'Test' }, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Person.get('p1');

    expect(chain.eq).toHaveBeenCalledWith('id', 'p1');
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual({ id: 'p1', name: 'Test' });
  });

  it('create(payload) chains .insert(payload).select("*")', async () => {
    const payload = { name: 'New Person' };
    const chain = createChain({ data: [{ id: 'p2', ...payload }], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Person.create(payload as PersonInsert);

    expect(chain.insert).toHaveBeenCalledWith(payload);
    expect(chain.select).toHaveBeenCalledWith('*');
  });

  it('update(id, payload) chains .update(payload).eq("id", id).select("*")', async () => {
    const payload = { name: 'Updated' };
    const chain = createChain({ data: [{ id: 'p1', ...payload }], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Person.update('p1', payload as PersonUpdate);

    expect(chain.update).toHaveBeenCalledWith(payload);
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('update(id, payload) reports an empty update result as not found', async () => {
    const payload = { name: 'Missing' };
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await expect(planter.entities.Person.update('missing-id', payload as PersonUpdate))
      .rejects.toMatchObject({ status: 404 });
  });

  it('delete(id) chains .delete().eq("id", id)', async () => {
    const chain = createChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Person.delete('p1');

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1');
    expect(result).toBe(true);
  });

  it('filter() chains .eq() for values and .is() for null', async () => {
    const chain = createChain({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Person.filter({ project_id: 'proj-1', status: null } as Partial<PersonRow>);

    expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(chain.is).toHaveBeenCalledWith('status', null);
  });

  it('filter() ignores inherited enumerable properties', async () => {
    const chain = createChain({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(chain);
    const filters = Object.create({ role: 'admin' }) as Partial<PersonRow>;
    filters.project_id = 'proj-1';

    await planter.entities.Person.filter(filters);

    expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(chain.eq).not.toHaveBeenCalledWith('role', 'admin');
  });
});

describe('Task protected scaffold failure paths', () => {
  it('surfaces DB trigger rejection from Task.update', async () => {
    const chain = createChain({
      data: null,
      error: { message: 'protected template scaffold fields cannot be changed', code: 'P0001' },
    });
    mockFrom.mockReturnValue(chain);

    await expect(
      planter.entities.Task.update('protected-task', { title: 'Mutated' } as TaskUpdate),
    ).rejects.toMatchObject({
      name: 'PlanterError',
      message: 'protected template scaffold fields cannot be changed',
      status: 'P0001',
    });
    expect(chain.update).toHaveBeenCalledWith({ title: 'Mutated' });
  });

  it('surfaces DB trigger rejection from Task.delete', async () => {
    const chain = createChain({
      data: null,
      error: { message: 'protected template scaffold tasks cannot be deleted', code: 'P0001' },
    });
    mockFrom.mockReturnValue(chain);

    await expect(planter.entities.Task.delete('protected-task')).rejects.toMatchObject({
      name: 'PlanterError',
      message: 'protected template scaffold tasks cannot be deleted',
      status: 'P0001',
    });
    expect(chain.delete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4a-2: Project entity overrides
// ---------------------------------------------------------------------------
describe('Project entity', () => {
  it('create() inserts into tasks then calls rpc("initialize_default_project")', async () => {
    const project = { id: 'proj-1', title: 'My Project' };
    const insertChain = createChain({ data: [project], error: null });
    mockFrom.mockReturnValue(insertChain);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await planter.entities.Project.create({ title: 'My Project', start_date: '2026-01-01' });

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'My Project',
      origin: 'instance',
      creator: 'user-1',
    }));
    expect(mockRpc).toHaveBeenCalledWith('initialize_default_project', {
      p_project_id: 'proj-1',
      p_creator_id: 'user-1',
    });
    expect(result).toEqual(project);
  });

  it('create() deletes project on RPC failure', async () => {
    const project = { id: 'proj-fail', title: 'Fail' };
    const insertChain = createChain({ data: [project], error: null });
    const deleteChain = createChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(insertChain) // insert
      .mockReturnValueOnce(deleteChain); // delete cleanup
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });

    await expect(
      planter.entities.Project.create({ title: 'Fail' }),
    ).rejects.toThrow('Project initialization failed');

    // Should have attempted cleanup deletion
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('listByCreator() adds pagination and project filters', async () => {
    const chain = createChain({ data: [makeTask()], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Project.listByCreator('user-1', 2, 10);

    expect(chain.eq).toHaveBeenCalledWith('creator', 'user-1');
    expect(chain.is).toHaveBeenCalledWith('parent_task_id', null);
    expect(chain.eq).toHaveBeenCalledWith('origin', 'instance');
    expect(chain.range).toHaveBeenCalledWith(10, 19); // page 2, pageSize 10
  });

  it('listJoined() uses inner join on project_members', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Project.listJoined('user-1');

    expect(chain.select).toHaveBeenCalledWith('*, project_members!inner(*)');
    expect(chain.eq).toHaveBeenCalledWith('project_members.user_id', 'user-1');
    expect(chain.neq).toHaveBeenCalledWith('creator', 'user-1');
  });

  it('getWithStats() computes progress from children', async () => {
    const project = makeTask({ id: 'proj-1' });
    const children = [
      { id: 't1', root_id: 'proj-1', is_complete: true },
      { id: 't2', root_id: 'proj-1', is_complete: false },
      { id: 't3', root_id: 'proj-1', is_complete: true },
    ];

    // First call: get project, second call: get children
    mockFrom
      .mockReturnValueOnce(createChain({ data: project, error: null }))
      .mockReturnValueOnce(createChain({ data: children, error: null }));

    const result = await planter.entities.Project.getWithStats('proj-1');

    expect(result.data.stats.totalTasks).toBe(3);
    expect(result.data.stats.completedTasks).toBe(2);
    expect(result.data.stats.progress).toBe(67); // Math.round(2/3 * 100)
  });

  it('addMember() inserts into project_members', async () => {
    const member = { project_id: 'proj-1', user_id: 'user-2', role: 'editor' };
    const chain = createChain({ data: [member], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Project.addMember('proj-1', 'user-2', 'editor');

    expect(mockFrom).toHaveBeenCalledWith('project_members');
    expect(chain.insert).toHaveBeenCalledWith(member);
  });

  it('TeamMember.listByProjectWithProfiles() calls the profile hydration RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'm1',
          project_id: 'proj-1',
          user_id: 'user-2',
          role: 'editor',
          joined_at: '2026-05-07T00:00:00Z',
          email: 'editor@example.com',
          first_name: 'Ed',
          last_name: 'Itor',
          display_name: 'Ed Itor',
          avatar_url: null,
        },
      ],
      error: null,
    });

    const result = await planter.entities.TeamMember.listByProjectWithProfiles('proj-1');

    expect(mockRpc).toHaveBeenCalledWith('list_project_members_with_profiles', { p_project_id: 'proj-1' });
    expect(result[0]).toMatchObject({
      id: 'm1',
      email: 'editor@example.com',
      display_name: 'Ed Itor',
    });
  });
});

// ---------------------------------------------------------------------------
// 4a-3: Task entity custom methods
// ---------------------------------------------------------------------------
describe('Task entity', () => {
  it('clone() calls rpc("clone_project_template") with params', async () => {
    const cloned = makeTask({ id: 'cloned-1' });
    mockRpc.mockResolvedValue({ data: cloned, error: null });

    const result = await planter.entities.Task.clone('tmpl-1', null, 'instance', 'user-1');

    // clone calls planter.rpc which calls supabase.rpc
    expect(mockRpc).toHaveBeenCalledWith('clone_project_template', expect.objectContaining({
      p_template_id: 'tmpl-1',
      p_new_parent_id: null,
      p_new_origin: 'instance',
      p_user_id: 'user-1',
    }));
    expect(result.data).toEqual(cloned);
  });

  it('clone() passes optional overrides', async () => {
    mockRpc.mockResolvedValue({ data: makeTask(), error: null });

    await planter.entities.Task.clone('tmpl-1', null, 'instance', 'user-1', {
      title: 'Custom Title',
      start_date: '2026-06-01',
    });

    expect(mockRpc).toHaveBeenCalledWith('clone_project_template', expect.objectContaining({
      p_title: 'Custom Title',
      p_start_date: '2026-06-01',
    }));
  });

  it('updateStatus() recursively updates children when completed', async () => {
    // Mock Task.update (base CRUD) and Task.filter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _parent = makeTask({ id: 'parent' });
    const child1 = makeTask({ id: 'child-1', parent_task_id: 'parent' });
    const child2 = makeTask({ id: 'child-2', parent_task_id: 'parent' });

    // Track all update calls via from()
    const updateChains: ReturnType<typeof createChain>[] = [];
    const filterChains: ReturnType<typeof createChain>[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockFrom.mockImplementation((_table: string) => {
      // Each call to from() could be update or filter
      // updateStatus calls Task.update then Task.filter then recursive Task.update calls

      // For filter calls (select without update), return children first, then empty
      if (filterChains.length === 0) {
        const filterChain = createChain({ data: [child1, child2], error: null });
        filterChains.push(filterChain);
        return filterChain;
      }
      // For recursive child filter calls, return empty (no grandchildren)
      const c = createChain({ data: [], error: null });
      updateChains.push(c);
      return c;
    });

    await planter.entities.Task.updateStatus('parent', 'completed');

    // Should have called from('tasks') multiple times (parent update + filter + child updates)
    expect(mockFrom).toHaveBeenCalled();
  });

  it('updateParentDates() calls calculateMinMaxDates then updates parent', async () => {
    const children = [
      makeTask({ id: 'c1', parent_task_id: 'parent-1', start_date: '2026-01-01', due_date: '2026-03-01' }),
    ];
    const parent = makeTask({ id: 'parent-1', parent_task_id: null });

    // First from() = filter children, second from() = update parent
    mockFrom
      .mockReturnValueOnce(createChain({ data: children, error: null }))
      .mockReturnValueOnce(createChain({ data: [parent], error: null }));

    await planter.entities.Task.updateParentDates('parent-1');

    expect(calculateMinMaxDates).toHaveBeenCalledWith(children);
    // Should have called update on parent with calculated dates
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('fetchChildren() BFS traverses from taskId', async () => {
    const root = makeTask({ id: 'root', root_id: 'proj-1' });
    const child = makeTask({ id: 'child', root_id: 'proj-1', parent_task_id: 'root' });
    const grandchild = makeTask({ id: 'grandchild', root_id: 'proj-1', parent_task_id: 'child' });

    // First call: Task.get(taskId) — returns root
    // Second call: Task.filter({root_id}) — returns all tasks
    mockFrom
      .mockReturnValueOnce(createChain({ data: root, error: null }))  // get
      .mockReturnValueOnce(createChain({ data: [root, child, grandchild], error: null })); // filter

    const result = await planter.entities.Task.fetchChildren('root');

    expect(result.data).toHaveLength(3); // root + child + grandchild
    expect(result.data?.map(t => t.id)).toContain('grandchild');
  });
});

// ---------------------------------------------------------------------------
// 4a-4: TaskWithResources
// ---------------------------------------------------------------------------
describe('TaskWithResources', () => {
  it('listTemplates() filters origin=template with pagination', async () => {
    const chain = createChain({ data: [makeTask()], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.TaskWithResources.listTemplates({ from: 0, limit: 10 });

    expect(mockFrom).toHaveBeenCalledWith('tasks_with_primary_resource');
    expect(chain.eq).toHaveBeenCalledWith('origin', 'template');
    expect(chain.is).toHaveBeenCalledWith('parent_task_id', null);
    expect(chain.range).toHaveBeenCalledWith(0, 9);
  });

  it('searchTemplates() builds .or() with ilike pattern', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.TaskWithResources.searchTemplates({ query: 'test' });

    expect(chain.or).toHaveBeenCalledWith('title.ilike.%test%,description.ilike.%test%');
  });

  it('searchTemplates() returns empty for blank query', async () => {
    const result = await planter.entities.TaskWithResources.searchTemplates({ query: '   ' });

    expect(result.data).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4a-5: Auth methods
// ---------------------------------------------------------------------------
describe('Auth', () => {
  it('me() delegates to supabase.auth.getUser()', async () => {
    const user = { id: 'user-1', email: 'test@example.com' };
    mockGetUser.mockResolvedValue({ data: { user }, error: null });

    const result = await planter.auth.me();

    expect(mockGetUser).toHaveBeenCalled();
    expect(result).toEqual(user);
  });

  it('updateProfile() calls supabase.auth.updateUser({ data })', async () => {
    const attrs = { full_name: 'Updated Name' };
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1', ...attrs } }, error: null });

    await planter.auth.updateProfile(attrs as UserMetadata);

    expect(mockUpdateUser).toHaveBeenCalledWith({ data: attrs });
  });

  it('changePassword() reauthenticates with the current password before updating', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } }, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    await planter.auth.changePassword('old-password', 'new-password-123');

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'old-password',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
  });

  it('changePassword() does not update when current password verification fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } }, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid login credentials') });

    await expect(planter.auth.changePassword('wrong-password', 'new-password-123'))
      .rejects.toThrow('Invalid login credentials');

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('requestPasswordReset() sends Supabase recovery email with redirect URL', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await planter.auth.requestPasswordReset('test@example.com', 'https://app.example.com/reset-password');

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: 'https://app.example.com/reset-password',
    });
  });

  it('completePasswordReset() updates the password for the recovery session', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    await planter.auth.completePasswordReset('new-password-123');

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
  });
});

// ---------------------------------------------------------------------------
// 4a-6: RPC wrapper + error handling
// ---------------------------------------------------------------------------
describe('RPC wrapper', () => {
  it('delegates to supabase.rpc() with function name + params', async () => {
    mockRpc.mockResolvedValue({ data: { result: true }, error: null });

    const result = await planter.rpc('my_function', { arg1: 'val1' });

    expect(mockRpc).toHaveBeenCalledWith('my_function', { arg1: 'val1' });
    expect(result.data).toEqual({ result: true });
  });

  it('wraps supabase error as PlanterError', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC failed', code: '500' },
    });

    await expect(planter.rpc('bad_fn', {})).rejects.toThrow(PlanterError);
    await expect(planter.rpc('bad_fn', {})).rejects.toThrow('RPC failed');
  });
});

// ---------------------------------------------------------------------------
// 5a: Untested methods (Category A)
// ---------------------------------------------------------------------------
describe('Untested methods (Category A)', () => {
  it('auth.signOut() delegates to supabase.auth.signOut()', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await planter.auth.signOut();

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('Person.upsert() chains .upsert(payload, opts).select("*")', async () => {
    const payload = { id: 'p1', name: 'Upserted' };
    const chain = createChain({ data: [payload], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Person.upsert(payload as PersonInsert, { onConflict: 'id' });

    expect(chain.upsert).toHaveBeenCalledWith(payload, { onConflict: 'id', ignoreDuplicates: undefined });
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(result.data).toEqual([payload]);
  });

  it('Project.filter() adds project-specific filters before user filters', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.Project.filter({ status: 'launched' } as Partial<TaskRow>);

    expect(chain.is).toHaveBeenCalledWith('parent_task_id', null);
    expect(chain.eq).toHaveBeenCalledWith('origin', 'instance');
    expect(chain.eq).toHaveBeenCalledWith('status', 'launched');
  });

  it('TaskResource.setPrimary() calls Task.update with primary_resource_id', async () => {
    const chain = createChain({ data: [makeTask()], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.TaskResource.setPrimary('task-1', 'res-1');

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ primary_resource_id: 'res-1' }));
  });

  it('Project.inviteMemberByEmail() invokes invite-by-email edge function', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        message: 'Invite processed successfully',
        user: { id: 'member-1', email: 'test@example.com' },
      },
      error: null,
    });

    const result = await planter.entities.Project.inviteMemberByEmail('proj-1', 'test@example.com', 'viewer');

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('invite-by-email', {
      body: {
        projectId: 'proj-1',
        email: 'test@example.com',
        role: 'viewer',
      },
    });
    expect(result.user.id).toBe('member-1');
  });

  it('Project.inviteMemberByEmail() surfaces sanitized edge error bodies', async () => {
    const response = new Response(JSON.stringify({ error: 'Forbidden: only project owners can invite users.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: response }),
    });

    await expect(
      planter.entities.Project.inviteMemberByEmail('proj-1', 'test@example.com', 'viewer'),
    ).rejects.toMatchObject({
      message: 'Forbidden: only project owners can invite users.',
    });
  });

  it('listTemplates() applies resourceType and userId filters', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.TaskWithResources.listTemplates({
      from: 0, limit: 10, resourceType: 'video', userId: 'user-1',
    });

    expect(chain.eq).toHaveBeenCalledWith('creator', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('resource_type', 'video');
  });

  it('searchTemplates() truncates query > 100 chars', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const longQuery = 'a'.repeat(150);
    await planter.entities.TaskWithResources.searchTemplates({ query: longQuery });

    // Pattern should use truncated (100 char) version
    const truncated = 'a'.repeat(100);
    expect(chain.or).toHaveBeenCalledWith(`title.ilike.%${truncated}%,description.ilike.%${truncated}%`);
  });

  it('searchTemplates() applies resourceType filter when not "all"', async () => {
    const chain = createChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await planter.entities.TaskWithResources.searchTemplates({ query: 'test', resourceType: 'document' });

    expect(chain.eq).toHaveBeenCalledWith('resource_type', 'document');
  });
});

// ---------------------------------------------------------------------------
// 5b: Error paths (Category B)
// ---------------------------------------------------------------------------
describe('Error paths (Category B)', () => {
  it('base CRUD list() throws PlanterError on Supabase error', async () => {
    const chain = createChain({ data: null, error: { message: 'DB error', code: '500' } });
    mockFrom.mockReturnValue(chain);

    await expect(planter.entities.Person.list()).rejects.toThrow(PlanterError);
    await expect(planter.entities.Person.list()).rejects.toThrow('DB error');
  });

  it('Project.create() skips getUser() when creator is provided', async () => {
    const project = { id: 'proj-2', title: 'With Creator' };
    const chain = createChain({ data: [project], error: null });
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await planter.entities.Project.create({ title: 'With Creator', creator: 'explicit-user' });

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ creator: 'explicit-user' }));
  });

  it('Project.listJoined() returns [] on any error (blanket catch)', async () => {
    // Make the chain throw when awaited
    const chain = createChain({ data: null, error: { message: 'join failed', code: '500' } });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Project.listJoined('user-1');

    expect(result).toEqual([]);
  });

  it('Task.fetchChildren() returns { data: null, error } on failure', async () => {
    // First call: Task.get fails
    const chain = createChain({ data: null, error: { message: 'not found', code: '404' } });
    mockFrom.mockReturnValue(chain);

    const result = await planter.entities.Task.fetchChildren('missing-task');

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('Task.updateStatus() does NOT recurse for non-completed status', async () => {
    const task = makeTask({ id: 't1' });
    const updateChain = createChain({ data: [task], error: null });
    mockFrom.mockReturnValue(updateChain);

    await planter.entities.Task.updateStatus('t1', 'in_progress');

    // Should only call from('tasks') once for the update, NOT for filter (no recursion)
    // The first call is the update; if it recursed, there'd be a filter call too
    const fromCalls = mockFrom.mock.calls;
    // All calls should be 'tasks' for the single update
    expect(fromCalls.length).toBe(1);
  });

  it('Task.updateParentDates() returns immediately for null parentId', async () => {
    await planter.entities.Task.updateParentDates(null);

    expect(mockFrom).not.toHaveBeenCalled();
  });
});
