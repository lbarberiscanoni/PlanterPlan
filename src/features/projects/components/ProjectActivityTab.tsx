import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { formatDisplayDate, addDaysToDate, formatDate, getNow } from '@/shared/lib/date-engine';
import { planter } from '@/shared/api/planterClient';
import { useProjectActivity } from '@/shared/hooks/useActivityLog';
import { ActivityRow } from '@/shared/ui/ActivityRow';
import type { ActivityLogWithActor } from '@/shared/db/app.types';

interface ProjectActivityTabProps {
    projectId: string | null;
}

type Filter = 'all' | 'task' | 'comment' | 'member';

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'task', label: 'Tasks' },
    { key: 'comment', label: 'Comments' },
    { key: 'member', label: 'Members' },
];

const PAGE_SIZE = 50;

function dayLabel(isoString: string): string {
    const today = getNow();
    const rowDayKey = formatDate(isoString, 'yyyy-MM-dd');
    if (rowDayKey && rowDayKey === formatDate(today, 'yyyy-MM-dd')) return 'Today';
    const yesterday = addDaysToDate(today, -1);
    if (yesterday && rowDayKey === formatDate(yesterday, 'yyyy-MM-dd')) return 'Yesterday';
    return formatDisplayDate(isoString);
}

function groupByDay(rows: ActivityLogWithActor[]): Array<{ day: string; rows: ActivityLogWithActor[] }> {
    const out: Array<{ day: string; rows: ActivityLogWithActor[] }> = [];
    const byDay = new Map<string, ActivityLogWithActor[]>();
    for (const r of rows) {
        const key = dayLabel(r.created_at);
        const list = byDay.get(key);
        if (list) list.push(r);
        else {
            const fresh: ActivityLogWithActor[] = [r];
            byDay.set(key, fresh);
            out.push({ day: key, rows: fresh });
        }
    }
    return out;
}

export default function ProjectActivityTab({ projectId }: ProjectActivityTabProps) {
    const [filter, setFilter] = useState<Filter>('all');
    const [olderPages, setOlderPages] = useState<ActivityLogWithActor[]>([]);
    const [olderDrained, setOlderDrained] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const { data: firstPage = [], isLoading } = useProjectActivity(projectId, { limit: PAGE_SIZE });

    // Concatenate first page + every subsequent page fetched via the `before`
    // cursor. Avoids the O(n²) "bump limit, refetch everything" pattern.
    const rows = useMemo(() => [...firstPage, ...olderPages], [firstPage, olderPages]);

    const visible = useMemo(
        () => (filter === 'all' ? rows : rows.filter((r) => r.entity_type === filter)),
        [rows, filter],
    );
    const groups = useMemo(() => groupByDay(visible), [visible]);

    const canLoadOlder = !olderDrained && firstPage.length >= PAGE_SIZE;

    const loadOlder = useCallback(async () => {
        if (!projectId || rows.length === 0) return;
        setIsLoadingOlder(true);
        try {
            const last = rows[rows.length - 1];
            const next = await planter.entities.ActivityLog.listByProject(projectId, {
                limit: PAGE_SIZE,
                before: last.created_at,
            });
            if (next.length === 0) {
                setOlderDrained(true);
            } else {
                setOlderPages((prev) => [...prev, ...next]);
                if (next.length < PAGE_SIZE) setOlderDrained(true);
            }
        } finally {
            setIsLoadingOlder(false);
        }
    }, [projectId, rows]);

    const emptyCopy =
        filter === 'all'
            ? 'No activity yet — create a task or invite a teammate to get started.'
            : 'No activity matches this filter.';

    return (
        <div className="detail-section" data-testid="project-activity-tab">
            <div className="flex flex-wrap gap-2 mb-4">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        data-testid={`activity-filter-${f.key}`}
                        data-active={filter === f.key ? 'true' : 'false'}
                        className={
                            filter === f.key
                                ? 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-brand-600 hover:bg-brand-700 text-white border-brand-600'
                                : 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                {isLoading ? (
                    <p className="text-sm text-slate-500" data-testid="activity-loading">
                        Loading activity…
                    </p>
                ) : visible.length === 0 ? (
                    <p className="text-sm text-slate-500" data-testid="activity-empty">
                        {emptyCopy}
                    </p>
                ) : (
                    <div className="space-y-6">
                        {groups.map((g) => (
                            <div key={g.day} data-testid={`activity-day-${g.day}`}>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    {g.day}
                                </h4>
                                <div className="divide-y divide-slate-100">
                                    {g.rows.map((r) => (
                                        <ActivityRow key={r.id} row={r} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {canLoadOlder && (
                    <div className="pt-4 border-t border-slate-100 mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={loadOlder}
                            disabled={isLoadingOlder}
                            data-testid="activity-load-older"
                        >
                            {isLoadingOlder ? 'Loading…' : 'Load older'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
