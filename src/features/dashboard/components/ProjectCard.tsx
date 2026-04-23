import { Link } from 'react-router-dom';
import { Card } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import { formatDate } from '@/shared/lib/date-engine';
import { Calendar, Users } from 'lucide-react';
import { TASK_STATUS, PROJECT_STATUS } from '@/shared/constants';
import { PROJECT_STATUS_COLORS } from '@/shared/constants/colors';
import type { Project, Task, TeamMemberRow } from '@/shared/db/app.types';

interface ProjectCardProps {
 project: Project;
 tasks?: Task[];
 teamMembers?: TeamMemberRow[];
}

const ProjectCard = ({ project, tasks = [], teamMembers = [] }: ProjectCardProps) => {
  const statusConfig = PROJECT_STATUS_COLORS[project.status as keyof typeof PROJECT_STATUS_COLORS] || PROJECT_STATUS_COLORS[PROJECT_STATUS.PLANNING];

 const totalTasks = tasks.length;
 const completedTasks = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
 const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

 return (
 <div data-testid="project-card" className="h-full transition-transform duration-200 hover:-translate-y-1">
 <Link to={`/project/${project.id}`} className="h-full block">
 <Card className="p-4 sm:p-6 hover:shadow-xl transition-all duration-300 border border-border hover:border-brand-300 cursor-pointer group bg-card h-full flex flex-col justify-between overflow-hidden">
 <div className="mb-4">
 <h3 className="font-semibold text-lg text-card-foreground group-hover:text-brand-600 transition-colors">
 {project.title || project.name}
 </h3>
 <Badge
 variant="secondary"
 className={`${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} border text-[10px] font-bold mt-1 uppercase tracking-wider`}
 >
 {project.status?.replace('_', ' ')}
 </Badge>
 </div>

 {project.description && (
 <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
 {project.description}
 </p>
 )}

 <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-5">
 {project.launch_date && (
 <div className="flex items-center gap-1.5">
 <Calendar className="w-4 h-4" />
 <span>{formatDate(project.launch_date, 'MMM d, yyyy')}</span>
 </div>
 )}
 <div className="flex items-center gap-1.5">
 <Users className="w-4 h-4" />
 <span>
 {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
 </span>
 </div>
 </div>

 <div className="space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">Progress</span>
 <span className="font-medium text-card-foreground">{progressPercent}%</span>
 </div>
 <Progress value={progressPercent} className="h-2 bg-muted" />
 <p className="text-xs text-muted-foreground">
 {completedTasks} of {totalTasks} tasks completed
 </p>
 </div>
 </Card>
 </Link>
 </div>
 );
}

export default ProjectCard;
