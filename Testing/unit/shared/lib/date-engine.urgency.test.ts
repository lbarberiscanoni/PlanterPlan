import { describe, it, expect } from 'vitest';
import { deriveUrgency } from '@/shared/lib/date-engine/index';

const NOW = new Date('2026-04-16T12:00:00.000Z'); // UTC noon on 2026-04-16

describe('deriveUrgency', () => {
  it('returns null when task has no due_date', () => {
    const result = deriveUrgency({ start_date: '2026-04-10', due_date: null }, 3, NOW);
    expect(result).toBeNull();
  });

  it('returns null when task is_complete (short-circuit)', () => {
    const result = deriveUrgency(
      { start_date: '2026-04-10', due_date: '2026-04-10', is_complete: true },
      3,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("returns null when task status === 'completed' (short-circuit)", () => {
    const result = deriveUrgency(
      { start_date: '2026-04-10', due_date: '2026-04-10', status: 'completed' },
      3,
      NOW,
    );
    expect(result).toBeNull();
  });

  it("returns 'overdue' when due_date is strictly before today", () => {
    const result = deriveUrgency({ due_date: '2026-04-15' }, 3, NOW);
    expect(result).toBe('overdue');
  });

  it("returns 'due_soon' when due_date is today", () => {
    const result = deriveUrgency({ due_date: '2026-04-16' }, 3, NOW);
    expect(result).toBe('due_soon');
  });

  it("returns 'due_soon' when due_date is within threshold", () => {
    const result = deriveUrgency({ due_date: '2026-04-18' }, 3, NOW);
    expect(result).toBe('due_soon');
  });

  it("returns 'due_soon' when due_date is exactly at the threshold boundary (inclusive)", () => {
    const result = deriveUrgency({ due_date: '2026-04-21' }, 3, NOW);
    expect(result).toBe('due_soon');
  });

  it('counts due-soon thresholds in date-project business days', () => {
    expect(deriveUrgency({ due_date: '2026-04-20' }, 2, NOW)).toBe('due_soon');
    expect(deriveUrgency({ due_date: '2026-04-21' }, 2, NOW)).toBe('current');
  });

  it('skips observed US federal holidays in due-soon thresholds', () => {
    const julyNow = new Date('2026-07-02T12:00:00.000Z');

    expect(deriveUrgency({ due_date: '2026-07-06' }, 1, julyNow)).toBe('due_soon');
    expect(deriveUrgency({ due_date: '2026-07-07' }, 1, julyNow)).toBe('current');
  });

  it('keeps threshold arithmetic UTC-stable across DST boundaries', () => {
    const dstNow = new Date('2026-03-08T12:00:00.000Z');

    expect(deriveUrgency({ due_date: '2026-03-09' }, 1, dstNow)).toBe('due_soon');
  });

  it("returns 'not_yet_due' when start_date is strictly after today and due_date is beyond threshold", () => {
    const result = deriveUrgency(
      { start_date: '2026-05-01', due_date: '2026-05-10' },
      3,
      NOW,
    );
    expect(result).toBe('not_yet_due');
  });

  it("returns 'current' when start_date is in the past and due_date is beyond threshold", () => {
    const result = deriveUrgency(
      { start_date: '2026-04-01', due_date: '2026-05-10' },
      3,
      NOW,
    );
    expect(result).toBe('current');
  });

  it("returns 'current' when start_date is today and due_date is beyond threshold", () => {
    const result = deriveUrgency(
      { start_date: '2026-04-16', due_date: '2026-05-10' },
      3,
      NOW,
    );
    expect(result).toBe('current');
  });

  it("returns 'current' when start_date is missing and due_date is beyond threshold", () => {
    const result = deriveUrgency({ due_date: '2026-05-10' }, 3, NOW);
    expect(result).toBe('current');
  });

  it("treats invalid due_date as null", () => {
    const result = deriveUrgency({ due_date: 'not-a-date' }, 3, NOW);
    expect(result).toBeNull();
  });

  it('honors threshold=0 (only today counts as due_soon)', () => {
    expect(deriveUrgency({ due_date: '2026-04-16' }, 0, NOW)).toBe('due_soon');
    expect(deriveUrgency({ due_date: '2026-04-17' }, 0, NOW)).toBe('current');
  });

  it('clamps negative threshold to 0', () => {
    expect(deriveUrgency({ due_date: '2026-04-16' }, -5, NOW)).toBe('due_soon');
    expect(deriveUrgency({ due_date: '2026-04-17' }, -5, NOW)).toBe('current');
  });
});
