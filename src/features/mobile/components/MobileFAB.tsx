import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function MobileFAB() {
 const navigate = useNavigate();
 const { t } = useTranslation();

 return (
 <div data-testid="mobile-fab" className="fixed bottom-6 right-6 md:hidden z-50">
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 size="icon"
 className="w-14 h-14 rounded-full shadow-xl bg-brand-600 hover:bg-brand-700 text-white"
 aria-label="Add Task"
 >
 <Plus className="w-8 h-8" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="mb-2">

 <DropdownMenuItem onClick={() => navigate('/tasks?action=new-project')} className="cursor-pointer">
 {t('projects.new_project')}
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => navigate('/tasks?action=new-template')} className="cursor-pointer">
 {t('library.new_template')}
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 );
}
