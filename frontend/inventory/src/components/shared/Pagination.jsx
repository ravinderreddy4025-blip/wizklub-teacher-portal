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
    <nav className={`flex flex-wrap items-center justify-between gap-3 px-1 pt-4 ${className}`} aria-label="Pagination">
      <p className="text-[13px] text-wk-body">
        Showing {start}–{end} of {total} · page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="min-h-[40px] px-4 text-[13px]"
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
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={`h-10 min-w-[2.5rem] rounded-full px-2 text-[13px] font-semibold transition-colors ${
              p === page
                ? 'bg-wk-navy text-white'
                : 'bg-white text-wk-navy hover:bg-wk-cream'
            }`}
          >
            {p}
          </button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="min-h-[40px] px-4 text-[13px]"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
