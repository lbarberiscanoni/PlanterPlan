import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/shared/db/client';
import { useAuth } from '@/shared/contexts/AuthContext';

export interface PresenceState {
    user_id: string;
    email: string;
    /** ms epoch — used for stable sort and same-user dedup across tabs. */
    joinedAt: number;
    /** Peer's currently-focused task id, or null when viewing the project shell. */
    focusedTaskId: string | null;
}

interface UseProjectPresenceResult {
    presentUsers: PresenceState[];
    myPresenceKey: string | null;
}

/**
 * Opens a per-project Supabase realtime presence channel so peers can see
 * who is currently viewing the project and which task (if any) they have
 * open. Emits dedup'd, joinedAt-sorted presence rows.
 *
 * - Channel name: `presence:project:<projectId>`.
 * - Multi-tab dedup: the same `user_id` from N tabs collapses to a single
 *   row using the earliest `joinedAt`.
 * - No-op when `projectId` or `user` is null (route guards outside the
 *   Project page don't open the channel at all).
 *
 * @param {string | null} projectId The project's root task id, or null.
 * @param {string | null} focusedTaskId The task currently open in the details
 *   panel, or null when the project shell is focused.
 * @returns {UseProjectPresenceResult} `{ presentUsers, myPresenceKey }` —
 *   `presentUsers` is the deduped + sorted roster; `myPresenceKey` is the
 *   current user's id once subscribed (consumers that want to filter self
 *   can compare against it).
 */
export function useProjectPresence(projectId: string | null, focusedTaskId: string | null = null): UseProjectPresenceResult {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const userEmail = user?.email ?? '';
    const [presentUsers, setPresentUsers] = useState<PresenceState[]>([]);
    const [myPresenceKey, setMyPresenceKey] = useState<string | null>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const joinedAtRef = useRef<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!projectId || !userId) {
            return;
        }
        const joinedAt = Date.now();
        joinedAtRef.current = joinedAt;
        const channel = supabase.channel(`presence:project:${projectId}`, {
            config: { presence: { key: userId } },
        });
        channelRef.current = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState<PresenceState>();
                // Dedup by user_id (multi-tab); keep earliest joinedAt per user.
                const byUser = new Map<string, PresenceState>();
                for (const userKey of Object.keys(state)) {
                    for (const slot of state[userKey]) {
                        const existing = byUser.get(slot.user_id);
                        if (!existing || slot.joinedAt < existing.joinedAt) {
                            byUser.set(slot.user_id, slot);
                        }
                    }
                }
                setPresentUsers([...byUser.values()].sort((a, b) => a.joinedAt - b.joinedAt));
            })
            .subscribe(async (status, err) => {
                if (err) {
                    console.error(`[Project Presence] Channel error (${status}):`, err);
                    return;
                }
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        user_id: userId,
                        email: userEmail,
                        joinedAt,
                        focusedTaskId: null,
                    } satisfies PresenceState);
                    setMyPresenceKey(userId);
                }
            });

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            channel.untrack();
            supabase.removeChannel(channel);
            channelRef.current = null;
            joinedAtRef.current = null;
            setMyPresenceKey(null);
        };
    }, [projectId, userId, userEmail]);

    useEffect(() => {
        if (!projectId || !userId || !myPresenceKey || !channelRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
            void channelRef.current?.track({
                user_id: userId,
                email: userEmail,
                joinedAt: joinedAtRef.current ?? Date.now(),
                focusedTaskId,
            } satisfies PresenceState);
        }, 250);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [projectId, userId, userEmail, myPresenceKey, focusedTaskId]);

    const active = Boolean(projectId && userId);
    return {
        presentUsers: active ? presentUsers : [],
        myPresenceKey: active ? myPresenceKey : null,
    };
}
