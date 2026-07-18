import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/contexts/auth-context';
import SharedTemplatesList from './SharedTemplatesList';
import TemplateList from './TemplateList';
import { BarChart, Settings, Calendar, ShieldAlert, Library, Home } from 'lucide-react';
import GlobalNavItem from './GlobalNavItem';
import { useIsAdmin } from '@/features/admin/hooks/useIsAdmin';

const SectionSkeleton = () => (
 <div className="animate-pulse space-y-3 py-2">
 <div className="h-8 bg-slate-100 rounded-md w-full"></div>
 <div className="h-8 bg-slate-100 rounded-md w-5/6"></div>
 </div>
);

interface ProjectSidebarProps {
 templateTasks: Array<{ id: string; title?: string }>;
 sharedTemplates: Array<{ id: string; title?: string; membership_role?: string }>;
 handleSelectProject: (task: { id: string }) => void;
 selectedTaskId?: string | null;
 onNewTemplateClick: () => void;
 templatesLoading?: boolean;
 sharedTemplatesLoading?: boolean;
 error?: string | null;
 onNavClick?: () => void;
}

const ProjectSidebar = ({
 templateTasks,
 sharedTemplates,
 handleSelectProject,
 selectedTaskId,
 onNewTemplateClick,
 templatesLoading = false,
 sharedTemplatesLoading = false,
 error = null,
 onNavClick,
}: ProjectSidebarProps) => {
 const { t } = useTranslation();
 const { user, signOut } = useAuth();
 const isAdmin = useIsAdmin();
 const location = useLocation();
 const navigate = useNavigate();
 const handleTaskClickWrapped = (task: { id: string }) => {
 handleSelectProject(task);
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
 label={t('nav.home')}
 isActive={location.pathname === '/home'}
 onClick={() => handleGlobalNav('/home')}
 icon={<Home className="w-5 h-5" />}
 />
 <GlobalNavItem
 label={t('nav.todays_tasks')}
 isActive={location.pathname === '/tasks'}
 onClick={() => handleGlobalNav('/tasks')}
 icon={<Calendar className="w-5 h-5" />}
 />
 <GlobalNavItem
 label={t('nav.reports')}
 isActive={location.pathname === '/reports'}
 onClick={() => handleGlobalNav(selectedTaskId ? `/reports?project=${selectedTaskId}` : '/reports')}
 icon={<BarChart className="w-5 h-5" />}
 />
 <GlobalNavItem
 label={t('nav.resources')}
 isActive={location.pathname === '/resources'}
 onClick={() => handleGlobalNav('/resources')}
 icon={<Library className="w-5 h-5" />}
 />
 <GlobalNavItem
 label={t('nav.settings')}
 isActive={location.pathname === '/settings'}
 onClick={() => handleGlobalNav('/settings')}
 icon={<Settings className="w-5 h-5" />}
 />
 {isAdmin && (
 <GlobalNavItem
 label={t('nav.admin')}
 isActive={location.pathname.startsWith('/admin')}
 onClick={() => handleGlobalNav('/admin')}
 icon={<ShieldAlert className="w-5 h-5" />}
 />
 )}
 </div>

 {/* Template authoring is admin-only (P4P staff). Planters start
 projects from templates via the create-project picker, but never
 create or manage templates themselves. */}
 {isAdmin && (
 <>
 <div className="h-px bg-border mx-4"></div>
 <div className="px-4 py-4 space-y-2 border-b border-border">
 <button
 onClick={handleNewTemplate}
 data-testid="sidebar-new-template-btn"
 className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
 >
 <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
 </svg>
 {t('library.new_template')}
 </button>
 </div>
 </>
 )}

 <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar" data-testid="project-switcher">
 {error && (
 <div className="p-3 mb-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
 {error}
 </div>
 )}

 {/* Template libraries are admin-only — planters manage projects,
 not the template catalog. */}
 {isAdmin && (
 <>
 <div className="h-px bg-border"></div>

 {templatesLoading ? <SectionSkeleton /> : (
 <TemplateList
 tasks={templateTasks}
 selectedTaskId={selectedTaskId}
 handleTaskClick={handleTaskClickWrapped}
 />
 )}

 <div className="h-px bg-border"></div>

 {sharedTemplatesLoading ? <SectionSkeleton /> : (
 <SharedTemplatesList
 templates={sharedTemplates}
 handleTaskClick={handleTaskClickWrapped}
 selectedTaskId={selectedTaskId}
 />
 )}
 </>
 )}
 </div>

 <div className="border-t border-border p-4 bg-muted/20">
 <div className="flex items-center gap-3">
 <div className="h-8 w-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold border border-brand-200">
 {userInitial}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-card-foreground truncate">
 {user?.email || t('nav.user_fallback')}
 </p>
 <button
 onClick={signOut}
 className="text-xs text-muted-foreground hover:text-rose-600 hover:underline transition-colors flex items-center mt-0.5"
 >
 {t('nav.logout')}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
};

export default ProjectSidebar;
