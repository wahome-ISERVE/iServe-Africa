import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, term: string) => boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchPlaceholder = 'Filter records...',
  searchFilter,
  searchQuery,
  onSearchChange,
  pageSize = 8,
  emptyTitle = 'No records found',
  emptyDescription = 'Add a new record or adjust your search filters.',
  emptyAction,
  toolbarExtra,
}: DataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState('');
  const search = searchQuery !== undefined ? searchQuery : internalSearch;
  const setSearch = (val: string) => {
    if (onSearchChange) {
      onSearchChange(val);
    }
    if (searchQuery === undefined) {
      setInternalSearch(val);
    }
  };
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !searchFilter) return rows;
    return rows.filter((r) => searchFilter(r, q));
  }, [rows, search, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return filtered;
    const getter = col.sortValue;
    return [...filtered].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  const toggleSort = (col: ColumnDef<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {(searchFilter || toolbarExtra) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-50/50">
          {searchFilter ? (
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-stone-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-[var(--brand-primary)]"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbarExtra && <div className="flex items-center gap-2 flex-wrap">{toolbarExtra}</div>}
        </div>
      )}

      {paged.length === 0 ? (
        <div className="px-6 py-12 text-center space-y-2">
          <p className="text-sm font-medium text-slate-900">{emptyTitle}</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{emptyDescription}</p>
          {emptyAction && <div className="pt-3">{emptyAction}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-semibold text-slate-600">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
                      >
                        <span>{col.header}</span>
                        {sortKey === col.key &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          ))}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {paged.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-stone-50/80 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-slate-700 ${
                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-200 bg-stone-50/50 text-xs text-slate-600">
          <span className="tabular-nums">
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 border border-stone-300 bg-white rounded-md hover:bg-stone-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 border border-stone-300 bg-white rounded-md hover:bg-stone-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
