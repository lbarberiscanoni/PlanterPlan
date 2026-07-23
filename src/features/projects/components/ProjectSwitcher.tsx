import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FolderOpen, Archive, CheckCircle2, Plus } from 'lucide-react';
import {
 DropdownMenu,
 DropdownMenuTrigger,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu';
import { Button } from '@/shared/ui/button';
import { PROJECT_STATUS } from '@/shared/constants/domain';

export interface ProjectSwitcherProject {
 id: string;
 title?: string | null;
 origin?: string | null;
 status?: string | null;
 is_complete?: boolean | null;
}

const isArchived = (p: ProjectSwitcherProject) => p.status === PROJECT_STATUS.ARCHIVED;
const isCompleted = (p: ProjectSwitcherProject) => !isArchived(p) && p.is_complete === true;
const isActive = (p: ProjectSwitcherProject) => !isArchived(p) && !p.is_complete;

interface ProjectSwitcherProps {
 projects?: ProjectSwitcherProject[];
 projectsLoading?: boolean;
 /** The persisted focus project — used to label the trigger when the route
  * isn't a /project/:id page, so the switcher reflects the current project
  * everywhere (Home, Tasks, Reports), not just on the project detail view. */
 currentProjectId?: string | null;
 /** Persist the chosen project as the global focus (localStorage-backed). */
 onSelectProject?: (id: string) => void;
}

const ProjectSwitcher = ({
 projects = [],
 projectsLoading = false,
 currentProjectId = null,
 onSelectProject,
}: ProjectSwitcherProps) => {
 const { t } = useTranslation();
 const navigate = useNavigate();
 const { projectId } = useParams<{ projectId: string }>();
 const [showArchived, setShowArchived] = useState(false);
 // Wave 25: independent "Show completed" toggle mirroring the archived pattern.
 const [showCompleted, setShowCompleted] = useState(false);

 const instanceProjects = useMemo(
 () => projects.filter((t) => t.origin === 'instance'),
 [projects]
 );

 const activeProjects = useMemo(
 () => instanceProjects.filter(isActive),
 [instanceProjects]
 );

 // Wave 25: completed projects are active (not archived) AND is_complete = true.
 // A project that is both archived and completed is NOT listed here — it
 // requires both toggles to be visible.
 const completedProjects = useMemo(
 () => instanceProjects.filter(isCompleted),
 [instanceProjects]
 );

 const archivedProjects = useMemo(
 () => instanceProjects.filter(isArchived),
 [instanceProjects]
 );

 // Label from the route's project when on /project/:id, otherwise from the
 // persisted focus project — so the trigger names the current project on every
 // page rather than falling back to "Switch Project" off the detail view.
 const activeId = projectId ?? currentProjectId ?? null;
 const selected = activeId ? instanceProjects.find((p) => p.id === activeId) || null : null;
 const triggerLabel = selected?.title || (projectsLoading ? 'Loading…' : 'Switch Project');

 const handleSelect = (id: string) => {
 onSelectProject?.(id);
 navigate(`/project/${id}`);
 };

 return (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 data-testid="project-switcher-trigger"
 className="gap-2 max-w-xs justify-between bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
 >
 <span className="flex items-center gap-2 truncate">
 <FolderOpen className="w-4 h-4 text-brand-600" />
 <span className="truncate">{triggerLabel}</span>
 </span>
 <ChevronDown className="w-4 h-4 text-slate-400" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="start" className="w-72" data-testid="project-switcher-menu">
 <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-500">
 Active Projects
 </DropdownMenuLabel>
 {activeProjects.length === 0 ? (
 <div className="px-3 py-2 text-sm text-slate-500">No active projects.</div>
 ) : (
 activeProjects.map((p) => (
 <DropdownMenuItem
 key={p.id}
 onSelect={() => handleSelect(p.id)}
 data-testid={`project-switcher-item-${p.id}`}
 className="cursor-pointer"
 >
 <span className="truncate">{p.title}</span>
 </DropdownMenuItem>
 ))
 )}
 <DropdownMenuSeparator />
 <DropdownMenuItem
 onSelect={() => navigate('/tasks?action=new-project')}
 data-testid="project-switcher-new-project"
 className="cursor-pointer font-medium text-brand-700"
 >
 <Plus className="w-4 h-4" />
 {t('projects.new_project')}
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <button
 type="button"
 onClick={() => setShowArchived((v) => !v)}
 data-testid="project-switcher-toggle-archived"
 className="flex items-center w-full gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-sm"
 >
 <Archive className="w-4 h-4" />
 {showArchived ? 'Hide archived' : 'Show archived'}
 <span className="ml-auto text-xs text-slate-400">{archivedProjects.length}</span>
 </button>
 {showArchived && (
 <div data-testid="project-switcher-archived-list">
 {archivedProjects.length === 0 ? (
 <div className="px-3 py-2 text-sm text-slate-500">No archived projects.</div>
 ) : (
 archivedProjects.map((p) => (
 <DropdownMenuItem
 key={p.id}
 onSelect={() => handleSelect(p.id)}
 data-testid={`project-switcher-archived-${p.id}`}
 className="cursor-pointer text-slate-500"
 >
 <span className="truncate">{p.title}</span>
 </DropdownMenuItem>
 ))
 )}
 </div>
 )}
 <button
 type="button"
 onClick={() => setShowCompleted((v) => !v)}
 data-testid="project-switcher-toggle-completed"
 className="flex items-center w-full gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-sm"
 >
 <CheckCircle2 className="w-4 h-4" />
 {showCompleted ? 'Hide completed' : 'Show completed'}
 <span className="ml-auto text-xs text-slate-400">{completedProjects.length}</span>
 </button>
 {showCompleted && (
 <div data-testid="project-switcher-completed-list">
 {completedProjects.length === 0 ? (
 <div className="px-3 py-2 text-sm text-slate-500">No completed projects.</div>
 ) : (
 completedProjects.map((p) => (
 <DropdownMenuItem
 key={p.id}
 onSelect={() => handleSelect(p.id)}
 data-testid={`project-switcher-completed-${p.id}`}
 className="cursor-pointer text-slate-500"
 >
 <span className="truncate">{p.title}</span>
 </DropdownMenuItem>
 ))
 )}
 </div>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 );
};

export default ProjectSwitcher;
