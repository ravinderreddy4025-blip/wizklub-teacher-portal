import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const surfaceMap = {
  default: 'glass-card',
  frosted: 'glass-card-frosted',
  panel: 'glass-panel',
};

/** IL card: white, radius 16, soft 12px shadow, no border; 16/600 title row. */
const Card = ({ children, className = '', title, action, noPadding = false, variant = 'default' }) => {
  return (
    <div className={twMerge(clsx(surfaceMap[variant] || surfaceMap.default, !noPadding && 'p-4 sm:p-6'), className)}>
      {(title || action) && (
        <div
          className={clsx(
            'flex flex-wrap items-center justify-between gap-3 border-b border-wk-line pb-4',
            noPadding ? 'px-4 pt-4 sm:px-6 sm:pt-5 mb-0' : 'mb-5',
          )}
        >
          {title && <h3 className="text-base font-semibold text-wk-ink">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="relative z-[1] text-wk-ink">{children}</div>
    </div>
  );
};

export default Card;
