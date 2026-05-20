import { describe, it, expect } from 'vitest';
import {
    isCheckpointProject,
    deriveUrgencyForProject,
} from '@/shared/lib/date-engine';

describe('isCheckpointProject (Wave 29)', () => {
    it('returns false for null / undefined', () => {
        expect(isCheckpointProject(null)).toBe(false);
        expect(isCheckpointProject(undefined)).toBe(false);
    });

    it('returns false for a non-root task even when kind is checkpoint', () => {
        expect(isCheckpointProject({ parent_task_id: 'p1', settings: { project_kind: 'checkpoint' } })).toBe(false);
    });

    it('returns true for a root task with settings.project_kind = checkpoint', () => {
        expect(isCheckpointProject({ parent_task_id: null, settings: { project_kind: 'checkpoint' } })).toBe(true);
    });

    it('returns false for a root task without the settings key', () => {
        expect(isCheckpointProject({ parent_task_id: null, settings: {} })).toBe(false);
        expect(isCheckpointProject({ parent_task_id: null, settings: null })).toBe(false);
    });

    it('returns false for a root task with explicit date kind', () => {
        expect(isCheckpointProject({ parent_task_id: null, settings: { project_kind: 'date' } })).toBe(false);
    });
});

// recalculateProjectDates checkpoint carve-out retired alongside the function
// itself; the DB trigger trg_waterfall_recompute is now the canonical cascade.
// Checkpoint projects still suppress the date cascade because their root never
// gets a start_date set, so the trigger short-circuits with 'no start_date'.

describe('deriveUrgencyForProject (Wave 29)', () => {
    const now = new Date('2026-04-19T12:00:00Z');

    it('suppresses urgency to not_yet_due for checkpoint projects', () => {
        const result = deriveUrgencyForProject(
            { start_date: '2026-01-01', due_date: '2026-01-10', is_complete: false, status: 'todo' },
            { parent_task_id: null, settings: { project_kind: 'checkpoint' } },
            3,
            now,
        );
        expect(result).toBe('not_yet_due');
    });

    it('returns null for completed tasks even in checkpoint projects', () => {
        const result = deriveUrgencyForProject(
            { start_date: '2026-01-01', due_date: '2026-01-10', is_complete: true, status: 'completed' },
            { parent_task_id: null, settings: { project_kind: 'checkpoint' } },
            3,
            now,
        );
        expect(result).toBe(null);
    });

    it('falls through to deriveUrgency for date-kind projects', () => {
        const result = deriveUrgencyForProject(
            { start_date: '2026-01-01', due_date: '2026-01-10', is_complete: false, status: 'todo' },
            { parent_task_id: null, settings: { project_kind: 'date' } },
            3,
            now,
        );
        expect(result).toBe('overdue');
    });

    it('falls through when rootTask is null/undefined (backward compat)', () => {
        const result = deriveUrgencyForProject(
            { start_date: '2026-01-01', due_date: '2026-01-10', is_complete: false, status: 'todo' },
            null,
            3,
            now,
        );
        expect(result).toBe('overdue');
    });
});
