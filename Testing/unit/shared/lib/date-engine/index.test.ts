import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatDate,
  isPastDate,
  isTodayDate,
  addDaysToDate,
  isDateValid,
  endOfDayDate,
  isBeforeDate,
  compareDateAsc,
  compareDateDesc,
  findTaskById,
  calculateScheduleFromOffset,
  toIsoDate,
  formatDisplayDate,
  calculateMinMaxDates,
  recalculateProjectDates,
  nowUtcIso,
  type DateEngineTask,
} from '@/shared/lib/date-engine/index';

// ---------------------------------------------------------------------------
// nowUtcIso
// ---------------------------------------------------------------------------
describe('nowUtcIso', () => {
  it('returns an ISO string', () => {
    const result = nowUtcIso();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a valid ISO string', () => {
    expect(formatDate('2026-03-15', 'yyyy-MM-dd')).toBe('2026-03-15');
  });

  it('formats a Date object', () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    expect(formatDate(d, 'yyyy')).toBe('2026');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null, 'yyyy-MM-dd')).toBe('');
  });

  it('returns empty string for invalid string', () => {
    expect(formatDate('not-a-date', 'yyyy-MM-dd')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// isPastDate
// ---------------------------------------------------------------------------
describe('isPastDate', () => {
  it('returns true for a date in the past', () => {
    expect(isPastDate('2000-01-01')).toBe(true);
  });

  it('returns false for a date in the future', () => {
    expect(isPastDate('2099-12-31')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPastDate(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTodayDate
// ---------------------------------------------------------------------------
describe('isTodayDate', () => {
  it('returns true for today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(isTodayDate(today)).toBe(true);
  });

  it('returns false for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(isTodayDate(d.toISOString().split('T')[0])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTodayDate(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addDaysToDate
// ---------------------------------------------------------------------------
describe('addDaysToDate', () => {
  it('adds positive days', () => {
    const result = addDaysToDate('2026-01-01', 5);
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toContain('2026-01-06');
  });

  it('subtracts with negative days', () => {
    const result = addDaysToDate('2026-01-10', -3);
    expect(result!.toISOString()).toContain('2026-01-07');
  });

  it('returns null for null input', () => {
    expect(addDaysToDate(null, 5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isDateValid
// ---------------------------------------------------------------------------
describe('isDateValid', () => {
  it('returns true for valid ISO string', () => {
    expect(isDateValid('2026-06-15')).toBe(true);
  });

  it('returns false for invalid string', () => {
    expect(isDateValid('nope')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDateValid(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// endOfDayDate
// ---------------------------------------------------------------------------
describe('endOfDayDate', () => {
  it('sets time to end of day', () => {
    const result = endOfDayDate('2026-03-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getHours()).toBe(23);
    expect(result!.getMinutes()).toBe(59);
  });

  it('returns null for null input', () => {
    expect(endOfDayDate(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBeforeDate
// ---------------------------------------------------------------------------
describe('isBeforeDate', () => {
  it('returns true when left is before right', () => {
    expect(isBeforeDate('2026-01-01', '2026-06-01')).toBe(true);
  });

  it('returns false when left is after right', () => {
    expect(isBeforeDate('2026-06-01', '2026-01-01')).toBe(false);
  });

  it('returns false when either is null', () => {
    expect(isBeforeDate(null, '2026-01-01')).toBe(false);
    expect(isBeforeDate('2026-01-01', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compareDateAsc
// ---------------------------------------------------------------------------
describe('compareDateAsc', () => {
  it('returns negative when left < right', () => {
    expect(compareDateAsc('2026-01-01', '2026-06-01')).toBeLessThan(0);
  });

  it('returns positive when left > right', () => {
    expect(compareDateAsc('2026-06-01', '2026-01-01')).toBeGreaterThan(0);
  });

  it('returns 0 when equal', () => {
    expect(compareDateAsc('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('sorts nulls last', () => {
    expect(compareDateAsc(null, '2026-01-01')).toBe(1);
    expect(compareDateAsc('2026-01-01', null)).toBe(-1);
    expect(compareDateAsc(null, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// compareDateDesc
// ---------------------------------------------------------------------------
describe('compareDateDesc', () => {
  it('returns positive when left < right (reversed)', () => {
    expect(compareDateDesc('2026-01-01', '2026-06-01')).toBeGreaterThan(0);
  });

  it('returns negative when left > right (reversed)', () => {
    expect(compareDateDesc('2026-06-01', '2026-01-01')).toBeLessThan(0);
  });

  it('returns 0 when equal', () => {
    expect(compareDateDesc('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('sorts nulls last', () => {
    expect(compareDateDesc(null, '2026-01-01')).toBe(1);
    expect(compareDateDesc('2026-01-01', null)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// findTaskById
// ---------------------------------------------------------------------------
describe('findTaskById', () => {
  const tasks: DateEngineTask[] = [
    { id: 'a', start_date: null, due_date: null },
    { id: 'b', start_date: null, due_date: null },
  ];

  it('finds an existing task', () => {
    expect(findTaskById(tasks, 'a')).toEqual(tasks[0]);
  });

  it('returns null for nonexistent id', () => {
    expect(findTaskById(tasks, 'z')).toBeNull();
  });

  it('returns null for null id', () => {
    expect(findTaskById(tasks, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toIsoDate
// ---------------------------------------------------------------------------
describe('toIsoDate', () => {
  it('passes through YYYY-MM-DD strings', () => {
    expect(toIsoDate('2026-03-15')).toBe('2026-03-15');
  });

  it('extracts date from ISO timestamp', () => {
    expect(toIsoDate('2026-03-15T14:30:00.000Z')).toBe('2026-03-15');
  });

  it('converts a Date object', () => {
    const d = new Date(Date.UTC(2026, 2, 15));
    expect(toIsoDate(d)).toBe('2026-03-15');
  });

  it('returns null for invalid string', () => {
    expect(toIsoDate('garbage')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDisplayDate
// ---------------------------------------------------------------------------
describe('formatDisplayDate', () => {
  it('formats YYYY-MM-DD as UTC display string', () => {
    const result = formatDisplayDate('2026-03-15');
    expect(result).toContain('2026');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('formats ISO timestamp', () => {
    const result = formatDisplayDate('2026-03-15T14:30:00.000Z');
    expect(result).toContain('2026');
  });

  it('returns "Not set" for null', () => {
    expect(formatDisplayDate(null)).toBe('Not set');
    expect(formatDisplayDate(undefined)).toBe('Not set');
  });

  it('returns "Invalid Date" for garbage', () => {
    expect(formatDisplayDate('not-a-date')).toBe('Invalid Date');
  });
});

// ---------------------------------------------------------------------------
// calculateScheduleFromOffset
// ---------------------------------------------------------------------------
describe('calculateScheduleFromOffset', () => {
  const projectRoot: DateEngineTask = {
    id: 'proj',
    parent_task_id: null,
    start_date: '2026-01-01',
    due_date: null,
  };
  const phase: DateEngineTask = {
    id: 'phase',
    parent_task_id: 'proj',
    start_date: '2026-01-01',
    due_date: null,
  };
  const tasks = [projectRoot, phase];

  it('calculates dates from offset using root start date', () => {
    const result = calculateScheduleFromOffset(tasks, 'phase', 10);
    expect(result.start_date).toBe('2026-01-15');
    expect(result.due_date).toBe('2026-01-15');
  });

  it('returns empty for null parentId', () => {
    expect(calculateScheduleFromOffset(tasks, null, 5)).toEqual({});
  });

  it('returns empty for null daysOffset', () => {
    expect(calculateScheduleFromOffset(tasks, 'phase', null)).toEqual({});
  });

  it('returns empty when parent not found', () => {
    expect(calculateScheduleFromOffset(tasks, 'missing', 5)).toEqual({});
  });

  it('traverses ancestors to find root start date', () => {
    const milestone: DateEngineTask = {
      id: 'ms',
      parent_task_id: 'phase',
      start_date: null,
      due_date: null,
    };
    const result = calculateScheduleFromOffset(
      [...tasks, milestone],
      'ms',
      30,
    );
    expect(result.start_date).toBe('2026-02-13');
  });

  it('returns project start date when offset is 0', () => {
    const result = calculateScheduleFromOffset(tasks, 'phase', 0);
    expect(result.start_date).toBe('2026-01-01');
    expect(result.due_date).toBe('2026-01-01');
  });

  it('skips weekends when date-kind offsets cross weekends', () => {
    const weekendTasks: DateEngineTask[] = [
      { ...projectRoot, start_date: '2026-01-02' },
      { ...phase, start_date: '2026-01-02' },
    ];

    const result = calculateScheduleFromOffset(weekendTasks, 'phase', 1);

    expect(result.start_date).toBe('2026-01-05');
    expect(result.due_date).toBe('2026-01-05');
  });

  it('skips observed US federal holidays for date-kind offsets', () => {
    const holidayTasks: DateEngineTask[] = [
      { ...projectRoot, start_date: '2026-07-02' },
      { ...phase, start_date: '2026-07-02' },
    ];

    const result = calculateScheduleFromOffset(holidayTasks, 'phase', 1);

    expect(result.start_date).toBe('2026-07-06');
    expect(result.due_date).toBe('2026-07-06');
  });

  it('normalizes full ISO root dates through UTC date-only scheduling', () => {
    const isoTasks: DateEngineTask[] = [
      { ...projectRoot, start_date: '2026-03-08T23:30:00-08:00' },
      { ...phase, start_date: '2026-03-08T23:30:00-08:00' },
    ];

    const result = calculateScheduleFromOffset(isoTasks, 'phase', 0);

    expect(result.start_date).toBe('2026-03-09');
  });
});

// ---------------------------------------------------------------------------
// calculateMinMaxDates
// ---------------------------------------------------------------------------
describe('calculateMinMaxDates', () => {
  it('calculates min start and max due from children', () => {
    const children: DateEngineTask[] = [
      { id: '1', start_date: '2026-03-10', due_date: '2026-03-20' },
      { id: '2', start_date: '2026-03-05', due_date: '2026-03-25' },
      { id: '3', start_date: '2026-03-15', due_date: '2026-03-18' },
    ];
    const result = calculateMinMaxDates(children);
    expect(result.start_date).toBe('2026-03-05');
    expect(result.due_date).toBe('2026-03-25');
  });

  it('returns nulls for empty array', () => {
    expect(calculateMinMaxDates([])).toEqual({ start_date: null, due_date: null });
  });

  it('returns nulls for null input', () => {
    expect(calculateMinMaxDates(null)).toEqual({ start_date: null, due_date: null });
  });

  it('handles children with missing dates', () => {
    const children: DateEngineTask[] = [
      { id: '1', start_date: '2026-03-10', due_date: null },
      { id: '2', start_date: null, due_date: '2026-03-25' },
    ];
    const result = calculateMinMaxDates(children);
    expect(result.start_date).toBe('2026-03-10');
    expect(result.due_date).toBe('2026-03-25');
  });
});

// ---------------------------------------------------------------------------
// recalculateProjectDates
// ---------------------------------------------------------------------------
describe('recalculateProjectDates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const tasks: DateEngineTask[] = [
    { id: 'root', parent_task_id: null, start_date: '2026-01-01', due_date: '2026-01-01', is_complete: false },
    { id: 't1', parent_task_id: 'root', start_date: '2026-01-10', due_date: '2026-01-20', is_complete: false },
    { id: 't2', parent_task_id: 'root', start_date: '2026-02-01', due_date: '2026-02-15', is_complete: false },
  ];

  it('shifts dates forward', () => {
    const updates = recalculateProjectDates(tasks, '2026-01-06', '2026-01-01');
    expect(updates).toHaveLength(2);
    expect(updates[0].id).toBe('t1');
    // Shifted 3 business days forward: Jan 1 is New Year's Day and Jan 3/4 are a weekend.
    expect(updates[0].start_date).toBe('2026-01-14');
    expect(updates[0].due_date).toBe('2026-01-23');
  });

  it('shifts dates backward', () => {
    const updates = recalculateProjectDates(tasks, '2025-12-29', '2026-01-01');
    expect(updates).toHaveLength(2);
    // Shifted 3 days backward
    expect(updates[0].start_date).toBe('2026-01-07');
  });

  it('skips weekends for date-kind project shifts', () => {
    const weekendTasks: DateEngineTask[] = [
      { id: 'root', parent_task_id: null, start_date: '2026-01-02', due_date: '2026-01-02', is_complete: false },
      { id: 't1', parent_task_id: 'root', start_date: '2026-01-02', due_date: '2026-01-02', is_complete: false },
    ];

    const updates = recalculateProjectDates(weekendTasks, '2026-01-05', '2026-01-02');

    expect(updates[0].start_date).toBe('2026-01-05');
    expect(updates[0].due_date).toBe('2026-01-05');
  });

  it('skips observed holidays for date-kind project shifts', () => {
    const holidayTasks: DateEngineTask[] = [
      { id: 'root', parent_task_id: null, start_date: '2026-07-02', due_date: '2026-07-02', is_complete: false },
      { id: 't1', parent_task_id: 'root', start_date: '2026-07-02', due_date: '2026-07-02', is_complete: false },
    ];

    const updates = recalculateProjectDates(holidayTasks, '2026-07-06', '2026-07-02');

    expect(updates[0].start_date).toBe('2026-07-06');
    expect(updates[0].due_date).toBe('2026-07-06');
  });

  it('keeps UTC date-only shifts stable across DST boundaries', () => {
    const dstTasks: DateEngineTask[] = [
      { id: 'root', parent_task_id: null, start_date: '2026-03-06', due_date: '2026-03-06', is_complete: false },
      { id: 't1', parent_task_id: 'root', start_date: '2026-03-08', due_date: '2026-03-08', is_complete: false },
    ];

    const updates = recalculateProjectDates(dstTasks, '2026-03-09', '2026-03-06');

    expect(updates[0].start_date).toBe('2026-03-09');
    expect(updates[0].due_date).toBe('2026-03-09');
  });

  it('does not include the project root in batch shifts when the new start is skipped', () => {
    const rootAndChild: DateEngineTask[] = [
      { id: 'root', parent_task_id: null, start_date: '2026-01-01', due_date: '2026-01-01', is_complete: false },
      { id: 'child', parent_task_id: 'root', start_date: '2026-01-10', due_date: '2026-01-10', is_complete: false },
    ];

    const updates = recalculateProjectDates(rootAndChild, '2026-01-03', '2026-01-01');

    expect(updates.map((u) => u.id)).toEqual(['child']);
    expect(updates[0].start_date).toBe('2026-01-12');
    expect(updates[0].due_date).toBe('2026-01-12');
  });

  it('skips completed tasks', () => {
    const withCompleted: DateEngineTask[] = [
      { id: 't1', start_date: '2026-01-10', due_date: '2026-01-20', is_complete: true },
      { id: 't2', start_date: '2026-02-01', due_date: '2026-02-15', is_complete: false },
    ];
    const updates = recalculateProjectDates(withCompleted, '2026-01-06', '2026-01-01');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('t2');
  });

  it('skips tasks with no start_date', () => {
    const noDate: DateEngineTask[] = [
      { id: 't1', start_date: null, due_date: null, is_complete: false },
    ];
    expect(recalculateProjectDates(noDate, '2026-01-06', '2026-01-01')).toEqual([]);
  });

  it('returns empty when diff is zero', () => {
    expect(recalculateProjectDates(tasks, '2026-01-01', '2026-01-01')).toEqual([]);
  });

  it('returns empty for null inputs', () => {
    expect(recalculateProjectDates(null, '2026-01-01', '2025-12-01')).toEqual([]);
    expect(recalculateProjectDates(tasks, null, '2025-12-01')).toEqual([]);
    expect(recalculateProjectDates(tasks, '2026-01-01', null)).toEqual([]);
  });
});
