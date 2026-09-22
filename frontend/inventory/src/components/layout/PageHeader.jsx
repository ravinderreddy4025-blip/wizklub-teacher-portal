import React from 'react';

/** IL page header: 28/40 600 title (22 on mobile), 14px secondary subtitle, actions right. */
const PageHeader = ({ eyebrow, title, subtitle, action }) => (
  <div className="mb-5 flex w-full flex-col gap-3 pt-2 lg:mb-6 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0 flex-1">
      {eyebrow && (
        <p className="mb-1 text-sm font-medium text-wk-orange-text">
          {eyebrow}
        </p>
      )}
      <h1 className="inv-page-title">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-wk-body">
          {subtitle}
        </p>
      )}
    </div>
    {action && (
      <div className="flex shrink-0 flex-wrap gap-2 self-start lg:self-end">{action}</div>
    )}
  </div>
);

export default PageHeader;
