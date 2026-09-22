import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Status badge: tint background + AA text, sentence case (IL). */
const typeStyles = {
  success: 'bg-success-100 text-success-700',
  error: 'bg-error-50 text-error-700',
  pending: 'bg-wk-peach text-wk-orange-text',
  warning: 'bg-warning-100 text-warning-700',
  info: 'bg-info-50 text-info-600',
  default: 'bg-wk-mist text-wk-body',
};

const Badge = ({ children, type = 'default', className = '' }) => {
  return (
    <span className={twMerge(clsx('wk-badge font-ui', typeStyles[type] || typeStyles.default), className)}>
      {children}
    </span>
  );
};

export default Badge;
