import { supabase } from '../supabaseClient';

const MASTER_LIBRARY_VIEW = 'view_master_library';
const DEFAULT_PAGE_SIZE = 25;
const REQUIRED_FIELDS = ['id', 'title', 'origin'];
const DEFAULT_SEARCH_LIMIT = 20;

const coercePositiveInt = (value, fallback) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const coerced = Math.max(0, Math.floor(value));
  return coerced;
};

const validateTaskShape = (task) => {
  if (typeof task !== 'object' || task === null) {
    return false;
  }

  return REQUIRED_FIELDS.every((field) => {
    if (field === 'id') {
      return typeof task[field] === 'string' || typeof task[field] === 'number';
    }
    return typeof task[field] === 'string' && task[field].trim().length > 0;
  });
};

export const fetchMasterLibraryTasks = async (
  { from = 0, limit = DEFAULT_PAGE_SIZE, signal } = {},
  client = supabase
) => {
  const start = coercePositiveInt(from, 0);
  const size = Math.max(1, coercePositiveInt(limit, DEFAULT_PAGE_SIZE));
  const end = Math.max(start, start + size - 1);

  let query = client
    .from(MASTER_LIBRARY_VIEW)
    .select('*')
    .order('created_at', { ascending: false })
    .range(start, end);

  if (signal) {
    query = query.abortSignal(signal);
  }

  try {
    const { data, error } = await query;

    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    if (error) {
      throw error;
    }

    if (!Array.isArray(data)) {
      console.warn('[taskService.fetchMasterLibraryTasks] Unexpected payload shape:', data);
      return [];
    }

    const validTasks = data.filter((task) => {
      const isValid = validateTaskShape(task);
      if (!isValid) {
        console.warn('[taskService.fetchMasterLibraryTasks] Dropping malformed task record:', task);
      }
      return isValid;
    });

    return validTasks;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }

    console.error(
      '[taskService.fetchMasterLibraryTasks] Fatal error fetching master library tasks:',
      error
    );
    throw error;
  }
};

const escapeIlike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export const searchMasterLibraryTasks = async (
  { query, limit = DEFAULT_SEARCH_LIMIT, signal } = {},
  client = supabase
) => {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';

  if (!normalizedQuery) {
    return [];
  }

  const size = Math.max(1, Math.min(50, coercePositiveInt(limit, DEFAULT_SEARCH_LIMIT)));
  const escapedTerm = escapeIlike(normalizedQuery);
  const likePattern = `%${escapedTerm}%`;

  let queryBuilder = client
    .from(MASTER_LIBRARY_VIEW)
    .select('*')
    .or(`title.ilike.${likePattern},description.ilike.${likePattern}`)
    .order('updated_at', { ascending: false })
    .limit(size);

  if (signal) {
    queryBuilder = queryBuilder.abortSignal(signal);
  }

  try {
    const { data, error } = await queryBuilder;

    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    if (error) {
      throw error;
    }

    if (!Array.isArray(data)) {
      console.warn('[taskService.searchMasterLibraryTasks] Unexpected payload shape:', data);
      return [];
    }

    return data.filter((task) => {
      const isValid = validateTaskShape(task);
      if (!isValid) {
        console.warn(
          '[taskService.searchMasterLibraryTasks] Dropping malformed task record:',
          task
        );
      }
      return isValid;
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }

    console.error('[taskService.searchMasterLibraryTasks] Fatal error performing search:', error);
    throw error;
  }
};

export const fetchTaskById = async (id, client = supabase) => {
  if (!id) {
    return null;
  }

  try {
    const { data, error } = await client
      .from(MASTER_LIBRARY_VIEW)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // Supabase returns code 'PGRST116' for no rows found with .single()
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    if (!validateTaskShape(data)) {
      console.warn('[taskService.fetchTaskById] Dropping malformed task record:', data);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[taskService.fetchTaskById] Error fetching task:', error);
    throw error;
  }
};
