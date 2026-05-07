import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { ActivityLogWithActor } from '@/shared/db/app.types';

type EntityType = 'task' | 'comment' | 'member' | 'project';

/**
 * Project-scoped activity feed. The query key includes `opts` so toggling
 * filters (entity types) or paging (`before` cursor) spawns a fresh fetch
 * rather than mutating the already-rendered feed.
 *
 * @param projectId The project's root task id. `null` disables the query.
 * @param opts `limit` (default 50 server-side) and optional `entityTypes`
 *   filter applied on the server.
 * @returns React Query result holding `ActivityLogWithActor[]`.
 */
export function useProjectActivity(
    projectId: string | null,
    opts: { limit?: number; entityTypes?: ReadonlyArray<EntityType> } = {},
) {
    return useQuery<ActivityLogWithActor[]>({
        queryKey: ['activityLog', projectId, opts],
        queryFn: () => planter.entities.ActivityLog.listByProject(projectId as string, opts),
        enabled: !!projectId,
    });
}

/**
 * Per-task activity feed for the collapsed rail inside `TaskDetailsView`.
 *
 * @param taskId The task row id. `null` disables the query.
 * @param opts `limit` (default 20 server-side).
 * @returns React Query result holding `ActivityLogWithActor[]`.
 */
export function useTaskActivity(taskId: string | null, opts: { limit?: number } = {}) {
    return useQuery<ActivityLogWithActor[]>({
        queryKey: ['activityLog', 'task', taskId, opts],
        queryFn: () => planter.entities.ActivityLog.listByEntity('task', taskId as string, opts),
        enabled: !!taskId,
    });
}
