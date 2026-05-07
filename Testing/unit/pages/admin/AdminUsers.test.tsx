import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, MemoryRouter } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAdminUsers = vi.fn();
const useAdminUserDetail = vi.fn();
const suspendUser = vi.fn();
const toastError = vi.fn();

vi.mock('@/features/admin/hooks/useAdminUsers', () => ({
    useAdminUsers: (...args: unknown[]) => useAdminUsers(...args),
    useAdminUserDetail: (...args: unknown[]) => useAdminUserDetail(...args),
}));

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        admin: {
            setAdminRole: vi.fn(),
            suspendUser: (...args: unknown[]) => suspendUser(...args),
            unsuspendUser: vi.fn(),
            generatePasswordResetLink: vi.fn(),
        },
    },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({
        user: { id: 'admin-user', role: 'admin' },
        loading: false,
        savedEmailAddresses: [],
        rememberEmailAddress: vi.fn(),
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: (...args: unknown[]) => toastError(...args),
    },
}));

import { renderWithProviders } from '@test/render-with-providers';
import AdminUsers from '@/pages/admin/AdminUsers';

function renderAdminUsers() {
    return renderWithProviders(
        <MemoryRouter initialEntries={['/admin/users/target-user']}>
            <Routes>
                <Route path="/admin/users/:uid" element={<AdminUsers />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AdminUsers moderation actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAdminUsers.mockReturnValue({
            data: [{
                id: 'target-user',
                email: 'target@example.com',
                display_name: 'Target User',
                last_sign_in_at: null,
                is_admin: false,
                active_project_count: 1,
                completed_tasks_30d: 0,
                overdue_task_count: 0,
            }],
            isLoading: false,
            error: null,
        });
        useAdminUserDetail.mockReturnValue({
            data: {
                profile: {
                    id: 'target-user',
                    email: 'target@example.com',
                    display_name: 'Target User',
                    last_sign_in_at: null,
                    created_at: '2026-01-01T00:00:00Z',
                    banned_until: null,
                    is_admin: false,
                },
                projects: [],
                task_counts: { assigned: 0, completed: 0, overdue: 0 },
            },
            isLoading: false,
            error: null,
        });
    });

    it('surfaces suspension edge-function failures in the admin detail aside', async () => {
        suspendUser.mockRejectedValue(new Error('unauthorized: admin role required'));
        const user = userEvent.setup();
        renderAdminUsers();

        await user.click(screen.getByTestId('admin-users-toggle-suspension'));
        const dialog = await screen.findByRole('alertdialog', { name: 'Suspend this user?' });
        await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

        await waitFor(() => {
            expect(suspendUser).toHaveBeenCalledWith('target-user');
        });
        expect(toastError).toHaveBeenCalledWith('Failed to change suspension state', {
            description: 'unauthorized: admin role required',
        });
    });
});
