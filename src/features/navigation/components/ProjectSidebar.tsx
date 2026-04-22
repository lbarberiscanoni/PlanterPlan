import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/AuthContext';
import InstanceList from '@/features/projects/components/InstanceList';
import JoinedProjectsList from '@/features/projects/components/JoinedProjectsList';
import TemplateList from '@/features/library/components/TemplateList';
import { LayoutDashboard, BarChart, Settings, Calendar } from 'lucide-react';
import GlobalNavItem from './GlobalNavItem';

const SectionSkeleton = () => (
 <div className="animate-pulse space-y-3 py-2">
 <div className="h-8 bg-slate-100 rounded-md w-full"></div>
 <div className="h-8 bg-slate-100 rounded-md w-5/6"></div>
 </div>
);

interface ProjectSidebarProps {
 joinedProjects: Array<{ id: string; title?: string; membership_role?: string }>;
 instanceTasks: Array<{ id: string; title: string }>;
 templateTasks: Array<{ id: string; title?: string }>;
 joinedError?: string | null;
 handleSelectProject: (task: { id: string }) => void;
 selectedTaskId?: string | null;
 onNewProjectClick: () => void;
 onNewTemplateClick: () => void;
 projectsLoading?: boolean;
 joinedLoading?: boolean;
 templatesLoading?: boolean;
 error?: string | null;
 onNavClick?: () => void;
 hasMore?: boolean;
 isFetchingMore?: boolean;
 onLoadMore?: () => void;
}

const ProjectSidebar = ({
 joinedProjects,
 instanceTasks,
 templateTasks,
 joinedError,
 handleSelectProject,
 selectedTaskId,
 onNewProjectClick,
 onNewTemplateClick,
 projectsLoading = false,
 joinedLoading = false,
 templatesLoading = false,
 error = null,
 onNavClick,
 hasMore,
 isFetchingMore,
 onLoadMore,
}: ProjectSidebarProps) => {
 const { user, signOut } = useAuth();
 const location = useLocation();
 const navigate = useNavigate();
 const handleTaskClickWrapped = (task: { id: string }) => {
 handleSelectProject(task);
 if (onNavClick) onNavClick();
 };

 const handleNewProject = () => {
 onNewProjectClick();
 if (onNavClick) onNavClick();
 };

 const handleNewTemplate = () => {
 onNewTemplateClick();
 if (onNavClick) onNavClick();
 };

 const handleGlobalNav = (path: string) => {
 navigate(path);
 if (onNavClick) onNavClick();
 };

 const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

 return (
 <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border shadow-sm">
 <div className="px-4 py-4 space-y-1">
 <GlobalNavItem
 label="Project Dashboard"
 isActive={location.pathname === '/dashboard'}
 onClick={() => handleGlobalNav('/dashboard')}
 icon={<LayoutDashboard className="w-5 h-5" />}
 />
 <GlobalNavItem
 label="My Tasks"
 isActive={location.pathname === '/tasks'}
 onClick={() => handleGlobalNav('/tasks')}
 icon={<Calendar className="w-5 h-5" />}
 />
 <GlobalNavItem
 label="Reports"
 isActive={location.pathname === '/reports'}
 onClick={() => handleGlobalNav(selectedTaskId ? `/reports?project=${selectedTaskId}` : '/reports')}
 icon={<BarChart className="w-5 h-5" />}
 />
 <GlobalNavItem
 label="Settings"
 isActive={location.pathname === '/settings'}
 onClick={() => handleGlobalNav('/settings')}
 icon={<Settings className="w-5 h-5" />}
 />
 </div>

 <div className="h-px bg-border mx-4"></div>

 <div className="px-4 py-4 space-y-2 border-b border-border">
 <button
 onClick={handleNewProject}
 data-testid="sidebar-new-project-btn"
 className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
 >
 <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
 </svg>
 New Project
 </button>

 <button
 onClick={handleNewTemplate}
 data-testid="sidebar-new-template-btn"
 className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
 >
 <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
 </svg>
 New Template
 </button>
 </div>

 <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar" data-testid="project-switcher">
 {error && (
 <div className="p-3 mb-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
 {error}
 </div>
 )}

 {projectsLoading ? <SectionSkeleton /> : (
 <InstanceList
 tasks={instanceTasks}
 selectedTaskId={selectedTaskId}
 handleTaskClick={handleTaskClickWrapped}
 hasMore={hasMore}
 isFetchingMore={isFetchingMore}
 onLoadMore={onLoadMore}
 />
 )}

 <div className="h-px bg-border"></div>

 {joinedLoading ? <SectionSkeleton /> : (
 <JoinedProjectsList
 projects={joinedProjects}
 error={joinedError}
 handleTaskClick={handleTaskClickWrapped}
 selectedTaskId={selectedTaskId}
 />
 )}

 <div className="h-px bg-border"></div>

 {templatesLoading ? <SectionSkeleton /> : (
 <TemplateList
 tasks={templateTasks}
 selectedTaskId={selectedTaskId}
 handleTaskClick={handleTaskClickWrapped}
 />
 )}
 </div>

 <div className="border-t border-border p-4 bg-muted/20">
 <div className="flex items-center gap-3">
 <div className="h-8 w-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold border border-brand-200">
 {userInitial}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-card-foreground truncate">
 {user?.email || 'Unknown User'}
 </p>
 <button
 onClick={signOut}
 className="text-xs text-muted-foreground hover:text-rose-600 hover:underline transition-colors flex items-center mt-0.5"
 >
 Sign Out
 </button>
 </div>
 </div>
 </div>
 </div>
 );
};

export default ProjectSidebar;
