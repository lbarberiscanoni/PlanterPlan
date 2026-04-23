import { memo, type MouseEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { TASK_STATUS } from '@/shared/constants';
import RoleIndicator from '@/shared/ui/RoleIndicator';

interface SidebarTask {
 id: string;
 title: string;
 status?: string;
 membership_role?: string;
}

interface SidebarNavItemProps {
 task: SidebarTask;
 isSelected?: boolean;
 onClick?: (task: SidebarTask) => void;
 showRole?: boolean;
 to?: string;
}

const SidebarNavItem = ({ task, isSelected, onClick, showRole = false, to }: SidebarNavItemProps) => {
 const handleClick = (): void => {
 if (onClick) {
 onClick(task);
 }
 };

 const statusClass = task.status ? `status-dot ${task.status}` : `status-dot ${TASK_STATUS.TODO}`;
 const commonClasses = `sidebar-nav-item group flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 cursor-pointer ${isSelected
 ? 'bg-orange-50 border-l-4 border-l-orange-500 text-slate-900 font-semibold shadow-sm'
 : 'text-muted-foreground hover:bg-orange-50/50 hover:text-slate-900'
 }`;

 const content = (
 <>
 <div className={statusClass}></div>
 <div className="flex-1 min-w-0 flex items-center justify-between">
 <span className="sidebar-nav-item-title truncate">{task.title}</span>
 <div className="flex items-center">
 <button
 type="button"
 className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-muted rounded text-muted-foreground hover:text-brand-600 transition-all mr-2"
 onClick={(e: MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 }}
 aria-label={`Clone template: ${task.title ?? 'untitled'}`}
 title="Clone Template"
 >
 <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 01-2-2V5a2 2 0 012-2h4.586"
 />
 </svg>
 </button>

 {showRole && task.membership_role && (
 <div className="flex-shrink-0">
 <RoleIndicator role={task.membership_role} />
 </div>
 )}
 </div>
 </div>
 </>
 );

 if (to) {
 return (
 <Link
 to={to}
 className={commonClasses}
 onClick={handleClick}
 title={task.title}
 aria-current={isSelected ? 'page' : undefined}
 >
 {content}
 </Link>
 );
 }

 return (
 <div
 className={commonClasses}
 onClick={(e: MouseEvent) => {
 e.preventDefault();
 handleClick();
 }}
 role="button"
 tabIndex={0}
 onKeyDown={(e: KeyboardEvent) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleClick();
 }
 }}
 title={task.title}
 >
 {content}
 </div>
 );
};

export default memo(SidebarNavItem);
