import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 LayoutDashboard,
 FolderOpen,
 Settings,
 User,
 Calendar
} from 'lucide-react';

import {
 CommandDialog,
 CommandEmpty,
 CommandGroup,
 CommandInput,
 CommandItem,
 CommandList,
 CommandSeparator,
 CommandShortcut,
} from '@/shared/ui/command';

interface CommandPaletteProject {
 id: string;
 title: string;
}

interface CommandPaletteProps {
 projects?: CommandPaletteProject[];
}

export function CommandPalette({ projects = [] }: CommandPaletteProps) {
 const [open, setOpen] = useState(false);
 const navigate = useNavigate();

 useEffect(() => {
 const down = (e: KeyboardEvent): void => {
 if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
 e.preventDefault();
 setOpen((prev) => !prev);
 }
 };

 document.addEventListener('keydown', down);
 return () => document.removeEventListener('keydown', down);
 }, []);

 const runCommand = useCallback((command: () => void): void => {
 setOpen(false);
 command();
 }, []);

 const projectItems = useMemo(() => projects.map((project) => (
 <CommandItem
 key={project.id}
 onSelect={() => runCommand(() => navigate(`/projects/${project.id}`))}
 >
 <FolderOpen className="mr-2 h-4 w-4" />
 <span>{project.title}</span>
 </CommandItem>
 )), [projects, navigate, runCommand]);

 return (
 <div data-testid="command-palette">
 <CommandDialog open={open} onOpenChange={setOpen}>
 <CommandInput placeholder="Type a command or search..." />
 <CommandList>
 <CommandEmpty>No results found.</CommandEmpty>

 <CommandGroup heading="Suggestions">
 <CommandItem onSelect={() => runCommand(() => navigate('/dashboard'))}>
 <LayoutDashboard className="mr-2 h-4 w-4" />
 <span>Project Dashboard</span>
 </CommandItem>
 <CommandItem onSelect={() => runCommand(() => navigate('/tasks'))}>
 <Calendar className="mr-2 h-4 w-4" />
 <span>My Tasks</span>
 </CommandItem>
 <CommandItem onSelect={() => runCommand(() => navigate('/settings'))}>
 <Settings className="mr-2 h-4 w-4" />
 <span>Settings</span>
 <CommandShortcut>⌘S</CommandShortcut>
 </CommandItem>
 </CommandGroup>

 <CommandSeparator />

 <CommandGroup heading="Projects">
 {projectItems}
 </CommandGroup>

 <CommandSeparator />

 <CommandGroup heading="Actions">
 <CommandItem onSelect={() => runCommand(() => navigate('/team'))}>
 <User className="mr-2 h-4 w-4" />
 <span>Team</span>
 </CommandItem>
 </CommandGroup>
 </CommandList>
 </CommandDialog>
 </div>
 );
}
