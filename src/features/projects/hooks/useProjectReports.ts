import { useMemo } from 'react';
import { TASK_STATUS } from '@/shared/constants';
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
 // Remainder: every non-`na` task that isn't completed/in-progress/blocked
   // (todo + any legacy/off-enum status like `planning` or the old
   // `not_started`). Guarantees the four cards sum to `totalTasks`; previously
   // this counted only `todo`, so off-enum tasks vanished from the cards while
   // still counting toward the total.
   not_started: tasks.filter(
    (t) =>
     t.status !== TASK_STATUS.NOT_APPLICABLE &&
     t.status !== TASK_STATUS.COMPLETED &&
     t.status !== TASK_STATUS.IN_PROGRESS &&
     t.status !== TASK_STATUS.BLOCKED,
   ).length,
 blocked: tasks.filter((t) => t.status === TASK_STATUS.BLOCKED).length,
 };

 // Drop `na` (not applicable) tasks from the progress denominator entirely —
 // they leave the total so progress reaches 100% once every remaining task is
 // completed.
 const totalTasks = tasks.filter((t) => t.status !== TASK_STATUS.NOT_APPLICABLE).length;
 const completedTasks = tasksByStatus.completed;
 const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

 const sortedPhases = [...phases].sort((a: TaskRow, b: TaskRow) => (a.position || 0) - (b.position || 0));
 const phaseIds = new Set(phases.map((p) => p.id));

 const phaseData = sortedPhases.map((phase, idx) => {
 // Count milestones (direct children of the phase), not leaf tasks
 const phaseMilestones = tasks.filter((t) => t.parent_task_id === phase.id && t.status !== TASK_STATUS.NOT_APPLICABLE);
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
  const milestoneTasks = tasks.filter((t) => t.parent_task_id === m.id && t.status !== TASK_STATUS.NOT_APPLICABLE);
  const completedCount = milestoneTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
  const totalCount = milestoneTasks.length;
  return {
  id: m.id,
  title: m.title,
  due_date: m.due_date,
  updated_at: m.updated_at,
  notes: m.notes,
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
 { key: 'completed' as const, value: tasksByStatus.completed },
 { key: 'in_progress' as const, value: tasksByStatus.in_progress },
 { key: 'not_started' as const, value: tasksByStatus.not_started },
 { key: 'blocked' as const, value: tasksByStatus.blocked },
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
