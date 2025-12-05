import { fetchMasterLibraryTasks, searchMasterLibraryTasks, fetchTaskById, fetchTaskChildren, deepCloneTask } from './taskService';

jest.mock('../supabaseClient', () => ({
  supabase: {},
}));

const createMockClient = (response) => {
  const builder = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    abortSignal: jest.fn().mockReturnThis(),
    then(resolve, reject) {
      return Promise.resolve(response).then(resolve, reject);
    },
    catch() {
      return this;
    },
  };

  const from = jest.fn().mockReturnValue(builder);

  return { client: { from }, builder };
};

describe('searchMasterLibraryTasks', () => {
  it('returns tasks when query matches description only', async () => {
    const sampleTasks = [
      {
        id: '1',
        title: 'Launch Plan',
        description: 'Complete soil preparation checklist',
        origin: 'library',
      },
    ];

    const { client, builder } = createMockClient({ data: sampleTasks, error: null });

    const results = await searchMasterLibraryTasks({ query: 'soil' }, client);

    expect(client.from).toHaveBeenCalledWith('tasks');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('origin', 'template');
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining('title.ilike'));
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining('description.ilike'));
    expect(results).toEqual(sampleTasks);
  });

  it('returns empty array when query is blank', async () => {
    const { client } = createMockClient({ data: [], error: null });
    const results = await searchMasterLibraryTasks({ query: ' ' }, client);
    expect(results).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('escapes wildcard characters in query', async () => {
    const { client, builder } = createMockClient({ data: [], error: null });

    await searchMasterLibraryTasks({ query: '%_plan' }, client);

    const orArgument = builder.or.mock.calls[0][0];
    expect(orArgument).toContain('title.ilike.%\\%\\_plan%');
    expect(orArgument).toContain('description.ilike.%\\%\\_plan%');
  });
});

