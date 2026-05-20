import { useMemo } from 'react';
import BoardColumn from './BoardColumn';
import { TASK_STATUS } from '@/shared/constants';
import type { TaskRow } from '@/shared/db/app.types';
import { compareByDueThenPosition } from '@/shared/lib/task-sort';

const COLUMNS = [
 { id: TASK_STATUS.TODO, title: 'To Do' },
 { id: TASK_STATUS.IN_PROGRESS, title: 'In Progress' },
 { id: TASK_STATUS.BLOCKED, title: 'Blocked' },
 { id: TASK_STATUS.COMPLETED, title: 'Complete' }
] as const;

interface ProjectBoardViewProps {
 project: TaskRow;
 childrenTasks: TaskRow[];
 handleTaskClick: (task: TaskRow) => void;
}

const ProjectBoardView = ({ project, childrenTasks, handleTaskClick }: ProjectBoardViewProps) => {
 // Categorize tasks
 const columns = useMemo(() => {
 // Create a map for quick lookup to build breadcrumbs
 const taskMap = new Map(childrenTasks.map(t => [t.id, t]));

 // Helper to get breadcrumbs
 const getBreadcrumbs = (task: TaskRow) => {
 const crumbs: string[] = [];
 let current: TaskRow | undefined = task;
 let depth = 0;
 while (current && current.parent_task_id && depth < 5) {
 const parent = taskMap.get(current.parent_task_id);
 if (parent) {
 crumbs.unshift(parent.title);
 current = parent;
 } else {
 break;
 }
 depth++;
 }
 return crumbs.join(' > ');
 };

 const cols: Record<string, (TaskRow & { breadcrumbs?: string })[]> = {
 [TASK_STATUS.TODO]: [],
 [TASK_STATUS.IN_PROGRESS]: [],
 [TASK_STATUS.BLOCKED]: [],
 [TASK_STATUS.COMPLETED]: [],
 };

 childrenTasks.forEach(task => {
 const status = task.status || TASK_STATUS.TODO;
 // Enrich task with breadcrumbs for display
 const enrichedTask = {
 ...task,
 breadcrumbs: getBreadcrumbs(task)
 };

 if (cols[status]) {
 cols[status].push(enrichedTask);
 } else {
 cols[TASK_STATUS.TODO].push(enrichedTask); // Fallback
 }
 });

 // Chronological by due_date, position as tiebreaker.
 Object.keys(cols).forEach(key => {
 cols[key].sort(compareByDueThenPosition);
 });

 return cols;
 }, [childrenTasks]);

 return (
 <div className="flex h-full gap-4 overflow-x-auto pb-4 items-start px-2">
 {COLUMNS.map(col => (
 <BoardColumn
 key={col.id}
 id={col.id}
 title={col.title}
 tasks={columns[col.id] || []}
 onTaskClick={handleTaskClick}
 parentId={project.id}
 />
 ))}
 </div>
 );
};

export default ProjectBoardView;
