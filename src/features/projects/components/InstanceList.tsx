import { FolderPlus } from 'lucide-react';
import { PROJECT_STATUS_COLORS } from '@/shared/constants/colors';
import { PROJECT_STATUS } from '@/shared/constants';
import type { KeyboardEvent, MouseEvent } from 'react';

interface InstanceTask {
 id: string;
 title: string;
 status?: string;
 [key: string]: unknown;
}

interface InstanceListProps {
 tasks: InstanceTask[];
 selectedTaskId?: string | null;
 handleTaskClick: (task: InstanceTask) => void;
 hasMore?: boolean;
 isFetchingMore?: boolean;
 onLoadMore?: () => void;
}

const InstanceList = ({
 tasks,
 selectedTaskId,
 handleTaskClick,
 hasMore,
 isFetchingMore,
 onLoadMore,
}: InstanceListProps) => {
 return (
 <div className="space-y-3 mt-4">
 <div className="flex items-center justify-between px-2 mb-2">
 <div className="flex items-center gap-2">
 <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 ">My Projects</h2>
 </div>
 <span className="bg-brand-50 text-brand-600 text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center">
 {tasks.length}
 </span>
 </div>

 {tasks.length > 0 ? (
 <>
 {tasks.map((task) => {
 const isSelected = selectedTaskId === task.id;
 const colors = PROJECT_STATUS_COLORS[task.status as string] || PROJECT_STATUS_COLORS[PROJECT_STATUS.PLANNING];

 return (
 <div
 key={task.id}
 onClick={() => handleTaskClick(task)}
 className={`
 group relative p-3 rounded-lg border transition-all duration-200 cursor-pointer w-full text-left
 ${isSelected
 ? 'bg-brand-50 border-brand-200 shadow-sm'
 : 'bg-card border-border hover:border-brand-300 hover:shadow-md'
 }
 `}
 role="button"
 tabIndex={0}
 onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleTaskClick(task);
 }
 }}
 >
 <div className="flex justify-between items-start mb-2 w-full">
 <h3 className={`font-semibold text-sm line-clamp-1 break-all ${isSelected ? 'text-brand-700 ' : 'text-foreground'}`}>
 {task.title}
 </h3>
 <button
 type="button"
 className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-md transition-all ${isSelected ? 'text-brand-600 hover:bg-brand-100' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
 }`}
 onClick={(e: MouseEvent) => {
 e.stopPropagation();
 }}
 aria-label={`Project settings for ${task.title ?? 'this project'}`}
 title="Project Settings"
 >
 <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
 </svg>
 </button>
 </div>

 <div className="flex items-center gap-2 mt-2">
 <div className={`
 text-[10px] px-2 py-0.5 rounded-full font-medium border uppercase tracking-wide
 ${colors.bg} ${colors.text} ${colors.border}
 `}>
 {task.status ? (task.status as string).replace('_', ' ') : 'Planning'}
 </div>
 </div>
 </div>
 );
 })}

 {hasMore && (
 <button
 onClick={onLoadMore}
 disabled={isFetchingMore}
 className="w-full py-2 text-xs text-brand-600 hover:text-brand-700 hover:underline disabled:opacity-50 text-center mt-2"
 >
 {isFetchingMore ? 'Loading...' : 'Load More Projects'}
 </button>
 )}
 </>
 ) : (
 !isFetchingMore && (
 <button
 type="button"
 onClick={onLoadMore}
 className="flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-muted/50 rounded-lg m-2 transition-colors border border-dashed border-border group w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
 aria-label="No projects yet — click to create your first project"
 >
 <FolderPlus aria-hidden="true" className="w-8 h-8 text-muted-foreground mb-2 group-hover:text-brand-500 transition-colors" />
 <p className="text-sm font-medium text-foreground">No Projects</p>
 <p className="text-xs text-muted-foreground">Create your first project to get started.</p>
 </button>
 )
 )}
 </div>
 );
};

export default InstanceList;
