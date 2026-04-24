import { useId, useMemo, useRef, useState, useCallback } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, X } from 'lucide-react';
import useMasterLibrarySearch from '@/features/library/hooks/useMasterLibrarySearch';

interface SearchTask {
 id: string;
 title?: string;
 description?: string | null;
 origin?: string | null;
 [key: string]: unknown;
}

interface MasterLibrarySearchProps {
 onSelect?: (task: SearchTask) => void;
 mode?: 'copy' | 'view';
 label?: string;
 placeholder?: string;
 phasesOnly?: boolean;
 excludeTemplateIds?: readonly string[];
}

const MasterLibrarySearch = ({
 onSelect,
 mode = 'copy',
 label,
 placeholder,
 phasesOnly = false,
 excludeTemplateIds,
}: MasterLibrarySearchProps) => {
 const { t } = useTranslation();
 const [query, setQuery] = useState('');
 const [isOpen, setIsOpen] = useState(false);
 const [activeIndex, setActiveIndex] = useState(-1);
 const listboxId = useId();
 const inputRef = useRef<HTMLInputElement>(null);
 const containerRef = useRef<HTMLDivElement>(null);

 const { results, isLoading, hasResults, exclusionDrained } = useMasterLibrarySearch({
 query,
 phasesOnly,
 excludeTemplateIds,
 });

 const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
 setQuery(event.target.value);
 setIsOpen(true);
 setActiveIndex(-1);
 }, []);

 const handleSelect = useCallback((task: SearchTask) => {
 onSelect?.(task);
 setQuery(task.title ?? '');
 setIsOpen(false);
 setActiveIndex(-1);
 }, [onSelect]);

 const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
 if (event.key === 'ArrowDown') {
 event.preventDefault();
 setIsOpen(true);
 setActiveIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1));
 } else if (event.key === 'ArrowUp') {
 event.preventDefault();
 setActiveIndex((prev) => (prev - 1 < 0 ? results.length - 1 : prev - 1));
 } else if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
 event.preventDefault();
 handleSelect(results[activeIndex]);
 } else if (event.key === 'Escape') {
 setIsOpen(false);
 setActiveIndex(-1);
 }
 }, [results, activeIndex, handleSelect]);

 const activeResultId = useMemo(() => {
 if (activeIndex < 0 || activeIndex >= results.length) return undefined;
 return `${listboxId}-item-${results[activeIndex].id}`;
 }, [activeIndex, listboxId, results]);

 const resolvedLabel = label ?? t('library.search_label');
 const resolvedPlaceholder = placeholder ?? t('library.search_placeholder');
 const actionLabel = mode === 'view' ? t('common.view') : t('library.copy_to_form');

 return (
 <div ref={containerRef} className="relative space-y-1">
 <label
 className="block text-sm font-medium text-slate-600"
 htmlFor={`master-library-search-${listboxId}`}
 >
 {resolvedLabel}
 </label>
 <div className="relative">
 <input
 ref={inputRef}
 id={`master-library-search-${listboxId}`}
 type="text"
 className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-16 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
 placeholder={resolvedPlaceholder}
 value={query}
 onChange={handleQueryChange}
 onFocus={() => setIsOpen(true)}
 onBlur={() => {
 // Delay to allow click on dropdown items
 setTimeout(() => setIsOpen(false), 200);
 }}
 onKeyDown={handleKeyDown}
 role="combobox"
 aria-autocomplete="list"
 aria-controls={isOpen ? listboxId : undefined}
 aria-activedescendant={activeResultId}
 aria-expanded={isOpen && hasResults}
 aria-haspopup="listbox"
 />
 <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
 {query.length > 0 && (
 <button
 type="button"
 onClick={() => {
 setQuery('');
 setIsOpen(true);
 inputRef.current?.focus();
 }}
 className="text-slate-400 hover:text-slate-600"
 aria-label={t('common.clear_search')}
 >
 <X className="w-4 h-4" />
 </button>
 )}
 {isLoading ? (
 <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
 ) : (
 <ChevronDown className="w-4 h-4 text-slate-400" />
 )}
 </div>
 </div>

 {isOpen && (
 <div
 id={listboxId}
 role="listbox"
 aria-label={t('library.search_results_aria')}
 className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
 >
 {isLoading && (
 <div className="px-4 py-3 text-sm text-slate-500">{t('library.loading_templates')}</div>
 )}

 {!isLoading && results.length === 0 && (
 <div className="px-4 py-3 text-sm text-slate-500">
 {exclusionDrained
 ? t('library.all_matching_already_added')
 : query
 ? t('library.no_matching_templates')
 : t('library.no_templates_available')}
 </div>
 )}

 {results.map((task: SearchTask, index: number) => {
 const isActive = index === activeIndex;
 return (
 <button
 key={task.id}
 type="button"
 id={`${listboxId}-item-${task.id}`}
 role="option"
 aria-selected={isActive}
 onMouseDown={(e) => e.preventDefault()}
 onClick={() => handleSelect(task)}
 className={`w-full text-left px-4 py-2.5 border-b border-slate-50 last:border-b-0 focus:outline-none ${
 isActive ? 'bg-brand-50' : 'hover:bg-slate-50'
 }`}
 >
 <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
 {task.description && (
 <p className="text-xs text-slate-500 truncate mt-0.5">{task.description}</p>
 )}
 <span className="text-xs text-brand-600">{actionLabel}</span>
 </button>
 );
 })}
 </div>
 )}
 </div>
 );
};

export default MasterLibrarySearch;
