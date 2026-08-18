import React from 'react';

const PageHeader = ({ eyebrow, title, subtitle, action }) => (
  <div className="mb-4 flex w-full flex-col gap-3 lg:mb-5 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0 flex-1">
      {eyebrow && (
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-brand-primary sm:text-xs">
          {eyebrow}
        </p>
      )}
      <h1 className="font-heading text-xl font-bold tracking-tight text-[#1F2937] sm:text-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 max-w-2xl text-[13px] font-medium leading-relaxed text-[#6B7280] sm:text-sm">
          {subtitle}
        </p>
      )}
    </div>
    {action && (
      <div className="flex shrink-0 gap-2 self-start lg:self-center">{action}</div>
    )}
  </div>
);

export default PageHeader;
