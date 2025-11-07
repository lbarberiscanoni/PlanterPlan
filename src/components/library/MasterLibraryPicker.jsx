import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchMasterLibraryTasks, searchMasterLibraryTasks } from '../../services/taskService';

const DEFAULT_LIMIT = 20;
const DEBOUNCE_DELAY = 300;

/**
 * MasterLibraryPicker
 * Allows searching & selecting tasks from the master library with keyboard support.
 */
const MasterLibraryPicker = ({ onPick, onCreateNew, initialQuery = '', autoFocus = false }) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const hasInitialLoadRef = useRef(false);

  const listboxId = useId();
  const inputId = `${listboxId}-input`;

  const clearTimersAndAbort = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearTimersAndAbort();
    };
  }, [clearTimersAndAbort]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleResults = useCallback((data = []) => {
    if (!isMountedRef.current) return;
    setResults(Array.isArray(data) ? data : []);
    setActiveIndex((prevIndex) => {
      if (!data || data.length === 0) return -1;
      if (prevIndex < 0 || prevIndex >= data.length) return 0;
      return prevIndex;
    });
  }, []);

  const performInitialLoad = useCallback(async () => {
    clearTimersAndAbort();

    const controller = new AbortController();
    controllerRef.current = controller;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchMasterLibraryTasks({
        from: 0,
        limit: DEFAULT_LIMIT,
        signal: controller.signal,
      });

      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      handleResults(data);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setError(err?.message || 'Unable to load library items.');
      setResults([]);
      setActiveIndex(-1);
    } finally {
      if (!controller.signal.aborted && isMountedRef.current && requestId === requestIdRef.current) {
        hasInitialLoadRef.current = true;
        setIsLoading(false);
      }
    }
  }, [clearTimersAndAbort, handleResults]);

  const performSearch = useCallback(
    (term) => {
      const trimmed = term.trim();

      if (!trimmed) {
        if (!hasInitialLoadRef.current) {
          return;
        }

        clearTimersAndAbort();
        performInitialLoad();
        return;
      }

      clearTimersAndAbort();

      const controller = new AbortController();
      controllerRef.current = controller;

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      setIsLoading(true);
      setError(null);

      debounceRef.current = setTimeout(async () => {
        try {
          const { data, error: searchError } = await searchMasterLibraryTasks(trimmed, null, {
            limit: DEFAULT_LIMIT,
            offset: 0,
            signal: controller.signal,
          });

          if (!isMountedRef.current || requestId !== requestIdRef.current) return;

          if (searchError) {
            setError(searchError);
            setResults([]);
            setActiveIndex(-1);
            return;
          }

          handleResults(data);
          if (data?.length === 0 && trimmed) {
            setError(null);
          }
        } catch (err) {
          if (err?.name === 'AbortError') return;
          if (!isMountedRef.current || requestId !== requestIdRef.current) return;
          setError(err?.message || 'Search failed.');
          setResults([]);
          setActiveIndex(-1);
        } finally {
          if (!controller.signal.aborted && isMountedRef.current && requestId === requestIdRef.current) {
            setIsLoading(false);
          }
        }
      }, DEBOUNCE_DELAY);
    },
    [clearTimersAndAbort, handleResults, performInitialLoad]
  );

  useEffect(() => {
    performInitialLoad();
  }, [performInitialLoad]);

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  const handleInputChange = (event) => {
    setQuery(event.target.value);
  };

  const handleKeyDown = (event) => {
    if (results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (prev < 0) return 0;
        return (prev + 1) % results.length;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (prev <= 0) return results.length - 1;
        return prev - 1;
      });
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault();
        onPick?.(results[activeIndex]);
      }
    }
  };

  const handleOptionClick = (item) => {
    onPick?.(item);
  };

  const handleOptionMouseEnter = (index) => {
    setActiveIndex(index);
  };

  const renderResults = () => {
    if (isLoading) {
      return (
        <li
          className="px-3 py-2 text-sm text-gray-500"
          role="option"
          aria-disabled
          aria-selected="false"
        >
          Searching…
        </li>
      );
    }

    if (error) {
      return (
        <li
          className="px-3 py-2 text-sm text-red-600"
          role="option"
          aria-disabled
          aria-selected="false"
        >
          {error}
        </li>
      );
    }

    if (results.length === 0) {
      return (
        <li
          className="px-3 py-2 text-sm text-gray-500"
          role="option"
          aria-disabled
          aria-selected="false"
        >
          No results found.
        </li>
      );
    }

    return results.map((item, index) => {
      const optionId = `${listboxId}-option-${item.id ?? index}`;
      const isActive = index === activeIndex;

      return (
        <li
          key={item.id ?? index}
          id={optionId}
          role="option"
          aria-selected={isActive}
          className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
            isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
          }`}
          onClick={() => handleOptionClick(item)}
          onMouseEnter={() => handleOptionMouseEnter(index)}
          data-testid="library-option"
        >
          <p className="font-medium text-gray-900">{item.title || 'Untitled task'}</p>
          {item.description && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{item.description}</p>
          )}
        </li>
      );
    });
  };

  const activeOptionId = activeIndex >= 0 && results[activeIndex]
    ? `${listboxId}-option-${results[activeIndex].id ?? activeIndex}`
    : undefined;

  const showCreateResource =
    typeof onCreateNew === 'function' && !isLoading && !error && results.length === 0 && query.trim().length > 0;

  return (
    <div className="w-full">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-3 py-2">
          <input
            id={inputId}
            ref={inputRef}
            type="search"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label="Search master library"
            className="w-full border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            placeholder="Search master library…"
          />
        </div>

        <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto">
          {renderResults()}
        </ul>
      </div>

      {showCreateResource && (
        <button
          type="button"
          onClick={onCreateNew}
          className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Can't find what you need? Create new resource
        </button>
      )}
    </div>
  );
};

export default MasterLibraryPicker;
