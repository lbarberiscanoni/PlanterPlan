import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/shared/contexts/AuthContext';
import { planter } from '@/shared/api/planterClient';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import { Project, Task } from '@/shared/db/app.types';

const PAGE_SIZE = 20;

export const useTaskQuery = () => {
    const { user: authUser } = useAuth();
    const currentUserId = authUser?.id || null;


    // 1. Fetch Paginated User Projects (Instances)
    const {
        data: projectsData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isLoadingProjects,
        error: projectsError,
        refetch: refetchProjects,
    } = useInfiniteQuery({
        queryKey: ['projects', 'instance', currentUserId],
        queryFn: async ({ pageParam = 1 }) => {
            if (!currentUserId) return [];
            return await planter.entities.Project.listByCreator(currentUserId, pageParam as number, PAGE_SIZE);
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            return lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined;
        },
        enabled: !!currentUserId,
        staleTime: STALE_TIMES.medium,
    });

    // 2. Fetch Templates
    const {
        data: templates,
        isLoading: isLoadingTemplates,
    } = useQuery({
        queryKey: ['projects', 'template', currentUserId],
        queryFn: async () => {
            if (!currentUserId) return [];
            return await planter.entities.Task.filter({ origin: 'template', parent_task_id: null, creator: currentUserId }) as Task[];
        },
        enabled: !!currentUserId,
        staleTime: STALE_TIMES.long,
        gcTime: STALE_TIMES.veryLong,
    });

    // 3. Fetch Joined Projects
    const {
        data: joinedProjects,
        error: joinedError,
        isLoading: isLoadingJoined,
    } = useQuery({
        queryKey: ['projects', 'joined', currentUserId],
        queryFn: async () => {
            if (!currentUserId) return [];
            return await planter.entities.Project.listJoined(currentUserId);
        },
        enabled: !!currentUserId,
        staleTime: STALE_TIMES.medium,
    });

    // Combine instances and templates into tasks
    const tasks: (Project | Task)[] = [
        ...(projectsData?.pages.flat() || []),
        ...(templates as Task[] || [])
    ];

    const findTask = (id: string) => {
        if (!id) return null;
        const inRoots = tasks.find((t) => t.id === id) || (joinedProjects as Project[])?.find((t) => t.id === id);
        if (inRoots) return inRoots;
        return null;
    };



    const loading = isLoadingProjects || isLoadingTemplates || (!joinedProjects && isLoadingJoined);
    const error = projectsError ? (projectsError as Error).message : null;

    // Helper exposed for manual hydration elsewhere if needed, though React Query
    // manages cache now, we preserve the map in `useTaskOperations` or components.
    // For now, return a dummy object as actual hydration is handled separately.

    return {
        tasks,
        joinedProjects: joinedProjects || [],
        loading,
        projectsLoading: isLoadingProjects,
        joinedLoading: !joinedProjects && isLoadingJoined,
        templatesLoading: isLoadingTemplates,
        error,
        joinedError: joinedError ? (joinedError as Error).message : null,
        currentUserId,
        hasMore: !!hasNextPage,
        isFetchingMore: isFetchingNextPage,
        loadMoreProjects: fetchNextPage,
        refetchProjects,
        findTask,
    };
};
