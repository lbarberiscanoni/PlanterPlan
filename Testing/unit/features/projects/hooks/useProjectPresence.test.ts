import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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

vi.mock('@/shared/contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'me', email: 'me@example.com' } }),
}));

import { useProjectPresence } from '@/features/projects/hooks/useProjectPresence';

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    channel = mockSupabaseChannel();
    mockChannel.mockImplementation(() => channel);
    mockRemoveChannel.mockImplementation((c: MockSupabaseChannel) => c.__markRemoved());
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useProjectPresence', () => {
    it('opens one subscribed channel and broadcasts focus through that channel', async () => {
        const { rerender } = renderHook(
            ({ focusedTaskId }: { focusedTaskId: string | null }) => useProjectPresence('p1', focusedTaskId),
            { initialProps: { focusedTaskId: null } },
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockChannel).toHaveBeenCalledTimes(1);
        expect(mockChannel).toHaveBeenCalledWith('presence:project:p1', {
            config: { presence: { key: 'me' } },
        });
        expect(channel.__subscribed).toBe(true);
        expect(channel.track).toHaveBeenCalledTimes(1);
        expect(channel.track).toHaveBeenLastCalledWith(expect.objectContaining({ focusedTaskId: null }));

        rerender({ focusedTaskId: 't1' });
        act(() => {
            vi.advanceTimersByTime(260);
        });

        expect(mockChannel).toHaveBeenCalledTimes(1);
        expect(channel.track).toHaveBeenCalledTimes(2);
        expect(channel.track).toHaveBeenLastCalledWith(expect.objectContaining({
            user_id: 'me',
            email: 'me@example.com',
            focusedTaskId: 't1',
        }));
    });

    it('deduplicates presence state by user using the earliest join time', async () => {
        const { result } = renderHook(() => useProjectPresence('p1', null));

        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            channel.__setPresenceState({
                me: [
                    { user_id: 'me', email: 'me@example.com', joinedAt: 20, focusedTaskId: 'late' },
                    { user_id: 'me', email: 'me@example.com', joinedAt: 10, focusedTaskId: 'early' },
                ],
                other: [
                    { user_id: 'other', email: 'other@example.com', joinedAt: 15, focusedTaskId: null },
                ],
            });
            channel.__firePresence('sync');
        });

        expect(result.current.presentUsers.map((u) => [u.user_id, u.joinedAt, u.focusedTaskId])).toEqual([
            ['me', 10, 'early'],
            ['other', 15, null],
        ]);
    });

    it('removes the subscribed channel on unmount', async () => {
        const { unmount } = renderHook(() => useProjectPresence('p1', null));

        await act(async () => {
            await Promise.resolve();
        });
        unmount();

        expect(channel.untrack).toHaveBeenCalledOnce();
        expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
        expect(channel.__removed).toBe(true);
    });
});
