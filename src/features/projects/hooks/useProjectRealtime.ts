import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/db/client';
import { useAuth } from '@/shared/contexts/AuthContext';
import { z } from 'zod';

const TaskPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  root_id: z.string().uuid().nullable().optional()
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
            
            if (changedTask) {
              if (changedTask.root_id) {
                queryClient.invalidateQueries({ queryKey: ['tasks', 'tree', changedTask.root_id] });
              }
              if (changedTask.id) {
                 queryClient.invalidateQueries({ queryKey: ['task', changedTask.id] });
              }
            }

            queryClient.invalidateQueries({ queryKey: ['tasks', 'root'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            if (projectId) {
              queryClient.invalidateQueries({ queryKey: ['project', projectId] });
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
