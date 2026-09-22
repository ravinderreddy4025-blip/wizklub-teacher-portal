import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const SkeletonLoader = ({ className = '', type = 'rect' }) => {
  const baseClasses = 'bg-wk-mist animate-pulse-subtle';

  const typesClasses = {
    rect: 'rounded-2xl',
    text: 'h-4 rounded-md',
    circle: 'rounded-full',
  };

  return <div className={twMerge(clsx(baseClasses, typesClasses[type]), className)} aria-hidden="true" />;
};

export default SkeletonLoader;
