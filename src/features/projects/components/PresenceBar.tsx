import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import type { PresenceState } from '@/shared/types/presence';

interface PresenceBarProps {
    presentUsers: PresenceState[];
    currentUserId: string | null;
}

const MAX_VISIBLE = 5;

function initials(email: string): string {
    if (!email) return '??';
    const local = email.split('@')[0] ?? email;
    return local.slice(0, 2).toUpperCase();
}

function minutesSince(joinedAt: number): number {
    const diff = Date.now() - joinedAt;
    return Math.max(0, Math.floor(diff / 60000));
}

function tooltipText(user: PresenceState): string {
    const mins = minutesSince(user.joinedAt);
    const suffix = mins === 0 ? 'just now' : mins === 1 ? 'for 1 minute' : `for ${mins} minutes`;
    return `${user.email} — viewing ${suffix}`;
}

export function PresenceBar({ presentUsers, currentUserId }: PresenceBarProps) {
    // Self-hide — user never sees their own chip.
    const peers = useMemo(
        () => presentUsers.filter((u) => u.user_id !== currentUserId),
        [presentUsers, currentUserId],
    );

    if (peers.length === 0) return null;

    const visible = peers.slice(0, MAX_VISIBLE);
    const overflow = peers.length - visible.length;

    return (
        <div
            className="inline-flex items-center gap-1"
            data-testid="presence-bar"
            data-peer-count={peers.length}
        >
            {visible.map((u) => (
                <Popover key={u.user_id}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={tooltipText(u)}
                            data-testid={`presence-chip-${u.user_id}`}
                            className="rounded-full ring-2 ring-white hover:ring-brand-200 transition-shadow"
                        >
                            <Avatar className="h-7 w-7 cursor-pointer">
                                <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
                                    {initials(u.email)}
                                </AvatarFallback>
                            </Avatar>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto text-xs" align="end">
                        <p className="font-semibold text-slate-900">{u.email}</p>
                        <p className="text-slate-500">viewing {minutesFragment(u.joinedAt)}</p>
                    </PopoverContent>
                </Popover>
            ))}

            {overflow > 0 && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            data-testid="presence-chip-overflow"
                            aria-label={`${overflow} more viewing`}
                            className="rounded-full ring-2 ring-white hover:ring-brand-200"
                        >
                            <Avatar className="h-7 w-7 cursor-pointer">
                                <AvatarFallback className="bg-slate-100 text-slate-500 text-xs font-semibold">
                                    +{overflow}
                                </AvatarFallback>
                            </Avatar>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto text-xs" align="end">
                        <p className="font-semibold text-slate-900 mb-2">Also viewing</p>
                        <ul className="space-y-1">
                            {peers.slice(MAX_VISIBLE).map((u) => (
                                <li key={u.user_id} className="text-slate-700">
                                    {u.email}
                                </li>
                            ))}
                        </ul>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

function minutesFragment(joinedAt: number): string {
    const mins = minutesSince(joinedAt);
    if (mins === 0) return 'just now';
    if (mins === 1) return 'for 1 minute';
    return `for ${mins} minutes`;
}
