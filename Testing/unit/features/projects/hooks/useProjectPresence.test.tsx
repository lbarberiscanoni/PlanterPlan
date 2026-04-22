import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { mockSupabaseChannel, type MockSupabaseChannel } from '@/../Testing/test-utils/mocks/supabase-channel';

let channel: MockSupabaseChannel;
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@/shared/db/client', () => ({
    supabase: {
        channel: (...args: unknown[]) => mockChannel(...args),
        removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    },
}));

// Stable references: the `user` object MUST keep the same identity across
// renders, or the `[projectId, user]` dep array on `useProjectPresence`'s
// effect re-fires every render → cleanup setMyPresenceKey(null) races the
// async `setMyPresenceKey(user.id)` in subscribe's callback, producing an
// intermittent `null` vs `'me'` observed by the first test.
const mockAuthUser = { id: 'me', email: 'me@example.com' };
const mockAuthValue = { user: mockAuthUser };
vi.mock('@/shared/contexts/AuthContext', () => ({
    useAuth: () => mockAuthValue,
}));

import { useProjectPresence } from '@/features/projects/hooks/useProjectPresence';

beforeEach(() => {
    vi.clearAllMocks();
    channel = mockSupabaseChannel();
    mockChannel.mockImplementation(() => channel);
    mockRemoveChannel.mockImplementation((ch: MockSupabaseChannel) => ch.__markRemoved());
});

describe('useProjectPresence (Wave 27)', () => {
    it('opens presence:project:<id> on mount with the user id as presence key', async () => {
        const { result } = renderHook(() => useProjectPresence('p1'));

        expect(mockChannel).toHaveBeenCalledWith('presence:project:p1', {
            config: { presence: { key: 'me' } },
        });
        expect(channel.__subscribed).toBe(true);
        // track called with current user + focusedTaskId: null after SUBSCRIBED.
        await waitFor(() => {
            expect(channel.track).toHaveBeenCalledWith(
                expect.objectContaining({ user_id: 'me', email: 'me@example.com', focusedTaskId: null }),
            );
        });
        await waitFor(() => expect(result.current.myPresenceKey).toBe('me'));
    });

    it('populates presentUsers from presenceState() on sync, sorted by joinedAt asc', async () => {
        channel.__setPresenceState({
            u1: [{ user_id: 'u1', email: 'a@x.com', joinedAt: 3000, focusedTaskId: null }],
            u2: [{ user_id: 'u2', email: 'b@x.com', joinedAt: 1000, focusedTaskId: null }],
            me: [{ user_id: 'me', email: 'me@example.com', joinedAt: 2000, focusedTaskId: null }],
        });

        const { result } = renderHook(() => useProjectPresence('p1'));
        act(() => channel.__firePresence('sync'));

        await waitFor(() => expect(result.current.presentUsers).toHaveLength(3));
        const ids = result.current.presentUsers.map((u) => u.user_id);
        expect(ids).toEqual(['u2', 'me', 'u1']); // 1000 < 2000 < 3000
    });

    it('dedups multi-tab slots per user_id, keeping the earliest joinedAt', async () => {
        // Two tabs for user u1: earliest joinedAt 1000, later joinedAt 5000.
        channel.__setPresenceState({
            u1: [
                { user_id: 'u1', email: 'a@x.com', joinedAt: 5000, focusedTaskId: 't9' },
                { user_id: 'u1', email: 'a@x.com', joinedAt: 1000, focusedTaskId: null },
            ],
        });

        const { result } = renderHook(() => useProjectPresence('p1'));
        act(() => channel.__firePresence('sync'));

        await waitFor(() => expect(result.current.presentUsers).toHaveLength(1));
        const [only] = result.current.presentUsers;
        expect(only.joinedAt).toBe(1000);
        expect(only.focusedTaskId).toBeNull();
    });

    it('untracks + removes the channel on unmount', () => {
        const { unmount } = renderHook(() => useProjectPresence('p1'));
        unmount();
        expect(channel.untrack).toHaveBeenCalled();
        expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
        expect(channel.__removed).toBe(true);
    });

    it('is a no-op when projectId is null', () => {
        renderHook(() => useProjectPresence(null));
        expect(mockChannel).not.toHaveBeenCalled();
    });
});
