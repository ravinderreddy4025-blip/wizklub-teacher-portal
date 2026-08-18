import React from 'react';
import { clsx } from 'clsx';

const base = String(import.meta.env.BASE_URL || '/');
export const BRAND_LOGO_SRC = `${base}wizklub-logo.png`.replace(/\/{2,}/g, '/');

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
