import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { formatDate } from '@/shared/lib/date-engine';
import {
    ArrowLeft,
    Calendar,
    Users,
    BarChart2,
    Rocket,
    Building2,
    GitBranch,
    Settings,
    Download,
    Search,
} from 'lucide-react';
import { TASK_STATUS, PROJECT_STATUS } from '@/shared/constants';
import EditProjectModal from './EditProjectModal';
import { exportProjectToCSV } from '@/features/projects/lib/export-utils';
import { Project, TaskRow, PersonRow } from '@/shared/db/app.types';

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    launch_large: Rocket,
    multisite: Building2,
    multiplication: GitBranch,
};

const statusColors: Record<string, string> = {
    [PROJECT_STATUS.PLANNING]: 'bg-indigo-100 text-indigo-700',
    [PROJECT_STATUS.IN_PROGRESS]: 'bg-brand-100 text-brand-700',
    [PROJECT_STATUS.LAUNCHED]: 'bg-emerald-100 text-emerald-700',
    [PROJECT_STATUS.PAUSED]: 'bg-slate-100 text-slate-700',
};

export interface ProjectHeaderProps {
    project: Project;
    tasks?: TaskRow[];
    teamMembers?: PersonRow[];
    onInviteMember?: () => void;
    canInvite?: boolean;
    canManageSettings?: boolean;
}

export default function ProjectHeader({
    project,
    tasks = [],
    teamMembers = [],
    onInviteMember,
    canInvite = false,
    canManageSettings = false
}: ProjectHeaderProps) {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const Icon = templateIcons[(project as Record<string, unknown>).template as string] || Rocket;
    const completedTasks = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
        <div className="animate-slide-up bg-card border-b border-border transition-all shadow-sm">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/dashboard">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-4 flex-1">
                        <div className="w-14 h-14 bg-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/20">
                            <Icon className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-card-foreground">{project.title}</h1>
                                <Badge className={statusColors[project.status || ''] || statusColors[PROJECT_STATUS.PLANNING]}>
                                    {project.status?.replace('_', ' ')}
                                </Badge>
                            </div>
                            {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
                            <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                            <span className="lg:hidden">Search</span>
                            <span className="hidden lg:inline text-muted-foreground text-xs">⌘K</span>
                        </Button>
                        {canManageSettings && (
                            <Button variant="ghost" size="sm" onClick={() => setIsEditModalOpen(true)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Settings
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => exportProjectToCSV({ name: project.title || 'Project' }, tasks as TaskRow[])}>
                            <Download className="w-4 h-4 mr-2" />
                            Export
                        </Button>
                        <Link to={`/reports?project=${project.id}`}>
                            <Button variant="outline" size="sm">
                                <BarChart2 className="w-4 h-4 mr-2" />
                                Reports
                            </Button>
                        </Link>
                        <Link to={`/team?project=${project.id}`}>
                            <Button variant="outline" size="sm">
                                <Users className="w-4 h-4 mr-2" />
                                Team
                            </Button>
                        </Link>
                        {canInvite && (
                            <Button variant="default" size="sm" onClick={onInviteMember} className="ml-2 bg-brand-500 hover:bg-brand-600 text-white">
                                <Users className="w-4 h-4 mr-2" />
                                Invite
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                        {project.due_date && (
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <span>Launch: {formatDate(project.due_date, 'MMM d, yyyy')}</span>
                            </div>
                        )}
                        <Users className="w-4 h-4 text-slate-400" />
                        <span>
                            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Static Avatars */}
                    <div className="flex items-center -space-x-2 overflow-hidden py-1 pl-1">
                        {teamMembers.slice(0, 5).map(member => {
                            const displayName = member.first_name ? `${member.first_name} ${member.last_name}` : member.email;
                            const initials = (member.first_name?.[0] || '') + (member.last_name?.[0] || '') || '?';
                            return (
                                <div key={member.id} className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground z-10" title={displayName || 'Unknown'}>
                                    {(member as { avatar_url?: string }).avatar_url ? (
                                        <img src={(member as { avatar_url?: string }).avatar_url} alt={displayName || 'Unknown'} width={32} height={32} loading="lazy" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <span>{initials}</span>
                                    )}
                                </div>
                            );
                        })}
                        {teamMembers.length > 5 && (
                            <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-slate-100 text-xs font-medium text-slate-500 z-0">
                                +{teamMembers.length - 5}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <ProgressRing
                            value={progress}
                            size={48}
                            strokeWidth={8}
                            color={totalTasks === 0 ? '#e2e8f0' : '#10b981'}
                            trackColor="#e2e8f0"
                            decorative
                        />
                        <span className="text-sm font-medium text-card-foreground whitespace-nowrap">
                            {progress}% complete
                        </span>
                    </div>
                </div>
            </div>

            {isEditModalOpen && (
                <EditProjectModal
                    project={project}
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
        </div>
    );
}


