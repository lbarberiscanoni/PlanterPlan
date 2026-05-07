import { describe, it, expect } from 'vitest';
import { applyPhaseLeads, extractPhaseLeads } from '@/shared/lib/phase-lead';

describe('extractPhaseLeads (Wave 29)', () => {
    it('returns [] for null/undefined/empty settings', () => {
        expect(extractPhaseLeads(null)).toEqual([]);
        expect(extractPhaseLeads(undefined)).toEqual([]);
        expect(extractPhaseLeads({ settings: null })).toEqual([]);
        expect(extractPhaseLeads({ settings: {} })).toEqual([]);
    });

    it('returns [] when the key is not an array', () => {
        expect(extractPhaseLeads({ settings: { phase_lead_user_ids: 'nope' } })).toEqual([]);
        expect(extractPhaseLeads({ settings: { phase_lead_user_ids: 42 } })).toEqual([]);
    });

    it('filters non-string elements and dedupes', () => {
        const out = extractPhaseLeads({
            settings: {
                phase_lead_user_ids: ['u1', 'u2', 'u1', 42 as unknown as string, '', 'u3'],
            },
        });
        expect(out).toEqual(['u1', 'u2', 'u3']);
    });
});

describe('applyPhaseLeads (Wave 29)', () => {
    it('merges the list while preserving other settings keys', () => {
        const merged = applyPhaseLeads(
            { published: true, due_soon_threshold: 5 },
            ['u1', 'u2'],
        );
        expect(merged).toEqual({
            published: true,
            due_soon_threshold: 5,
            phase_lead_user_ids: ['u1', 'u2'],
        });
    });

    it('dedupes input', () => {
        expect(applyPhaseLeads({}, ['u1', 'u1', 'u2']).phase_lead_user_ids).toEqual(['u1', 'u2']);
    });

    it('filters empty strings and non-strings defensively', () => {
        expect(
            applyPhaseLeads({}, ['u1', '', 'u2', null as unknown as string]).phase_lead_user_ids,
        ).toEqual(['u1', 'u2']);
    });

    it('replaces any existing phase_lead_user_ids wholesale', () => {
        const merged = applyPhaseLeads({ phase_lead_user_ids: ['old'] }, ['new']);
        expect(merged.phase_lead_user_ids).toEqual(['new']);
    });

    it('tolerates null/undefined/array-shaped input', () => {
        expect(applyPhaseLeads(null, ['u1']).phase_lead_user_ids).toEqual(['u1']);
        expect(applyPhaseLeads(undefined, ['u1']).phase_lead_user_ids).toEqual(['u1']);
        expect(applyPhaseLeads([] as unknown as Record<string, unknown>, ['u1']).phase_lead_user_ids).toEqual(['u1']);
    });
});
