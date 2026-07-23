import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight,
    Calendar,
    ChevronDown,
    ChevronRight,
    MapPin,
    Sparkles,
    Users,
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { ProgressRing } from '@/shared/ui/progress-ring';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import { formatCalendarDate } from '@/shared/lib/date-engine';
import { PROJECT_STATUS } from '@/shared/constants/domain';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import { useProjectData } from '@/features/projects/hooks/useProjectData';
import { useProjectReports } from '@/features/projects/hooks/useProjectReports';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import {
    buildAttentionMilestones,
    type AttentionTone,
} from '@/features/projects/lib/home-attention';
import type { Project } from '@/shared/db/app.types';

const TONE_PILL: Record<AttentionTone, string> = {
    overdue: 'bg-rose-100 text-rose-700',
    due_soon: 'bg-orange-100 text-orange-700',
    neutral: 'bg-slate-100 text-slate-600',
};

export default function Home() {
    const { t } = useTranslation();
    const { tasks, joinedProjects } = useTaskQuery();

    // Switchable projects: the user's active instances plus projects shared with
    // them. Mirrors the sidebar's instance filter (exclude archived/complete).
    const projectOptions = useMemo(() => {
        const instances = tasks.filter(
            (p) => p.origin === 'instance' && p.status !== PROJECT_STATUS.ARCHIVED && !p.is_complete,
        );
        return [...instances, ...(joinedProjects as Project[])].map((p) => ({
            id: p.id,
            title: p.title,
        }));
    }, [tasks, joinedProjects]);

    const { currentProjectId, setCurrentProjectId } = useCurrentProject(projectOptions);

    const { project, phases, milestones, tasks: leafTasks, teamMembers, loadingProject } =
        useProjectData(currentProjectId);

    // `useProjectReports` expects the full descendant set minus the phase rows
    // (milestones + leaf tasks), matching how Reports.tsx feeds it.
    const reportTasks = useMemo(() => [...milestones, ...leafTasks], [milestones, leafTasks]);
    const { overallProgress, phaseData, milestones: reportMilestones } = useProjectReports(
        reportTasks,
        phases,
    );

    const attention = useMemo(
        () => buildAttentionMilestones(reportMilestones),
        [reportMilestones],
    );

    const activeOption = projectOptions.find((p) => p.id === currentProjectId);

    if (projectOptions.length === 0 && !loadingProject) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-16 text-center">
                <h1 className="text-xl font-semibold text-slate-900">{t('home.no_project_title')}</h1>
                <p className="mt-2 text-sm text-slate-600">{t('home.no_project_body')}</p>
                <Link
                    to="/tasks?action=new-project"
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                    {t('projects.new_project')}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        );
    }

    const launchDate = project?.due_date
        ? formatCalendarDate(project.due_date, 'MMM d, yyyy')
        : '—';

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" data-testid="home-page">
            {/* Project switcher */}
            <div className="mb-6 flex justify-end">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-card px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        data-testid="home-switch-project"
                    >
                        <span className="max-w-[220px] truncate">
                            {activeOption?.title || t('home.switch_project')}
                        </span>
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                        {projectOptions.map((p) => (
                            <DropdownMenuItem
                                key={p.id}
                                onClick={() => setCurrentProjectId(p.id)}
                                className={cn(
                                    'cursor-pointer truncate',
                                    p.id === currentProjectId && 'font-semibold text-brand-600',
                                )}
                            >
                                {p.title || t('home.switch_project')}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Hero: current project summary + progress + encouragement */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="p-6 lg:col-span-2">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                            <span className="inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                                {t('home.current_project_label')}
                            </span>
                            <h1 className="mt-3 text-2xl font-bold text-slate-900">
                                {project?.title || (loadingProject ? t('home.loading') : '—')}
                            </h1>
                            {project?.description && (
                                <p className="mt-1 max-w-xl text-sm text-slate-600">{project.description}</p>
                            )}

                            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                                <MetaChip icon={<Calendar className="h-4 w-4" />} label={t('home.target_launch')} value={launchDate} />
                                <MetaChip
                                    icon={<Users className="h-4 w-4" />}
                                    label={t('home.project_team')}
                                    value={t('home.team_users', { count: teamMembers.length })}
                                />
                                {project?.location && (
                                    <MetaChip icon={<MapPin className="h-4 w-4" />} label={t('home.location')} value={project.location} />
                                )}
                            </div>

                            <div className="mt-6 space-y-2">
                                <Link
                                    to={currentProjectId ? `/tasks?project=${currentProjectId}` : '/tasks'}
                                    className="flex w-full max-w-md items-center justify-between rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                                    data-testid="home-todays-tasks-cta"
                                >
                                    {t('home.todays_tasks_cta')}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link
                                    to="/tasks?view=my_tasks&project=all"
                                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                                    data-testid="home-my-tasks-link"
                                >
                                    {t('home.view_all_tasks')}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        </div>

                        {/* Progress donut */}
                        <div className="flex shrink-0 flex-col items-center">
                            <div className="relative h-40 w-40">
                                <ProgressRing
                                    value={overallProgress}
                                    size={160}
                                    strokeWidth={16}
                                    color="var(--color-brand-600, rgb(234 88 12))"
                                    trackColor="rgb(226 232 240)"
                                    decorative
                                />
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-bold text-slate-900">{overallProgress}%</span>
                                    <span className="text-sm text-slate-500">{t('home.complete')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="flex flex-col gap-4">
                    <EncouragementCard
                        icon={<Sparkles className="h-5 w-5 text-orange-500" />}
                        title={t('home.encourage_progress_title')}
                        body={t('home.encourage_progress_body')}
                        className="bg-white"
                    />
                    <EncouragementCard
                        icon={<Users className="h-5 w-5 text-orange-500" />}
                        title={t('home.encourage_people_title')}
                        body={t('home.encourage_people_body')}
                        className="bg-orange-50/60"
                    />
                </div>
            </div>

            {/* Phases + Milestones */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="p-6">
                    <h2 className="mb-5 text-lg font-semibold text-slate-900">{t('home.launch_phases')}</h2>
                    <div className="space-y-4" data-testid="home-launch-phases">
                        {phaseData.length === 0 ? (
                            <p className="text-sm text-slate-500">{t('home.loading')}</p>
                        ) : (
                            phaseData.map((phase, idx) => (
                                <Link
                                    key={phase.id}
                                    to={currentProjectId ? `/project/${currentProjectId}?phase=${phase.id}` : '/home'}
                                    className="group flex items-center gap-3 rounded-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                    data-testid={`home-phase-link-${phase.id}`}
                                >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                        {idx + 1}
                                    </span>
                                    <span
                                        className="w-40 shrink-0 truncate text-sm font-medium text-slate-700 group-hover:text-brand-700"
                                        data-testid="home-phase-name"
                                    >
                                        {phase.fullName}
                                    </span>
                                    <Progress value={phase.progress} className="h-2 flex-1 bg-slate-100" />
                                    <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-600">
                                        {phase.progress}%
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <h2 className="mb-5 text-lg font-semibold text-slate-900">
                        {t('home.milestones_attention')}
                    </h2>
                    <div className="divide-y divide-slate-100" data-testid="home-milestones-attention">
                        {attention.length === 0 ? (
                            <p className="py-2 text-sm text-slate-500">{t('home.no_milestones')}</p>
                        ) : (
                            attention.map((m) => (
                                <Link
                                    key={m.id}
                                    to={currentProjectId ? `/project/${currentProjectId}?task=${m.id}` : '/home'}
                                    aria-label={t('tasks.open_milestone_aria', { title: m.title })}
                                    className="group flex items-center justify-between gap-3 py-3 rounded-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                    data-testid={`home-milestone-link-${m.id}`}
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800 group-hover:text-brand-700">
                                            {m.title}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {m.diffDays < 0
                                                ? t('home.due_overdue')
                                                : m.diffDays === 0
                                                    ? t('home.due_today')
                                                    : t('home.due_in_days', { count: m.diffDays })}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span
                                            className={cn(
                                                'text-sm font-medium',
                                                m.tone === 'overdue' ? 'text-rose-600' : 'text-slate-500',
                                            )}
                                        >
                                            {formatCalendarDate(m.due_date, 'MMM d')}
                                        </span>
                                        <span
                                            className={cn(
                                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                                TONE_PILL[m.tone],
                                            )}
                                        >
                                            {t(`home.badge_${m.badgeKey}`)}
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-400" />
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function MetaChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 text-slate-600">
            <span className="text-slate-400">{icon}</span>
            <div className="leading-tight">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                <p className="text-sm font-semibold text-slate-800">{value}</p>
            </div>
        </div>
    );
}

function EncouragementCard({
    icon,
    title,
    body,
    className,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
    className?: string;
}) {
    return (
        <Card className={cn('flex gap-3 p-5', className)}>
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
        </Card>
    );
}
