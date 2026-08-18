import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const variants = {
  primary: 'bg-brand-primary text-white hover:bg-brand-orange-vivid shadow-glow-orange border border-white/30',
  gradient: 'bg-gradient-to-r from-brand-orange-light via-brand-primary to-brand-orange-deep text-white shadow-glow-orange border border-white/45 hover:brightness-105',
  secondary: 'bg-brand-orange-light/25 backdrop-blur-md text-brand-deep hover:bg-brand-orange-light/40 border border-brand-orange-light/50 shadow-soft',
  glass: 'bg-white/20 backdrop-blur-md text-white border border-white/30 hover:bg-white/30 shadow-glass-inset',
  outline: 'bg-white text-brand-deep border border-brand-orange-light/60 hover:bg-brand-orange-light/15 hover:border-brand-primary/40 shadow-soft',
  danger: 'bg-error-500/90 backdrop-blur-sm text-white hover:bg-error-600 border border-white/20 shadow-soft',
  ghost: 'text-white/75 hover:bg-white/10 hover:text-white border border-transparent',
};

const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  return (
    <button
      className={twMerge(
        clsx(
          'relative overflow-hidden transition-all duration-200 ease-out px-4 py-2.5 rounded-xl font-ui text-sm inline-flex items-center justify-center gap-2 enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant]
        ),
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
