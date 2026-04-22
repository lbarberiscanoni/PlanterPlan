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

const listUsers = vi.fn();
const userDetail = vi.fn();
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        admin: {
            listUsers: (...args: unknown[]) => listUsers(...args),
            userDetail: (...args: unknown[]) => userDetail(...args),
        },
    },
}));

import { useAdminUsers, useAdminUserDetail } from '@/features/admin/hooks/useAdminUsers';

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
}

describe('useAdminUsers (Wave 34)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls admin.listUsers with the filter, limit, and offset', async () => {
        listUsers.mockResolvedValue([
            { id: 'u1', email: 'a@x.com', display_name: 'A', last_sign_in_at: null, is_admin: false, active_project_count: 1, completed_tasks_30d: 0, overdue_task_count: 0 },
        ]);

        const { result } = renderHook(
            () =>
                useAdminUsers(
                    { role: 'admin', lastLogin: 'last_7', hasOverdue: true, search: 'alice' },
                    { limit: 25, offset: 50 },
                ),
            { wrapper: makeWrapper() },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(listUsers).toHaveBeenCalledWith(
            { role: 'admin', lastLogin: 'last_7', hasOverdue: true, search: 'alice' },
            25,
            50,
        );
        expect(result.current.data?.[0]?.email).toBe('a@x.com');
    });

    it('re-fetches when the filter shape changes', async () => {
        listUsers.mockResolvedValue([]);
        const { rerender } = renderHook(({ f }) => useAdminUsers(f), {
            initialProps: { f: { role: 'all' } as { role: 'all' | 'admin' | 'standard' } },
            wrapper: makeWrapper(),
        });
        await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(1));

        rerender({ f: { role: 'admin' } });
        await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
    });

    it('useAdminUserDetail is disabled when uid is null', () => {
        const { result } = renderHook(() => useAdminUserDetail(null), { wrapper: makeWrapper() });
        expect(result.current.fetchStatus).toBe('idle');
        expect(userDetail).not.toHaveBeenCalled();
    });

    it('useAdminUserDetail fires when a uid is passed', async () => {
        userDetail.mockResolvedValue({
            profile: { id: 'u1', email: 'a@x.com', display_name: 'A', last_sign_in_at: null, created_at: '2026-01-01T00:00:00Z', is_admin: false },
            projects: [],
            task_counts: { assigned: 0, completed: 0, overdue: 0 },
        });
        const { result } = renderHook(() => useAdminUserDetail('u1'), { wrapper: makeWrapper() });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(userDetail).toHaveBeenCalledWith('u1');
        expect(result.current.data?.profile.email).toBe('a@x.com');
    });
});
