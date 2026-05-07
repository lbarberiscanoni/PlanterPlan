import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock useMasterLibrarySearch to control the input snapshot.
const masterLibraryReturn: {
    results: Array<{ id: string; title?: string; description?: string }>;
    isLoading: boolean;
} = { results: [], isLoading: false };
vi.mock('@/shared/hooks/useMasterLibrarySearch', () => ({
    default: () => masterLibraryReturn,
    useMasterLibrarySearch: () => masterLibraryReturn,
}));

import useRelatedTemplates from '@/features/library/hooks/useRelatedTemplates';

beforeEach(() => {
    vi.clearAllMocks();
    masterLibraryReturn.results = [
        { id: 'a', title: 'Grand opening logistics', description: 'Rent venue and rehearse' },
        { id: 'b', title: 'Weekly volunteer meeting', description: 'Standing agenda' },
        { id: 'c', title: 'Opening service run-sheet', description: 'Minute-by-minute opening plan' },
        { id: 'd', title: 'Budget reconciliation', description: 'Quarterly books cleanup' },
    ];
    masterLibraryReturn.isLoading = false;
});

describe('useRelatedTemplates (Wave 25)', () => {
    it('returns an empty list when the seed has no title or description', () => {
        const { result } = renderHook(() =>
            useRelatedTemplates({ id: 'seed', title: '', description: '' }),
        );
        expect(result.current.results).toEqual([]);
        expect(result.current.hasResults).toBe(false);
    });

    it('returns an empty list when the seed is null', () => {
        const { result } = renderHook(() => useRelatedTemplates(null));
        expect(result.current.results).toEqual([]);
    });

    it('ranks candidates by similarity to the seed', () => {
        const { result } = renderHook(() =>
            useRelatedTemplates({
                id: 'seed',
                title: 'Launch grand opening service',
                description: 'Plan the grand opening service launch',
            }),
        );
        const ids = result.current.results.map((r) => r.id);
        // 'a' and 'c' share several tokens; 'b' and 'd' share none.
        expect(ids).toContain('a');
        expect(ids).toContain('c');
        expect(ids).not.toContain('b');
        expect(ids).not.toContain('d');
    });

    it('honours the limit option', () => {
        const { result } = renderHook(() =>
            useRelatedTemplates(
                {
                    id: 'seed',
                    title: 'grand opening service',
                    description: 'grand opening',
                },
                { limit: 1 },
            ),
        );
        expect(result.current.results.length).toBeLessThanOrEqual(1);
    });

    it('exposes the upstream loading flag', () => {
        masterLibraryReturn.isLoading = true;
        const { result } = renderHook(() =>
            useRelatedTemplates({ id: 'seed', title: 'x', description: 'y' }),
        );
        expect(result.current.isLoading).toBe(true);
    });
});
