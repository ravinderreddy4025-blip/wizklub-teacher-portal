import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const surfaceMap = {
  default: 'glass-card',
  frosted: 'glass-card-frosted',
  panel: 'glass-panel',
};

const Card = ({ children, className = '', title, action, noPadding = false, variant = 'default' }) => {
  return (
    <div className={twMerge(clsx(surfaceMap[variant] || surfaceMap.default, !noPadding && 'p-6'), className)}>
      {(title || action) && (
        <div
          className={clsx(
            'flex items-center justify-between border-b border-[#f0e8de] pb-4',
            noPadding ? 'px-5 pt-5 mb-0' : 'mb-5',
          )}
        >
          {title && <h3 className="font-heading text-base font-bold text-slate-900">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="relative z-[1] text-slate-700">{children}</div>
    </div>
  );
};

export default Card;
