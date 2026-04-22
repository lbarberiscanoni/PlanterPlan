import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));

const analyticsSnapshot = vi.fn();
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        admin: {
            analyticsSnapshot: () => analyticsSnapshot(),
        },
    },
}));

import { useAdminAnalytics } from '@/features/admin/hooks/useAdminAnalytics';

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
}

describe('useAdminAnalytics (Wave 34)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hydrates the analytics snapshot from the RPC', async () => {
        analyticsSnapshot.mockResolvedValue({
            totals: { users: 10, projects: 3, active_projects_30d: 2, new_users_30d: 1 },
            new_projects_per_week: [{ week_start: '2026-04-06', count: 1 }],
            project_kind_breakdown: [{ kind: 'date', count: 3 }],
            task_status_breakdown: [{ status: 'in_progress', count: 5 }],
            most_active_users: [],
            most_popular_templates: [],
        });
        const { result } = renderHook(() => useAdminAnalytics(), { wrapper: makeWrapper() });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.totals.users).toBe(10);
        expect(analyticsSnapshot).toHaveBeenCalledTimes(1);
    });

    it('gracefully returns null when the RPC returns null', async () => {
        analyticsSnapshot.mockResolvedValue(null);
        const { result } = renderHook(() => useAdminAnalytics(), { wrapper: makeWrapper() });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBeNull();
    });

    it('surfaces RPC errors through the React Query error channel', async () => {
        analyticsSnapshot.mockRejectedValue(new Error('unauthorized: admin role required'));
        const { result } = renderHook(() => useAdminAnalytics(), { wrapper: makeWrapper() });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toMatch(/unauthorized/i);
    });
});
