import { TASK_STATUS, PROJECT_STATUS } from './index';

export interface StatusColorConfig {
 bg: string;
 border: string;
 text: string;
 gradient: string;
 accent: string;
 headerBg: string;
 headerContent: string;
 icon?: string;
 indicator?: string;
}

export const CHART_COLORS: Record<string, string> = {
 [TASK_STATUS.TODO]: 'var(--color-slate-400)',
 [TASK_STATUS.IN_PROGRESS]: 'var(--color-amber-500)',
 [TASK_STATUS.BLOCKED]: 'var(--color-rose-500)',
 [TASK_STATUS.COMPLETED]: 'var(--color-emerald-500)',
 [TASK_STATUS.NOT_APPLICABLE]: 'var(--color-slate-300)',
};

export const PHASE_STATUS_COLORS: Record<string, { bg: string; light: string; text: string; border: string }> = {
  not_started: { bg: 'bg-slate-400', light: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  in_progress: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  completed: { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  overdue: { bg: 'bg-rose-500', light: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
};

export const TASK_STATUS_BORDER: Record<string, string> = {
  todo: 'border-l-slate-300',
  not_started: 'border-l-slate-300',
  in_progress: 'border-l-amber-500',
  blocked: 'border-l-rose-500',
  completed: 'border-l-emerald-500',
  na: 'border-l-slate-200',
  overdue: 'border-l-rose-500',
};

export const PROJECT_STATUS_COLORS: Record<string, StatusColorConfig> = {
 [PROJECT_STATUS.PLANNING]: {
 bg: 'bg-white',
 border: 'border-2 border-blue-600',
 text: 'text-blue-700',
 gradient: '',
 accent: 'border-blue-500',
 headerBg: 'bg-blue-600',
 headerContent: 'text-white',
 },
 [PROJECT_STATUS.IN_PROGRESS]: {
 bg: 'bg-white',
 border: 'border-2 border-orange-600',
 text: 'text-orange-700',
 gradient: '',
 accent: 'border-orange-500',
 headerBg: 'bg-orange-600',
 headerContent: 'text-white',
 },
 [PROJECT_STATUS.LAUNCHED]: {
 bg: 'bg-white',
 border: 'border-2 border-emerald-600',
 text: 'text-emerald-700',
 gradient: '',
 accent: 'border-emerald-500',
 headerBg: 'bg-emerald-600',
 headerContent: 'text-white',
 },
 [PROJECT_STATUS.PAUSED]: {
 bg: 'bg-white',
 border: 'border-2 border-amber-500',
 text: 'text-amber-700',
 icon: 'text-slate-900',
 indicator: 'bg-amber-500',
 gradient: '',
 accent: 'border-amber-500',
 headerBg: 'bg-amber-500',
 headerContent: 'text-white',
 },
};
