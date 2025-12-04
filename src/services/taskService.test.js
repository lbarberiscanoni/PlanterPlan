import { fetchMasterLibraryTasks, searchMasterLibraryTasks, fetchTaskById } from './taskService';

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

    expect(client.from).toHaveBeenCalledWith('view_master_library');
    expect(builder.select).toHaveBeenCalledWith('*');
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

    expect(client.from).toHaveBeenCalledWith('view_master_library');
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
    const sampleTask = { id: '123', title: 'My Task', origin: 'library' };
    const { client, builder } = createMockClient({ data: sampleTask, error: null });

    const result = await fetchTaskById('123', client);

    expect(client.from).toHaveBeenCalledWith('view_master_library');
    expect(builder.select).toHaveBeenCalledWith('*');
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
