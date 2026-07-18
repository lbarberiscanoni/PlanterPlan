import { Link, useNavigate } from 'react-router-dom';
import { planter } from '@/shared/api/planterClient';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { ArrowLeft, Loader2, BarChart, TrendingUp, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { STALE_TIMES } from '@/shared/lib/react-query-config';
import { getNow, toMonthKey } from '@/shared/lib/date-engine';
import { formatDateLocalized } from '@/shared/i18n/formatters';
import { useAuth } from '@/shared/contexts/auth-context';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';

import {
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';

import { useProjectReports } from '@/features/projects/hooks/useProjectReports';
import { track } from '@/shared/analytics/posthog';
import type { TaskRow } from '@/shared/db/app.types';

const STATUS_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444'];
const STATUS_TRANSLATION_KEYS = {
    completed: 'projects.reports.status_completed',
    in_progress: 'projects.reports.status_in_progress',
    not_started: 'projects.reports.status_not_started',
    blocked: 'projects.reports.status_blocked',
} as const;

export default function Reports() {
    const { t } = useTranslation();
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const navigate = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
        if (projectId) track('report_viewed', { project_id: projectId });
    }, [projectId]);

    const { data: project } = useQuery({
        queryKey: ['reportProject', projectId],
        queryFn: () => planter.entities.Project.filter({ id: projectId }).then((res: TaskRow[]) => res[0]),
        enabled: !!projectId,
        staleTime: STALE_TIMES.medium,
    });

    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects', user?.id],
        queryFn: async () => planter.entities.Project.filter({}),
        enabled: !!user,
        staleTime: STALE_TIMES.medium,
    });

    // Share the `['projectHierarchy', projectId]` cache key with the rest of
    // the app so task mutations performed elsewhere (Project.tsx, TaskList)
    // invalidate this report view too. Prior key `['tasks', projectId]` was
    // orphaned — reports showed stale data after any task edit until the
    // user hard-reloaded.
    const { data: allTasks = [], isLoading, isError, error, refetch } = useQuery<TaskRow[]>({
        queryKey: ['projectHierarchy', projectId],
        queryFn: () => planter.entities.Task.filter({ root_id: projectId }),
        enabled: !!projectId,
        staleTime: STALE_TIMES.medium,
    });

    const phases = allTasks.filter((t) => t.parent_task_id === projectId);
    const tasks = allTasks.filter((t) => t.parent_task_id !== projectId);

    const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthKey(getNow()));

    const {
        overallProgress,
        completedTasks,
        totalTasks,
        phaseData,
        taskDistribution,
        completedThisMonth,
        overdueMilestones,
        upcomingThisMonth,
    } = useProjectReports(tasks, phases, { selectedMonth });
    const localizedTaskDistribution = taskDistribution.map((entry) => ({
        ...entry,
        name: t(STATUS_TRANSLATION_KEYS[entry.key]),
    }));

    if (isLoading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 data-testid="loading-spinner" className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                <p className="text-destructive font-medium">{t('errors.failed_load_reports')}</p>
                <p className="text-muted-foreground text-sm max-w-md">
                    {(error as Error)?.message ?? t('errors.unknown')}
                </p>
                <Button variant="outline" onClick={() => refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-slate-50">
                <div className="bg-white border-b border-slate-200 shadow-sm">
                    <div className="max-w-6xl mx-auto px-4 py-8">
                        <div className="flex items-center gap-4">
                            <Link to={`/Project/${projectId}`}>
                                <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                                    {t('projects.reports.title')}
                                </h1>
                                {project && <p className="text-slate-600 mt-1">{project.title}</p>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-4 py-8">
                    {!projectId ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                                <BarChart className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">{t('projects.reports.select_project')}</h3>
                            <p className="text-slate-500 max-w-sm text-center mb-6">
                                {t('projects.reports.select_project_description')}
                            </p>

                            <div className="w-full max-w-sm">
                                <Select
                                    onValueChange={(value) => {
                                        navigate(`/reports?project=${value}`);
                                    }}
                                >
                                    <SelectTrigger className="w-full bg-white">
                                        <SelectValue placeholder={t('projects.reports.select_placeholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allProjects.map((p: TaskRow) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.title}
                                            </SelectItem>
                                        ))}
                                        {allProjects.length === 0 && (
                                            <SelectItem value="none" disabled>
                                                {t('projects.reports.no_projects_available')}
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="animate-slide-up">
                                <Card className="p-8 mb-10 border border-slate-200 bg-slate-50/50 shadow-md hover:shadow-xl transition-all duration-300">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-xl font-bold text-foreground">{t('projects.reports.overall_progress')}</h3>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {t('projects.reports.tasks_completed_label', { completed: completedTasks, total: totalTasks })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 px-4 py-2 bg-green-50 rounded-xl border border-green-200">
                                            <TrendingUp className="w-5 h-5 text-green-600" />
                                            <span className="text-2xl font-bold text-green-700">{overallProgress}%</span>
                                        </div>
                                    </div>
                                    <Progress value={overallProgress} className="h-3 bg-border" />
                                </Card>
                            </div>

                            <div className="animate-slide-up">
                                <div className="bg-card rounded-xl shadow-sm border border-border p-6" data-testid="report-task-status-chart">
                                    <h2 className="text-lg font-semibold text-foreground mb-4">{t('projects.reports.task_distribution_heading')}</h2>
                                    <div className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem] items-center gap-6">
                                        <div className="h-64 min-w-0">
                                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                                <PieChart>
                                                    <Pie
                                                        data={localizedTaskDistribution}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={90}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                    >
                                                        {localizedTaskDistribution.map((_entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[index]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <ul className="space-y-3" data-testid="report-task-status-legend">
                                            {localizedTaskDistribution.map((entry, index) => (
                                                <li
                                                    key={entry.key}
                                                    className="flex items-center gap-3"
                                                    data-testid={`report-task-status-${entry.key}`}
                                                >
                                                    <span
                                                        className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold text-white"
                                                        style={{ backgroundColor: STATUS_COLORS[index] }}
                                                    >
                                                        {entry.value}
                                                    </span>
                                                    <span className="text-sm font-medium text-foreground">{entry.name}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="animate-slide-up mt-8">
                                <Card className="p-8 border border-border bg-card shadow-lg">
                                    <h3 className="text-xl font-bold text-foreground mb-8">{t('projects.reports.phase_details_heading')}</h3>
                                    <div className="space-y-6">
                                        {phaseData.map((phase) => (
                                            <div
                                                key={phase.id}
                                                onClick={() => navigate(`/Project/${projectId}`)}
                                                className="p-4 rounded-xl border border-border cursor-pointer hover:border-orange-200 hover:bg-accent transition-all duration-300"
                                            >
                                                <div className="flex items-center gap-4 mb-3">
                                                    <div className="w-24 text-sm font-semibold text-foreground">{phase.name}</div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-foreground mb-2">{phase.fullName}</p>
                                                        <div className="flex items-center gap-3">
                                                            <Progress value={phase.progress} className="h-2.5 flex-1 bg-border" />
                                                            <span className="text-sm font-bold text-orange-600 w-14 text-right">
                                                                {phase.progress}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground ml-28">
                                                    {t('projects.reports.milestones_completed_label', { completed: phase.completed, total: phase.total })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>

                            <div className="animate-slide-up mt-8" data-testid="report-milestone-details">
                                <Card className="p-8 border border-border bg-card shadow-lg">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                                        <h3 className="text-xl font-bold text-foreground">{t('projects.reports.milestone_details_heading')}</h3>
                                        <label className="flex items-center gap-2 text-sm">
                                            <span className="text-muted-foreground">{t('projects.reports.month_label')}</span>
                                            <input
                                                type="month"
                                                value={selectedMonth}
                                                onChange={(e) => setSelectedMonth(e.target.value || toMonthKey(getNow()))}
                                                className="px-2 py-1 rounded-md border border-border bg-card text-sm"
                                                aria-label={t('projects.reports.month_aria')}
                                            />
                                        </label>
                                    </div>
                                    <div className="space-y-8" data-testid="report-milestone-details-sections">
                                        <MilestoneList
                                            heading={t('projects.reports.completed_this_month')}
                                            icon={CheckCircle2}
                                            accent="text-green-600"
                                            emptyText={t('projects.reports.none_completed')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            notesLabel={t('projects.reports.notes_label')}
                                            items={completedThisMonth}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                        <MilestoneList
                                            heading={t('projects.reports.overdue_heading')}
                                            icon={AlertTriangle}
                                            accent="text-red-600"
                                            emptyText={t('projects.reports.none_overdue')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            notesLabel={t('projects.reports.notes_label')}
                                            items={overdueMilestones}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                        <MilestoneList
                                            heading={t('projects.reports.upcoming_this_month')}
                                            icon={Clock}
                                            accent="text-orange-600"
                                            emptyText={t('projects.reports.none_upcoming')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            notesLabel={t('projects.reports.notes_label')}
                                            items={upcomingThisMonth}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                    </div>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

interface MilestoneListItem {
    id: string;
    title: string | null;
    due_date: string | null;
    notes: string | null;
    progress: number;
}

interface MilestoneListProps {
    heading: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    emptyText: string;
    noDueDateLabel: string;
    notesLabel: string;
    items: MilestoneListItem[];
    onItemClick: () => void;
}

function MilestoneList({ heading, icon: Icon, accent, emptyText, noDueDateLabel, notesLabel, items, onItemClick }: MilestoneListProps) {
    return (
        <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                <Icon className={`w-4 h-4 ${accent}`} />
                {heading}
                <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-6">{emptyText}</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((m) => (
                        <li
                            key={m.id}
                            onClick={onItemClick}
                            data-testid={`report-milestone-${m.id}`}
                            className="flex flex-col gap-3 p-4 bg-muted rounded-lg border border-border cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="min-w-0 flex-1">
                                <h4 className="font-medium text-foreground text-sm">{m.title}</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {m.due_date ? formatDateLocalized(m.due_date, 'short') : noDueDateLabel}
                                </p>
                                {m.notes?.trim() && (
                                    <div
                                        className="mt-3 border-l-2 border-brand-300 pl-3 text-sm text-muted-foreground"
                                        data-testid={`report-milestone-notes-${m.id}`}
                                    >
                                        <span className="font-semibold text-foreground">{notesLabel}</span>{' '}
                                        <span className="whitespace-pre-wrap">{m.notes.trim()}</span>
                                    </div>
                                )}
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 ml-4 flex-shrink-0">
                                {m.progress}%
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
