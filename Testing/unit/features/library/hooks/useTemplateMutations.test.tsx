import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateTemplate } from '@/features/library/hooks/useTemplateMutations';

const mockTaskCreate = vi.fn();
const mockTeamMemberCreate = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            Task: { create: (...args: unknown[]) => mockTaskCreate(...args) },
            TeamMember: { create: (...args: unknown[]) => mockTeamMemberCreate(...args) },
        },
    },
}));

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useCreateTemplate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTaskCreate.mockResolvedValue({ id: 'template-1', title: 'Template from hook' });
        mockTeamMemberCreate.mockResolvedValue({});
    });

    it('creates a template root, creates owner membership, and invalidates template project queries', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useCreateTemplate(), { wrapper: createWrapper(queryClient) });

        await act(async () => {
            await result.current.mutateAsync({
                title: 'Template from hook',
                description: 'Reusable',
                isPublished: true,
                userId: 'user-1',
            });
        });

        expect(mockTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Template from hook',
            description: 'Reusable',
            origin: 'template',
            parent_task_id: null,
            root_id: null,
            creator: 'user-1',
            assignee_id: 'user-1',
            settings: { published: true },
        }));
        expect(mockTeamMemberCreate).toHaveBeenCalledWith({
            project_id: 'template-1',
            user_id: 'user-1',
            role: 'owner',
        });
        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'template'] });
        });
    });
});
