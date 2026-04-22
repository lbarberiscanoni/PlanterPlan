import { Link, useNavigate } from 'react-router-dom';
import { planter } from '@/shared/api/planterClient';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { ArrowLeft, Loader2, BarChart, TrendingUp, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { toMonthKey } from '@/shared/lib/date-engine';
import { useAuth } from '@/shared/contexts/AuthContext';
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
    Legend,
} from 'recharts';

import { useProjectReports } from '@/features/projects/hooks/useProjectReports';
import type { TaskRow } from '@/shared/db/app.types';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function Reports() {
    const { t } = useTranslation();
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const navigate = useNavigate();
    const { user } = useAuth();

    const { data: project } = useQuery({
        queryKey: ['reportProject', projectId],
        queryFn: () => planter.entities.Project.filter({ id: projectId }).then((res: TaskRow[]) => res[0]),
        enabled: !!projectId,
    });

    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects', user?.id],
        queryFn: async () => planter.entities.Project.filter({}),
        enabled: !!user,
    });

    const { data: allTasks = [], isLoading } = useQuery<TaskRow[]>({
        queryKey: ['tasks', projectId],
        queryFn: () => planter.entities.Task.filter({ root_id: projectId }),
        enabled: !!projectId,
    });

    const phases = allTasks.filter((t) => t.parent_task_id === projectId);
    const tasks = allTasks.filter((t) => t.parent_task_id !== projectId);

    const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthKey(new Date()));

    const {
        statsConfig,
        overallProgress,
        completedTasks,
        totalTasks,
        phaseData,
        taskDistribution,
        completedThisMonth,
        overdueMilestones,
        upcomingThisMonth,
    } = useProjectReports(tasks, phases, { selectedMonth });

    if (isLoading) {
        return (
            <>
                <div className="flex justify-center py-20">
                    <Loader2 data-testid="loading-spinner" className="w-8 h-8 animate-spin text-orange-500" />
                </div>
            </>
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
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                                {statsConfig.map((stat, index) => (
                                    <motion.div
                                        key={stat.label}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <Card className={`p-6 border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-all duration-300 group hover:${stat.borderClass}`}>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                                </div>
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${stat.bgClass} group-hover:${stat.hoverBgClass}`}>
                                                    <stat.icon className={`w-6 h-6 transition-colors ${stat.textClass} group-hover:text-white`} />
                                                </div>
                                            </div>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                            >
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
                            </motion.div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                                    <h2 className="text-lg font-semibold text-foreground mb-4">{t('projects.reports.task_distribution_heading')}</h2>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={taskDistribution}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {taskDistribution.map((_entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-semibold text-foreground">{t('projects.reports.monthly_breakdown')}</h2>
                                        <label className="flex items-center gap-2 text-sm">
                                            <span className="text-muted-foreground">{t('projects.reports.month_label')}</span>
                                            <input
                                                type="month"
                                                value={selectedMonth}
                                                onChange={(e) => setSelectedMonth(e.target.value || toMonthKey(new Date()))}
                                                className="px-2 py-1 rounded-md border border-border bg-card text-sm"
                                                aria-label={t('projects.reports.month_aria')}
                                            />
                                        </label>
                                    </div>
                                    <div className="space-y-5 max-h-80 overflow-y-auto pr-1">
                                        <MilestoneList
                                            heading={t('projects.reports.completed_this_month')}
                                            icon={CheckCircle2}
                                            accent="text-green-600"
                                            emptyText={t('projects.reports.none_completed')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            items={completedThisMonth}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                        <MilestoneList
                                            heading={t('projects.reports.overdue_heading')}
                                            icon={AlertTriangle}
                                            accent="text-red-600"
                                            emptyText={t('projects.reports.none_overdue')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            items={overdueMilestones}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                        <MilestoneList
                                            heading={t('projects.reports.upcoming_this_month')}
                                            icon={Clock}
                                            accent="text-orange-600"
                                            emptyText={t('projects.reports.none_upcoming')}
                                            noDueDateLabel={t('projects.reports.no_due_date')}
                                            items={upcomingThisMonth}
                                            onItemClick={() => navigate(`/Project/${projectId}`)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 }}
                                className="mt-8"
                            >
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
                            </motion.div>
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
    progress: number;
}

interface MilestoneListProps {
    heading: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    emptyText: string;
    noDueDateLabel: string;
    items: MilestoneListItem[];
    onItemClick: () => void;
}

function MilestoneList({ heading, icon: Icon, accent, emptyText, noDueDateLabel, items, onItemClick }: MilestoneListProps) {
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
                            className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all"
                        >
                            <div className="min-w-0 flex-1">
                                <h4 className="font-medium text-foreground truncate text-sm">{m.title}</h4>
                                <p className="text-xs text-muted-foreground mt-1">{m.due_date || noDueDateLabel}</p>
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
