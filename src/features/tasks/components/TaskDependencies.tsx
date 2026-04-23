import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { planter } from '@/shared/api/planterClient';
import { Button } from '@/shared/ui/button';
import { Link2, Trash2, Check } from 'lucide-react';
import {
 Command,
 CommandEmpty,
 CommandGroup,
 CommandInput,
 CommandItem,
 CommandList,
} from "@/shared/ui/command";
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from '@/shared/lib/utils';
import type { TaskRow } from '@/shared/db/app.types';

interface TaskRelationship {
 id: string;
 from_task_id: string;
 to_task_id: string;
 type: string;
 from_task?: { title: string };
 to_task?: { title: string };
}

interface TaskDependenciesProps {
 task: TaskRow;
 allProjectTasks: TaskRow[];
}

export default function TaskDependencies({ task, allProjectTasks }: TaskDependenciesProps) {
 const { t } = useTranslation();
 const queryClient = useQueryClient();
 const [open, setOpen] = useState(false);
 const [selectedType] = useState('relates_to');

 const { data: relationships = [] } = useQuery<TaskRelationship[]>({
 queryKey: ['taskRelationships', task.id],
 queryFn: async () => {
 const { data } = await planter.rpc('get_task_relationships', { p_task_id: task.id }) as { data: TaskRelationship[] | null };
 return data || [];
 }
 });

 const addMutation = useMutation({
 mutationFn: async (targetTaskId: string) => {
 return await planter.entities.TaskRelationship.create({
 from_task_id: task.id,
 to_task_id: targetTaskId,
 project_id: task.root_id as string,
 type: selectedType
 });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['taskRelationships', task.id] });
 setOpen(false);
 }
 });

 const removeMutation = useMutation({
 mutationFn: (id: string) => planter.entities.TaskRelationship.delete(id),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['taskRelationships', task.id] });
 }
 });

 // Filter out self and already existing relationships
 const validRelationships = Array.isArray(relationships) ? relationships : [];
 const existingIds = new Set(validRelationships.flatMap(r => [r.from_task_id, r.to_task_id]));
 const availableTasks = (allProjectTasks || []).filter(t => t.id !== task.id && !existingIds.has(t.id));

 return (
 <div data-testid="task-dependencies" className="detail-section mb-6">
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{t('tasks.dependencies.heading')}</h3>
 </div>

 <div className="space-y-2 mb-3">
 {validRelationships.length === 0 && (
 <p className="text-sm text-slate-500 italic">{t('tasks.dependencies.empty')}</p>
 )}
 {validRelationships.map(rel => {
 const isOutgoing = rel.from_task_id === task.id;
 const otherTask = isOutgoing ? rel.to_task : rel.from_task;
 // Safety check if join failed
 if (!otherTask) return null;

 const relLabel = rel.type === 'blocks'
  ? (isOutgoing ? t('tasks.dependencies.type_blocks') : t('tasks.dependencies.type_blocked_by'))
  : t('tasks.dependencies.type_relates');

 return (
 <div key={rel.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md">
 <div className="flex items-center gap-2 overflow-hidden">
 <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${rel.type === 'blocks' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
 }`}>
 {relLabel}
 </span>
 <span className="text-sm text-slate-700 truncate">{otherTask.title}</span>
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => removeMutation.mutate(rel.id)}
 className="h-6 w-6 p-0 text-slate-400 hover:text-rose-500"
 aria-label={t('tasks.dependencies.remove_aria', { title: otherTask.title })}
 >
 <Trash2 aria-hidden="true" className="w-3 h-3" />
 </Button>
 </div>
 );
 })}
 </div>

 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <Button variant="outline" size="sm" className="w-full border-dashed text-slate-500 hover:text-brand-600 hover:border-brand-300">
 <Link2 aria-hidden="true" className="w-3 h-3 mr-2" />
 {t('tasks.dependencies.add_button')}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="p-0 w-[300px]" align="start">
 <Command>
 <CommandInput placeholder={t('tasks.dependencies.search_placeholder')} />
 <CommandList>
 <CommandEmpty>{t('tasks.dependencies.no_results')}</CommandEmpty>
 <CommandGroup heading={t('tasks.dependencies.available_heading')}>
 {availableTasks.map((t) => (
 <CommandItem
 key={t.id}
 value={t.title}
 onSelect={() => addMutation.mutate(t.id)}
 >
 <Check
 aria-hidden="true"
 className={cn(
 "mr-2 h-4 w-4 opacity-0"
 )}
 />
 <span className="truncate">{t.title}</span>
 </CommandItem>
 ))}
 </CommandGroup>
 </CommandList>
 </Command>
 </PopoverContent>
 </Popover>
 </div>
 );
}
