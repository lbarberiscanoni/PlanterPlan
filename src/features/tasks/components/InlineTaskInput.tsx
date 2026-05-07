import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import useMasterLibrarySearch from '@/shared/hooks/useMasterLibrarySearch';

interface TemplateData {
 id: string;
 title?: string;
 description?: string | null;
 notes?: string | null;
 purpose?: string | null;
 actions?: string | null;
 [key: string]: unknown;
}

interface InlineTaskInputProps {
 onCommit: (title: string) => void;
 onCommitFromTemplate?: (template: TemplateData) => void;
 onCancel: () => void;
 loading?: boolean;
 level?: number;
 placeholder?: string;
}

const InlineTaskInput = ({
 onCommit,
 onCommitFromTemplate,
 onCancel,
 loading = false,
 level = 0,
 placeholder = "Type a task name..."
}: InlineTaskInputProps) => {
 const [title, setTitle] = useState('');
 const [activeIndex, setActiveIndex] = useState(-1);
 const [showDropdown, setShowDropdown] = useState(false);
 const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
 const inputRef = useRef<HTMLInputElement>(null);
 const containerRef = useRef<HTMLDivElement>(null);

 const { results, isLoading: searchLoading } = useMasterLibrarySearch({ query: title });

 useEffect(() => {
 inputRef.current?.focus();
 }, []);

 // Update dropdown position when showing
 useEffect(() => {
 if (showDropdown && containerRef.current) {
 const rect = containerRef.current.getBoundingClientRect();
 setDropdownPos({
 top: rect.bottom + 4,
 left: rect.left,
 width: rect.width,
 });
 }
 }, [showDropdown, title]);

 const handleSelect = useCallback((template: TemplateData) => {
 if (onCommitFromTemplate) {
 onCommitFromTemplate(template);
 } else {
 onCommit(template.title || '');
 }
 setTitle('');
 setShowDropdown(false);
 setActiveIndex(-1);
 }, [onCommit, onCommitFromTemplate]);

 const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
 if (loading) return;

 if (showDropdown && results.length > 0) {
 if (e.key === 'ArrowDown') {
 e.preventDefault();
 setActiveIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1));
 return;
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 setActiveIndex((prev) => (prev - 1 < 0 ? results.length - 1 : prev - 1));
 return;
 } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
 e.preventDefault();
 handleSelect(results[activeIndex] as TemplateData);
 return;
 }
 }

 if (e.key === 'Enter') {
 e.preventDefault();
 if (title.trim()) {
 onCommit(title.trim());
 setTitle('');
 }
 } else if (e.key === 'Escape') {
 e.preventDefault();
 if (showDropdown && results.length > 0) {
 setShowDropdown(false);
 setActiveIndex(-1);
 } else {
 onCancel();
 }
 }
 };

 const handleBlur = () => {
 setTimeout(() => {
 if (!title.trim() && !loading) {
 onCancel();
 }
 setShowDropdown(false);
 setActiveIndex(-1);
 }, 200);
 };

 const indentWidth = (level + 1) * 20;
 const hasResults = showDropdown && results.length > 0 && title.trim().length > 0;

 return (
 <div
 ref={containerRef}
 className="mb-2"
 style={{ marginLeft: `${indentWidth}px` }}
 >
 <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 animate-in fade-in duration-200">
 <div className="w-4 h-4 rounded-full border-2 border-brand-200 flex-shrink-0" />
 <input
 ref={inputRef}
 type="text"
 className="flex-1 bg-transparent border-none p-0 text-sm font-medium focus:ring-0 placeholder:text-muted-foreground/70"
 placeholder={placeholder}
 value={title}
 onChange={(e) => {
 setTitle(e.target.value);
 setShowDropdown(true);
 setActiveIndex(-1);
 }}
 onFocus={() => setShowDropdown(true)}
 onKeyDown={handleKeyDown}
 onBlur={handleBlur}
 disabled={loading}
 />
 {(loading || searchLoading) && <Loader2 className="w-3 h-3 animate-spin text-brand-500" />}
 <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider hidden sm:block">
 Enter to save • Esc to cancel
 </span>
 </div>

 {hasResults && dropdownPos && createPortal(
 <div
 className="fixed z-[9999] max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
 style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
 >
 {results.map((task, index) => (
 <button
 key={task.id}
 type="button"
 onMouseDown={(e) => e.preventDefault()}
 onClick={() => handleSelect(task as TemplateData)}
 className={`w-full text-left px-4 py-2 text-sm border-b border-slate-50 last:border-b-0 ${
 index === activeIndex ? 'bg-brand-50' : 'hover:bg-slate-50'
 }`}
 >
 <p className="font-medium text-slate-900 truncate">{task.title}</p>
 {task.description && (
 <p className="text-xs text-slate-500 truncate mt-0.5">{task.description}</p>
 )}
 </button>
 ))}
 </div>,
 document.body
 )}
 </div>
 );
};

export default InlineTaskInput;
