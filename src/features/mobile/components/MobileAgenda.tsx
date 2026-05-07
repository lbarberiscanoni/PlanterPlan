import { useNavigate } from 'react-router-dom';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Calendar, ChevronRight } from 'lucide-react';
import { formatDate, endOfDayDate, isBeforeDate, nowUtcIso } from '@/shared/lib/date-engine';
import { TASK_STATUS } from '@/shared/constants';

interface AgendaTask {
 id: string;
 title?: string;
 status?: string | null;
 due_date?: string | null;
 root_id?: string | null;
 [key: string]: unknown;
}

interface MobileAgendaProps {
 tasks?: AgendaTask[];
}

/**
 * "Focused Today" — the user's top ≤3 tasks due today or earlier that
 * aren't complete. Was `md:hidden` when this file was introduced because
 * the product was mobile-first; the UX audit flagged that desktop users
 * (especially Limited / Viewer roles) had no equivalent surface. Removed the hidden
 * class so the card now renders on every breakpoint; on desktop it caps
 * to `max-w-md` so it doesn't overwhelm the 12-col layout.
 */
export default function MobileAgenda({ tasks = [] }: MobileAgendaProps) {
 const navigate = useNavigate();

 const today = nowUtcIso();
 const endOfToday = endOfDayDate(today) || today;

 const relevantTasks = tasks.filter(t => {
 if (t.status === TASK_STATUS.COMPLETED) return false;
 if (!t.due_date) return false;
 // Include tasks due exactly today or before the end of today
 return !isBeforeDate(endOfToday, t.due_date);
 }).slice(0, 3);

 if (relevantTasks.length === 0) return null;

 return (
 <div data-testid="mobile-agenda" className="mb-6 md:max-w-md">
 <Card className="bg-brand-600 text-white border-none shadow-lg">
 <div className="p-4">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <Calendar className="w-5 h-5 opacity-80" />
 <h3 className="font-semibold">Focused Today</h3>
 </div>
 <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{relevantTasks.length} Due</span>
 </div>

 <div className="space-y-3">
 {relevantTasks.map(task => (
 <div
 key={task.id}
 className="bg-white/10 rounded-lg p-3 flex items-center justify-between cursor-pointer active:bg-white/20 transition-colors"
 onClick={() => navigate(`/projects/${task.root_id}`)}
 >
 <div>
 <p className="font-medium text-sm line-clamp-1">{task.title}</p>
 <p className="text-xs text-brand-100">
 {task.due_date ? formatDate(task.due_date, 'MMM d') : 'Today'}
 </p>
 </div>
 <ChevronRight className="w-4 h-4 opacity-50" />
 </div>
 ))}
 </div>

 <Button
 className="w-full mt-4 bg-white text-brand-700 hover:bg-brand-50"
 size="sm"
 onClick={() => navigate('/tasks')}
 >
 View All Tasks
 </Button>
 </div>
 </Card>
 </div>
 );
}
