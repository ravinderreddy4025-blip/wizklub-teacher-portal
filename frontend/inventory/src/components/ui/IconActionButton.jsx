import React from 'react';
import Button from './Button';

const IconActionButton = ({
  icon: Icon,
  label,
  variant = 'outline',
  iconSize = 16,
  loading = false,
  loadingIcon: LoadingIcon,
  className = '',
  ...props
}) => (
  <Button
    variant={variant}
    className={`p-1.5 min-w-[2rem] min-h-[2rem] shrink-0 ${className}`}
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

export default IconActionButton;
