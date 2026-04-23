import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/db/client';
import { useAuth } from '@/shared/contexts/AuthContext';
import { z } from 'zod';

const TaskPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  root_id: z.string().uuid().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional()
}).catchall(z.any());

/**
 * Hook to subscribe to real-time changes for tasks within a specific project context.
 * Strict Zod payload validation applied to mutation events.
 */
export const useProjectRealtime = (projectId: string | null = null): void => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    const channelName = projectId ? `db-changes:project-${projectId}` : 'db-changes:global';
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: projectId
            ? `root_id=eq.${projectId}`
            : userId
            ? `creator=eq.${userId}`
            : undefined,
        },
        (payload: Record<string, unknown>) => {
          if (import.meta.env.DEV) {
            console.log('[Realtime] Task Change detected:', payload);
          }
          try {
            // Strictly guard incoming WebSocket payloads
            const changedTask = TaskPayloadSchema.parse(payload.new || payload.old);

            // Scope invalidations to the affected project — the previous
            // unconditional `['projects']` + `['tasks', 'root']` fan-out
            // multiplied refetches during bulk ops. Template clone (6 phases
            // + milestones + tasks ≈ 40 rows) produced 40 Project.list()
            // refetches back-to-back. Now: one hierarchy invalidation per
            // event, plus a single root-project query refresh only if the
            // changed row actually is a root task.
            if (changedTask) {
              const rootId = changedTask.root_id;
              if (rootId) {
                queryClient.invalidateQueries({ queryKey: ['tasks', 'tree', rootId] });
                queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] });
              }
              if (changedTask.id) {
                queryClient.invalidateQueries({ queryKey: ['task', changedTask.id] });
                // Root-task-only: when the changed row IS a project root
                // (id === root_id OR parent_task_id is null), refresh the
                // projects list so title/status edits land. Otherwise the
                // outer `['projects']` invalidation is wasteful.
                if (rootId === changedTask.id || changedTask.parent_task_id === null) {
                  queryClient.invalidateQueries({ queryKey: ['projects'] });
                  if (projectId) {
                    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                  }
                }
              }
            }
          } catch (e) {
            console.error('[Realtime] Payload violated Zod contract:', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, projectId, userId]);
};
