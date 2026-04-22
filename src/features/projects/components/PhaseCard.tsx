import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

import { ChevronRight, CheckCircle2, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { TASK_STATUS } from '@/shared/constants';
import { PHASE_STATUS_COLORS } from '@/shared/constants/colors';
import { extractProjectKind } from '@/features/projects/lib/project-kind';
import { isPastDate } from '@/shared/lib/date-engine';
import type { TaskRow } from '@/shared/db/app.types';

function getPhaseStatus(progress: number, totalTasks: number, phaseTasks: TaskRow[]): string {
 if (totalTasks === 0) return 'not_started';
 if (progress === 100) return 'completed';
 // Route through date-engine so the UTC-vs-local-midnight edge case
 // (YYYY-MM-DD due dates parsed as UTC midnight, compared against a
 // local-TZ `new Date()`) is handled consistently with the rest of the
 // codebase. `isPastDate` returns true only if the date is strictly
 // before today's UTC calendar day.
 const hasOverdue = phaseTasks.some(
  (t) => isPastDate(t.due_date) && t.status !== TASK_STATUS.COMPLETED
 );
 if (hasOverdue) return 'overdue';
 if (progress > 0) return 'in_progress';
 return 'not_started';
}

interface PhaseCardProps {
 phase: TaskRow;
 tasks?: TaskRow[];
 milestones?: TaskRow[];
 isActive?: boolean;
 onClick?: () => void;
 /** Wave 29: the project root; when `settings.project_kind === 'checkpoint'` the progress bar swaps to a donut. */
 rootTask?: TaskRow | null;
}

export default function PhaseCard({ phase, tasks = [], milestones = [], isActive, onClick, rootTask }: PhaseCardProps) {
 const order = phase.position || 1;
 const isLocked = phase.is_locked;

 // Filter tasks that belong to this phase (via milestones)
 const phaseTasks = tasks.filter((t) =>
 milestones.some((m) => m.id === t.parent_task_id && m.parent_task_id === phase.id)
 );

 const completedTasks = phaseTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
 const totalTasks = phaseTasks.length;
 const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
 const isComplete = progress === 100 && totalTasks > 0;
 const phaseStatus = getPhaseStatus(progress, totalTasks, phaseTasks);
 const colors = PHASE_STATUS_COLORS[phaseStatus] || PHASE_STATUS_COLORS.not_started;
 const isCheckpoint = extractProjectKind(rootTask) === 'checkpoint';
 const donutData = [
  { name: 'Completed', value: completedTasks },
  { name: 'Remaining', value: Math.max(0, totalTasks - completedTasks) },
 ];

 return (
 <motion.div whileHover={{ scale: isLocked ? 1 : 1.02 }} whileTap={{ scale: isLocked ? 1 : 0.98 }} className="h-full">
 <Card
 onClick={isLocked ? undefined : onClick}
 data-testid={`phase-card-${phase.id}`}
 className={cn(
 'p-5 transition-all duration-300 border-2 h-full flex flex-col',
 isLocked
 ? 'opacity-75 cursor-not-allowed border-muted bg-muted/30 text-muted-foreground'
 : cn(
 'cursor-pointer',
 isActive
 ? `${colors.border} bg-white shadow-lg`
 : 'border-slate-200 bg-slate-50/50 text-muted-foreground hover:bg-white hover:border-slate-300 hover:shadow-md'
 )
 )}
 >
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div
 className={cn(
 'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm',
 isLocked ? 'bg-muted' : colors.bg
 )}
 >
 {isLocked ? (
 <Lock className="w-5 h-5" />
 ) : isComplete ? (
 <CheckCircle2 className="w-5 h-5" />
 ) : (
 order
 )}
 </div>
 <div>
 <h3 className={cn('font-semibold', isLocked ? 'text-muted-foreground' : 'text-card-foreground')}>
 {phase.title}
 </h3>
 <p className="text-sm text-muted-foreground">{milestones.length} milestones</p>
 </div>
 </div>
 <ChevronRight
 className={cn(
 'w-5 h-5 transition-colors',
 isActive && !isLocked ? colors.text : 'text-muted-foreground/50'
 )}
 />
 </div>

 <div className="flex-grow">
 {phase.description && (
 <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
 {phase.description}
 </p>
 )}
 </div>

 <div className="space-y-2">
 {isCheckpoint ? (
 <div className="flex items-center justify-between gap-3" data-testid="phase-donut">
 <div className="relative h-16 w-16">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={donutData}
 cx="50%"
 cy="50%"
 innerRadius={18}
 outerRadius={30}
 startAngle={90}
 endAngle={-270}
 dataKey="value"
 strokeWidth={0}
 >
 <Cell fill={totalTasks === 0 || isLocked ? 'var(--color-slate-200)' : 'var(--color-brand-600)'} />
 <Cell fill="var(--color-slate-200)" />
 </Pie>
 </PieChart>
 </ResponsiveContainer>
 <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-900">
 {isLocked ? 'Locked' : `${progress}%`}
 </div>
 </div>
 <p className="text-xs text-slate-600">
 {isLocked
  ? `Complete Phase ${order - 1} to unlock`
  : `${completedTasks} of ${totalTasks} tasks`}
 </p>
 </div>
 ) : isLocked ? (
 <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded justify-center">
 <Lock className="w-3 h-3" />
 <span>Complete Phase {order - 1} to unlock</span>
 </div>
 ) : (
 <>
 <div className="flex justify-between text-sm">
 <span className="text-muted-foreground">Progress</span>
 <span className={cn('font-medium', colors.text)}>{progress}%</span>
 </div>
 <Progress value={progress} className={cn('h-2', colors.light)} />
 <p className="text-xs text-muted-foreground">
 {completedTasks} of {totalTasks} tasks
 </p>
 </>
 )}
 </div>
 </Card>
 </motion.div>
 );
}
