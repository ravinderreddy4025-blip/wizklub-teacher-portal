import React from 'react';
import Button from '../ui/Button';

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize = 25,
  onPageChange,
  className = '',
}) {
  if (!total || totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  for (let i = startPage; i <= endPage; i += 1) {
    pages.push(i);
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 px-1 ${className}`}>
      <p className="text-xs text-slate-500 font-medium">
        Showing {start}–{end} of {total} · page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="text-xs py-1.5 px-2.5"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`min-w-[2rem] h-8 rounded-lg text-xs font-bold transition-colors ${
              p === page
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p}
          </button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="text-xs py-1.5 px-2.5"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
