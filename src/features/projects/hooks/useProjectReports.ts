import { useMemo } from 'react';
import { TASK_STATUS } from '@/shared/constants';
import { CheckCircle2, Clock, AlertTriangle, Circle } from 'lucide-react';
import {
 dateStringToMonthKey,
 dateStringToUtcMidnight,
 getNow,
 toIsoDate,
 toMonthKey,
} from '@/shared/lib/date-engine';
import type { TaskRow } from '@/shared/db/app.types';

export interface UseProjectReportsOptions {
 /** Selected month in `YYYY-MM` format. Defaults to the month of `now`. */
 selectedMonth?: string;
 /** Reference time (testable clock). Defaults to `new Date()`. */
 now?: Date;
}

export function useProjectReports(
 tasks: TaskRow[],
 phases: TaskRow[],
 options: UseProjectReportsOptions = {},
) {
 const { selectedMonth, now = getNow() } = options;
 return useMemo(() => {
 // Basic task counts
 const tasksByStatus = {
 completed: tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length,
 in_progress: tasks.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length,
 not_started: tasks.filter((t) => t.status === TASK_STATUS.TODO).length,
 blocked: tasks.filter((t) => t.status === TASK_STATUS.BLOCKED).length,
 };

 const statsConfig = [
 {
 label: 'Completed', value: tasksByStatus.completed, icon: CheckCircle2,
 borderClass: 'border-green-200', bgClass: 'bg-green-100', hoverBgClass: 'bg-green-500', textClass: 'text-green-600'
 },
 {
 label: 'In Progress', value: tasksByStatus.in_progress, icon: Clock,
 borderClass: 'border-orange-200', bgClass: 'bg-orange-100', hoverBgClass: 'bg-orange-500', textClass: 'text-orange-600'
 },
 {
 label: 'Not Started', value: tasksByStatus.not_started, icon: Circle,
 borderClass: 'border-indigo-200', bgClass: 'bg-indigo-100', hoverBgClass: 'bg-indigo-500', textClass: 'text-indigo-600'
 },
 {
 label: 'Blocked', value: tasksByStatus.blocked, icon: AlertTriangle,
 borderClass: 'border-red-200', bgClass: 'bg-red-100', hoverBgClass: 'bg-red-500', textClass: 'text-red-600'
 },
 ];

 const totalTasks = tasks.length;
 const completedTasks = tasksByStatus.completed;
 const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

 const sortedPhases = [...phases].sort((a: TaskRow, b: TaskRow) => (a.position || 0) - (b.position || 0));
 const phaseIds = new Set(phases.map((p) => p.id));

 const phaseData = sortedPhases.map((phase, idx) => {
 // Count milestones (direct children of the phase), not leaf tasks
 const phaseMilestones = tasks.filter((t) => t.parent_task_id === phase.id);
 const completed = phaseMilestones.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
 const total = phaseMilestones.length;
 return {
 id: phase.id,
 name: `Phase ${(phase as { position?: number }).position || idx + 1}`,
 fullName: phase.title,
 completed,
 remaining: total - completed,
 total,
 progress: total > 0 ? Math.round((completed / total) * 100) : 0,
 };
 });

 // Milestones: tasks whose parent is a phase
 const milestones = tasks
 .filter((t) => t.parent_task_id && phaseIds.has(t.parent_task_id))
 .map((m) => {
  const milestoneTasks = tasks.filter((t) => t.parent_task_id === m.id);
  const completedCount = milestoneTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
  const totalCount = milestoneTasks.length;
  return {
  id: m.id,
  title: m.title,
  due_date: m.due_date,
  updated_at: m.updated_at,
  status: m.status,
  is_complete: m.is_complete,
  completed: completedCount,
  total: totalCount,
  progress: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
  };
 })
 .sort((a, b) => {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
 });

 const taskDistribution = [
 { name: 'To Do', value: tasksByStatus.not_started },
 { name: 'In Progress', value: tasksByStatus.in_progress },
 { name: 'Done', value: tasksByStatus.completed },
 ];

 // Month-scoped milestone lists (Wave 20)
 const monthKey = selectedMonth ?? toMonthKey(now);
 const todayMidnight = dateStringToUtcMidnight(toIsoDate(now)) ?? 0;

 const isMilestoneComplete = (m: (typeof milestones)[number]) =>
  Boolean(m.is_complete) || m.status === TASK_STATUS.COMPLETED;

 const completedThisMonth = milestones.filter((m) => {
  if (!isMilestoneComplete(m)) return false;
  const dueMonth = dateStringToMonthKey(m.due_date);
  const updatedMonth = dateStringToMonthKey(m.updated_at);
  return dueMonth === monthKey || updatedMonth === monthKey;
 });

 const overdueMilestones = milestones.filter((m) => {
  if (isMilestoneComplete(m)) return false;
  const dueMs = dateStringToUtcMidnight(m.due_date);
  if (dueMs === null) return false;
  return dueMs < todayMidnight;
 });

 const upcomingThisMonth = milestones.filter((m) => {
  if (isMilestoneComplete(m)) return false;
  const dueMonth = dateStringToMonthKey(m.due_date);
  if (dueMonth !== monthKey) return false;
  const dueMs = dateStringToUtcMidnight(m.due_date);
  if (dueMs === null) return false;
  return dueMs >= todayMidnight;
 });

 return {
 statsConfig,
 overallProgress,
 completedTasks,
 totalTasks,
 phaseData,
 taskDistribution,
 milestones,
 selectedMonth: monthKey,
 completedThisMonth,
 overdueMilestones,
 upcomingThisMonth,
 };
 }, [tasks, phases, selectedMonth, now]);
}
