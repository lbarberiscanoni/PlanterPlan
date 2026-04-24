import { Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { LayoutDashboard, BarChart3, Settings, HelpCircle, ChevronLeft, Calendar } from 'lucide-react';
import type { TaskRow } from '@/shared/db/app.types';

interface AppSidebarProps {
 onClose: () => void;
 currentProject: TaskRow | null;
 className?: string;
}

export default function AppSidebar({ onClose, currentProject, className }: AppSidebarProps) {
 const { t } = useTranslation();
 const location = useLocation();

 const navigationItems = useMemo(() => [
  {
   title: t('nav.section_main'),
   items: [
    { name: t('nav.project_dashboard'), icon: LayoutDashboard, path: 'Dashboard' },
    { name: t('nav.my_tasks'), icon: Calendar, path: 'tasks' },
    { name: t('nav.reports'), icon: BarChart3, path: 'Reports' },
   ],
  },
  {
   title: t('nav.section_tools'),
   items: [{ name: t('nav.settings'), icon: Settings, path: 'Settings' }],
  },
 ], [t]);

 return (
 <div className={cn('flex flex-col h-full bg-card border-r border-border', className)}>
 <div className="flex flex-col h-full">
 {/* Sidebar Header */}
 <div className="flex items-center justify-between p-4 border-b border-border lg:hidden user-select-none">
 <h2 className="font-semibold text-card-foreground">{t('nav.navigation_heading')}</h2>
 <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden text-muted-foreground">
 <ChevronLeft className="w-5 h-5" />
 </Button>
 </div>

 {/* Navigation */}
 <nav className="flex-1 overflow-y-auto p-4 space-y-6" data-testid="app-sidebar-nav">
 {navigationItems.map((section) => (
 <div key={section.title}>
 <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
 {section.title}
 </h3>
 <div className="space-y-1">
 {section.items.map((item) => {
 const Icon = item.icon;
 const active = location.pathname.includes(item.path.toLowerCase());

 return (
 <Link
 key={item.path}
 to={item.path.startsWith('/') ? item.path : `/${item.path}`}
 onClick={() => window.innerWidth < 1024 && onClose()}
 >
 <Button
 variant="ghost"
 className={cn(
 'w-full justify-start gap-3 transition-all',
 active
 ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 font-medium'
 : 'text-muted-foreground hover:text-card-foreground hover:bg-muted/50'
 )}
 >
 <Icon className="w-5 h-5" />
 <span>{item.name}</span>
 </Button>
 </Link>
 );
 })}
 </div>
 </div>
 ))}

 {/* Project Context */}
 {currentProject && (
 <div className="pt-4 border-t border-border">
 <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
 {t('nav.current_project_heading')}
 </h3>
 <div className="px-3 py-2 rounded-lg bg-muted/50">
 <p className="text-sm font-medium text-card-foreground truncate">{currentProject.title}</p>
 <Link to={`/Project/${currentProject.id}`}>
 <Button
 variant="link"
 size="sm"
 className="h-auto p-0 text-orange-600 hover:text-orange-700"
 >
 {t('nav.view_project')}
 </Button>
 </Link>
 </div>
 </div>
 )}
 </nav>

 {/* Help Section */}
 <div className="p-4 border-t border-border">
 <Button
 variant="ghost"
 className="w-full justify-start gap-3 text-muted-foreground hover:text-card-foreground hover:bg-muted/50"
 >
 <HelpCircle className="w-5 h-5" />
 <span>{t('nav.help_support')}</span>
 </Button>
 </div>
 </div>
 </div>
 );
}
