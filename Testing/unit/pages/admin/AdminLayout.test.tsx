import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
    toast: { error: (...args: unknown[]) => toastError(...args) },
    Toaster: () => null,
}));

const authState = { user: null as { id: string; role: string } | null, loading: false };
vi.mock('@/shared/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: authState.user,
        loading: authState.loading,
        savedEmailAddresses: [],
        rememberEmailAddress: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderWithProviders } from '@test/render-with-providers';
import AdminLayout from '@/pages/admin/AdminLayout';

function renderAt(initialEntry = '/admin') {
    return renderWithProviders(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<div data-testid="admin-home-stub">home</div>} />
                </Route>
                <Route path="/dashboard" element={<div data-testid="dashboard-stub">dashboard</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AdminLayout auth gate (Wave 34)', () => {
    beforeEach(() => {
        toastError.mockReset();
    });

    it('redirects non-admin users to /dashboard with a toast', async () => {
        authState.user = { id: 'u1', role: 'editor' };
        authState.loading = false;
        renderAt();
        expect(await screen.findByTestId('dashboard-stub')).toBeInTheDocument();
        expect(toastError).toHaveBeenCalledWith('You need admin access for this page.');
    });

    it('renders the admin shell + nav when the user is an admin', async () => {
        authState.user = { id: 'admin-1', role: 'admin' };
        authState.loading = false;
        renderAt();
        expect(await screen.findByTestId('admin-layout')).toBeInTheDocument();
        expect(screen.getByTestId('admin-nav-home')).toBeInTheDocument();
        expect(screen.getByTestId('admin-nav-users')).toBeInTheDocument();
        expect(screen.getByTestId('admin-nav-analytics')).toBeInTheDocument();
        expect(screen.getByTestId('admin-home-stub')).toBeInTheDocument();
    });

    it('shows a loading state while auth hydration is pending', () => {
        authState.user = null;
        authState.loading = true;
        renderAt();
        expect(screen.getByTestId('admin-loading')).toBeInTheDocument();
    });

    it('does not toast on the admin branch', async () => {
        authState.user = { id: 'admin-2', role: 'admin' };
        authState.loading = false;
        renderAt();
        await waitFor(() => expect(screen.getByTestId('admin-layout')).toBeInTheDocument());
        expect(toastError).not.toHaveBeenCalled();
    });
});
