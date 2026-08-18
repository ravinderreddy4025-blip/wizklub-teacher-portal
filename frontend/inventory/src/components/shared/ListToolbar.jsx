import React from 'react';
import { Search } from 'lucide-react';
import Input from '../ui/Input';

export default function ListToolbar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = null,
  className = '',
}) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-wrap sm:flex-row sm:items-end mb-4 ${className}`}>
      {onSearchChange && (
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="!gap-0"
            aria-label="Search"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      )}
      {filters}
    </div>
  );
}
