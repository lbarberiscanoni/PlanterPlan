import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));

const searchUsers = vi.fn();
const searchRootTasks = vi.fn();
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        admin: {
            searchUsers: (...args: unknown[]) => searchUsers(...args),
            searchRootTasks: (...args: unknown[]) => searchRootTasks(...args),
        },
    },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => navigate };
});

import { renderWithProviders } from '@test/render-with-providers';
import AdminSearch from '@/pages/admin/components/AdminSearch';

function renderSearch() {
    return renderWithProviders(
        <MemoryRouter>
            <AdminSearch />
        </MemoryRouter>,
    );
}

describe('AdminSearch (Wave 34)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchUsers.mockResolvedValue([]);
        searchRootTasks.mockResolvedValue([]);
    });

    it('does not fire the RPC for a query under 2 characters', async () => {
        const user = userEvent.setup();
        renderSearch();
        const input = screen.getByTestId('admin-search-input');
        await user.type(input, 'a');
        await new Promise((r) => setTimeout(r, 300));
        expect(searchUsers).not.toHaveBeenCalled();
    });

    it('fires the RPC after typing a 2+ char query (debounce settles)', async () => {
        const user = userEvent.setup();
        renderSearch();
        await user.type(screen.getByTestId('admin-search-input'), 'alice');
        await waitFor(
            () => {
                expect(searchUsers).toHaveBeenCalled();
            },
            { timeout: 1500 },
        );
        expect(searchUsers).toHaveBeenLastCalledWith('alice', 10);
    });

    it('groups results into Users / Projects / Templates sections', async () => {
        searchUsers.mockResolvedValue([
            { id: 'u1', email: 'alice@church.com', display_name: 'Alice', last_sign_in_at: null, project_count: 2 },
        ]);
        searchRootTasks.mockImplementation((_query: string, origin: string) => Promise.resolve(
            origin === 'instance'
                ? [{ id: 'p1', title: 'Alice Project', origin: 'instance' }]
                : [{ id: 't1', title: 'Alice Template', origin: 'template' }],
        ));

        const user = userEvent.setup();
        renderSearch();
        await user.type(screen.getByTestId('admin-search-input'), 'alice');

        expect(await screen.findByText('Alice')).toBeInTheDocument();
        expect(await screen.findByText('Alice Project')).toBeInTheDocument();
        expect(await screen.findByText('Alice Template')).toBeInTheDocument();
        expect(searchRootTasks).toHaveBeenCalledWith('alice', 'instance', 10);
        expect(searchRootTasks).toHaveBeenCalledWith('alice', 'template', 10);
    });

    it('navigates to the user detail surface on user click', async () => {
        searchUsers.mockResolvedValue([
            { id: 'u1', email: 'alice@church.com', display_name: 'Alice', last_sign_in_at: null, project_count: 1 },
        ]);
        searchRootTasks.mockResolvedValue([]);

        const user = userEvent.setup();
        renderSearch();
        await user.type(screen.getByTestId('admin-search-input'), 'alice');

        const hit = await screen.findByText('Alice');
        await user.click(hit);

        expect(navigate).toHaveBeenCalledWith('/admin/users/u1');
    });
});
