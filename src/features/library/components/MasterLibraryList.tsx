import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMasterLibraryTasks from '@/features/library/hooks/useMasterLibraryTasks';
import { useTreeState } from '@/features/library/hooks/useTreeState';
import type { TaskItemData } from '@/shared/types/tasks';

import { DndContext, useSensor, useSensors, PointerSensor, closestCorners } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';

const PAGE_SIZE = 50;

interface MasterLibraryListProps {
 onTaskSelect?: (task: TaskItemData) => void;
 onAddChildTask?: (task: TaskItemData) => void;
 renderTaskItem: (props: {
 task: TaskItemData;
 level: number;
 onTaskClick: (task: TaskItemData) => void;
 onStatusChange: (taskId: string, status: string) => void;
 onAddChildTask?: (task: TaskItemData) => void;
 onToggleExpand: (taskId: string) => void;
 }) => React.ReactNode;
}

const MasterLibraryList = (props: MasterLibraryListProps) => {
 const { t } = useTranslation();
 const [page, setPage] = useState(0);
 const [resourceType] = useState('all');

 const {
 tasks: rootTasks,
 isLoading,
 hasNextPage,
 fetchNextPage,
 refresh,
 } = useMasterLibraryTasks({
 limit: PAGE_SIZE,
 resourceType,
 });

 const { treeData, loadingNodes, expandedTaskIds, toggleExpand, handleStatusChange, handleReorder } = useTreeState(rootTasks);

 const handleTaskClick = (task: TaskItemData) => {
 if (props.onTaskSelect) {
 props.onTaskSelect(task);
 }
 };

 const pageDescription = useMemo(() => {
 if (isLoading) return t('library.master.loading_tasks');
 const start = page * PAGE_SIZE + 1;
 const end = start + (rootTasks?.length || 0) - 1;
 return rootTasks?.length > 0
 ? t('library.master.showing_tasks', { start, end })
 : t('library.master.no_tasks_on_page', { page: page + 1 });
 }, [isLoading, page, rootTasks, t]);

 const handlePrev = () => {
 if (page === 0 || isLoading) return;
 setPage((prev) => Math.max(0, prev - 1));
 };
 const handleNext = () => {
 if (!hasNextPage && rootTasks.length <= (page + 1) * PAGE_SIZE) return;
 setPage((prev) => prev + 1);
 if (rootTasks.length <= (page + 1) * PAGE_SIZE && hasNextPage) {
 fetchNextPage();
 }
 };

 const sensors = useSensors(
 useSensor(PointerSensor, {
 activationConstraint: {
 distance: 8,
 },
 })
 );

 const handleDragEnd = (event: DragEndEvent) => {
 const { active, over } = event;
 if (over && active.id !== over.id) {
 handleReorder(active.id as string, over.id as string);
 }
 };

 return (
 <section className="mt-10">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-xl font-semibold text-slate-900">{t('library.master.title')}</h2>
 <p className="text-sm text-slate-600" role="status" aria-live="polite">
 {pageDescription}
 </p>
 </div>
 <button
 type="button"
 onClick={() => refresh()}
 className="inline-flex items-center px-3 py-2 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-md"
 disabled={isLoading}
 >
 {t('common.refresh')}
 </button>
 </div>

 <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
 {isLoading && treeData.length === 0 ? (
 <div className="text-center py-8">{t('common.loading')}...</div>
 ) : (
 <div className="space-y-2">
 <DndContext
 sensors={sensors}
 collisionDetection={closestCorners}
 onDragEnd={handleDragEnd}
 >
 {treeData.map((task) => (
 <div key={task.id} className="relative">
 {props.renderTaskItem({
 task,
 level: 0,
 onTaskClick: handleTaskClick,
 onStatusChange: handleStatusChange,
 onAddChildTask: props.onAddChildTask,
 onToggleExpand: () => toggleExpand(task, !expandedTaskIds.has(task.id)),
 })}
 {loadingNodes[task.id] && (
 <div className="absolute top-2 right-2 text-xs text-slate-500">
 {t('library.master.loading_subtasks')}
 </div>
 )}
 </div>
 ))}
 </DndContext>
 </div>
 )}

 {!isLoading && treeData.length === 0 && (
 <div className="text-center py-8 text-slate-500">{t('library.master.no_tasks')}</div>
 )}

 <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
 <button
 onClick={handlePrev}
 disabled={page === 0}
 className="px-3 py-1 border rounded disabled:opacity-50"
 >
 {t('common.previous')}
 </button>
 <span className="text-sm">{t('common.page', { page: page + 1 })}</span>
 <button
 onClick={handleNext}
 disabled={!hasNextPage && rootTasks.length <= (page + 1) * PAGE_SIZE}
 className="px-3 py-1 border rounded disabled:opacity-50"
 >
 {t('common.next')}
 </button>
 </div>
 </div>
 </section>
 );
};

export default MasterLibraryList;