describe('fetchMasterLibraryTasks', () => {
  it('paginates and validates results', async () => {
    const sampleTasks = [{ id: '1', title: 'Task', origin: 'library', position: 1 }];

    const { client, builder } = createMockClient({ data: sampleTasks, error: null });

    const results = await fetchMasterLibraryTasks({ from: 10, limit: 5 }, client);

    expect(client.from).toHaveBeenCalledWith('tasks');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('origin', 'template');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(10, 14);
    expect(results).toEqual(sampleTasks);
  });

  it('returns empty array when payload shape invalid', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    const { client } = createMockClient({ data: [{ bad: 'record' }], error: null });

    const results = await fetchMasterLibraryTasks({}, client);

    expect(results).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('fetchTaskById', () => {
  it('returns task when ID exists', async () => {
    const sampleTask = { id: '123', title: 'My Task', origin: 'template' };
    const { client, builder } = createMockClient({ data: sampleTask, error: null });

    const result = await fetchTaskById('123', client);

    expect(client.from).toHaveBeenCalledWith('tasks');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('origin', 'template');
    expect(builder.eq).toHaveBeenCalledWith('id', '123');
    expect(builder.single).toHaveBeenCalled();
    expect(result).toEqual(sampleTask);
  });

  it('returns null when ID does not exist (PGRST116)', async () => {
    const { client } = createMockClient({ data: null, error: { code: 'PGRST116' } });

    const result = await fetchTaskById('999', client);

    expect(result).toBeNull();
  });

  it('returns null when ID is missing', async () => {
    const { client } = createMockClient({});
    const result = await fetchTaskById(null, client);
    expect(result).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws error on network failure', async () => {
    const mockError = new Error('Network error');
    const { client } = createMockClient({ data: null, error: mockError });

    await expect(fetchTaskById('123', client)).rejects.toThrow('Network error');
  });

  it('returns null and warns when task shape is invalid', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    const invalidTask = { id: '123', title: '' }; // Missing origin, empty title
    const { client } = createMockClient({ data: invalidTask, error: null });

    const result = await fetchTaskById('123', client);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('fetchTaskChildren', () => {
  it('returns children when parentId exists', async () => {
    const sampleChildren = [{ id: 'child-1', title: 'Child', parent_id: 'parent-1' }];
    const { client, builder } = createMockClient({ data: sampleChildren, error: null });

    const results = await fetchTaskChildren('parent-1', client);

    expect(client.from).toHaveBeenCalledWith('tasks');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('origin', 'template');
    expect(builder.eq).toHaveBeenCalledWith('parent_id', 'parent-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(results).toEqual(sampleChildren);
  });

  it('returns empty array when parentId is missing', async () => {
    const { client } = createMockClient({});
    const results = await fetchTaskChildren(null, client);
    expect(results).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('deepCloneTask', () => {
  const originalCrypto = global.crypto;
  const originalWindowCrypto = typeof window !== 'undefined' ? window.crypto : undefined;

  beforeAll(() => {
    const mockCrypto = { randomUUID: () => 'new-uuid' };

    Object.defineProperty(global, 'crypto', {
      value: mockCrypto,
      writable: true,
    });

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'crypto', {
        value: mockCrypto,
        writable: true,
      });
    }
  });

  afterAll(() => {
    if (originalCrypto) {
      Object.defineProperty(global, 'crypto', {
        value: originalCrypto,
        writable: true,
      });
    } else {
      delete global.crypto;
    }

    if (typeof window !== 'undefined') {
      if (originalWindowCrypto) {
        Object.defineProperty(window, 'crypto', {
          value: originalWindowCrypto,
          writable: true,
        });
      } else {
        delete window.crypto;
      }
    }
  });

  it('clones a task tree and returns flat array', async () => {
    const rootTask = { id: 'root-1', title: 'Root', origin: 'template' };
    const childTask = { id: 'child-1', title: 'Child', parent_id: 'root-1', origin: 'template' };

    // Mock client to handle multiple calls
    const client = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(), // Will be mocked per call if possible, or we use a smarter mock
      order: jest.fn().mockReturnThis(),
      then: jest.fn(), // For await
    };

    // We need a more sophisticated mock for sequential calls
    // Call 1: fetchTaskById('root-1') -> returns rootTask
    // Call 2: fetchTaskChildren('root-1') -> returns [childTask]
    // Call 3: fetchTaskChildren('child-1') -> returns []

    // Since createMockClient is simple, let's just mock the implementation of the service functions?
    // No, we want to test the service functions.
    // We can mock the client.from()... chain.

    // Let's use a mock that returns different promises based on the query?
    // Or just mock the `then` to return data based on previous calls?
    // That's tricky with the builder pattern.

    // Alternative: Mock `fetchTaskById` and `fetchTaskChildren`?
    // But they are in the same module.

    // Let's try to mock the client responses in order.
    // The issue is `client.from` returns a builder, and we await the builder.

    // Let's rely on the fact that `fetchTaskById` calls `single()` and `fetchTaskChildren` calls `order()`.
    // We can distinguish them.

    const builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn(),
    };

    client.from.mockReturnValue(builder);

    // Setup responses
    // 1. fetchTaskById: .single() called.
    builder.single.mockResolvedValue({ data: rootTask, error: null });

    // 2. fetchTaskChildren: .order() called.
    // We need to return different data for different parent_ids.
    // But `builder` is the same object.
    // We can inspect the arguments to `eq` to decide what to return in `then`?
    // But `then` is called at the end.

    // Let's make `then` smart.
    builder.then.mockImplementation((resolve, reject) => {
      // Check what was called on builder
      const eqCalls = builder.eq.mock.calls;
      // Last call to eq might be 'parent_id' or 'id'.

      // If single() was called, it's fetchTaskById
      if (builder.single.mock.calls.length > 0) {
        // Reset single call count for next usage? No, builder is reused? 
        // Actually `client.from` is called each time, returning the SAME builder object in my mock.
        // I should return a NEW builder each time to track state separately.
        return Promise.resolve({ data: rootTask, error: null }).then(resolve, reject);
      }

      // If not single, it's fetchTaskChildren (or fetchMasterLibraryTasks)
      // Check parent_id
      const parentIdArg = eqCalls.find(call => call[0] === 'parent_id')?.[1];
      if (parentIdArg === 'root-1') {
        return Promise.resolve({ data: [childTask], error: null }).then(resolve, reject);
      }
      if (parentIdArg === 'child-1') {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      }

      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    });

    // Wait, reusing the builder is dangerous if we rely on call history.
    // Better: `client.from` returns a new builder instance each time.

    const createBuilder = () => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve({ data: [], error: null })), // Default
    });

    client.from.mockImplementation(() => {
      const b = createBuilder();
      // We need to inject logic into `then` based on what methods were called on `b`.
      b.then = jest.fn((resolve, reject) => {
        const eqCalls = b.eq.mock.calls;
        const isSingle = b.single.mock.calls.length > 0;

        if (isSingle) {
          // fetchTaskById
          const idArg = eqCalls.find(call => call[0] === 'id')?.[1];
          if (idArg === 'root-1') return Promise.resolve({ data: rootTask, error: null }).then(resolve, reject);
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } }).then(resolve, reject);
        } else {
          // fetchTaskChildren
          const parentIdArg = eqCalls.find(call => call[0] === 'parent_id')?.[1];
          if (parentIdArg === 'root-1') return Promise.resolve({ data: [childTask], error: null }).then(resolve, reject);
          if (parentIdArg === 'child-1') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
      });
      return b;
    });

    const result = await deepCloneTask('root-1', client);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Root');
    expect(result[0].id).toBe('new-uuid');
    expect(result[1].title).toBe('Child');
    expect(result[1].id).toBe('new-uuid'); // Mock returns same UUID, which is fine for this test, but maybe we want unique?
    // If we want unique, we can mock randomUUID to return sequential.
  });
});
