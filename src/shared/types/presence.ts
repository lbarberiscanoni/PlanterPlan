export interface PresenceState {
    user_id: string;
    email: string;
    /** ms epoch - used for stable sort and same-user dedup across tabs. */
    joinedAt: number;
    /** Peer's currently-focused task id, or null when viewing the project shell. */
    focusedTaskId: string | null;
}
