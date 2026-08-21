import React from 'react';
import { clsx } from 'clsx';
import logoSrc from '../../assets/wizklub-logo.png';

/** Bundled logo URL (works with /inventory/ base path). Public copy kept for SES email links. */
export const BRAND_LOGO_SRC = logoSrc;

export default function BrandLogo({ className, ...props }) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt="WizKlub Futurz"
      className={clsx('object-contain shrink-0', className)}
      {...props}
    />
  );
}
