import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const SkeletonLoader = ({ className = '', type = 'rect' }) => {
  const baseClasses = 'bg-white/25 animate-pulse-subtle backdrop-blur-sm';

  const typesClasses = {
    rect: 'rounded-xl',
    text: 'h-4 rounded-md',
    circle: 'rounded-full',
  };

  return <div className={twMerge(clsx(baseClasses, typesClasses[type]), className)} />;
};

export default SkeletonLoader;
