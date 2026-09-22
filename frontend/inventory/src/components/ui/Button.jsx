import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/*
 * IL buttons in WizKlub colours: pill shapes, 44px touch target.
 *  primary/gradient = tangerine fill + NAVY text + 3px orange edge (never white on orange)
 *  secondary/outline = white pill, 1px navy border, navy text
 */
const variants = {
  primary: 'bg-wk-orange text-wk-navy font-bold shadow-brand enabled:hover:bg-wk-orange-hover disabled:bg-wk-line disabled:text-wk-body disabled:shadow-none disabled:opacity-100',
  gradient: 'bg-wk-orange text-wk-navy font-bold shadow-brand enabled:hover:bg-wk-orange-hover disabled:bg-wk-line disabled:text-wk-body disabled:shadow-none disabled:opacity-100',
  secondary: 'bg-white text-wk-navy border border-wk-navy enabled:hover:bg-wk-cream',
  glass: 'bg-white/15 text-white border border-white/40 enabled:hover:bg-white/25',
  outline: 'bg-white text-wk-navy border border-wk-navy enabled:hover:bg-wk-cream',
  danger: 'bg-error-600 text-white enabled:hover:bg-error-800',
  ghost: 'bg-transparent text-wk-orange-text border border-transparent enabled:hover:bg-wk-peach',
};

const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  return (
    <button
      className={twMerge(
        clsx(
          'relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2 font-ui text-sm font-semibold transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60',
          variants[variant] || variants.primary
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
