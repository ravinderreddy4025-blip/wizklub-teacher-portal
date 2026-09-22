import React from 'react';
import Button from './Button';

const IconActionButton = ({
  icon,
  label,
  variant = 'outline',
  iconSize = 16,
  loading = false,
  loadingIcon: LoadingIcon,
  className = '',
  ...props
}) => {
  const Icon = icon;
  return (
  <Button
    variant={variant}
    className={`h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 !p-0 ${variant === 'outline' ? '!border-wk-control' : ''} ${variant === 'danger' ? '!border !border-error-200 !bg-white !text-error-600 enabled:hover:!bg-error-50' : ''} ${className}`}
    title={label}
    aria-label={label}
    {...props}
  >
    {loading && LoadingIcon ? (
      <LoadingIcon size={iconSize} strokeWidth={2} className="animate-spin" />
    ) : (
      <Icon size={iconSize} strokeWidth={2} />
    )}
  </Button>
  );
};

export default IconActionButton;
