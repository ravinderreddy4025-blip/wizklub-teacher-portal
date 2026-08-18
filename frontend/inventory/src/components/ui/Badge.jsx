import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const typeStyles = {
  success: 'bg-success-50/70 text-success-600 border border-success-200/80 backdrop-blur-md',
  error: 'bg-error-50/70 text-error-600 border border-error-200/80 backdrop-blur-md',
  pending: 'bg-brand-primary/15 text-brand-deep border border-brand-primary/35 backdrop-blur-md',
  warning: 'bg-warning-50/70 text-warning-600 border border-warning-200/80 backdrop-blur-md',
  info: 'bg-brand-orange-light/20 text-brand-orange-deep border border-brand-primary/30 backdrop-blur-md',
  default: 'bg-brand-orange-light/15 text-brand-deep border border-brand-orange-light/40 backdrop-blur-md',
};

const Badge = ({ children, type = 'default', className = '' }) => {
  return (
    <span className={twMerge(clsx('font-ui inline-flex items-center px-2.5 py-1 rounded-lg text-xs uppercase tracking-wide', typeStyles[type]), className)}>
      {children}
    </span>
  );
};

export default Badge;
