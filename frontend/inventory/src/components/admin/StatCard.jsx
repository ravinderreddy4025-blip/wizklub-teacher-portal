import React from 'react';

const accentStyles = {
  primary: {
    bar: 'border-t-wk-orange',
    icon: 'bg-wk-peach text-wk-orange-text',
    valueHover: 'group-hover:text-wk-orange-text',
  },
  blue: {
    bar: 'border-t-wk-orange',
    icon: 'bg-info-50 text-info-600',
    valueHover: 'group-hover:text-wk-orange-text',
  },
  success: {
    bar: 'border-t-success-500',
    icon: 'bg-success-100 text-success-700',
    valueHover: 'group-hover:text-success-700',
  },
  warning: {
    bar: 'border-t-warning-500',
    icon: 'bg-warning-50 text-warning-700',
    valueHover: 'group-hover:text-warning-700',
  },
  error: {
    bar: 'border-t-error-500',
    icon: 'bg-error-50 text-error-600',
    valueHover: 'group-hover:text-error-600',
  },
  slate: {
    bar: 'border-t-wk-line',
    icon: 'bg-wk-mist text-wk-body',
    valueHover: 'group-hover:text-wk-ink',
  },
};

const StatCard = ({ label, value, hint, accent = 'primary', icon: Icon, progress }) => {
  const style = accentStyles[accent] || accentStyles.primary;
  return (
    <div
      className={"stitch-kpi group relative overflow-hidden"}
      role="group"
      aria-label={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-wk-body">{label}</h3>
          <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums text-wk-ink">
            {value}
          </p>
        </div>
        {Icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.icon}`}>
            <Icon size={18} aria-hidden />
          </span>
        )}
      </div>
      {typeof progress === 'number' ? (
        <div className="mt-2 h-1.5 w-full rounded-full bg-wk-line">
          <div
            className="h-1.5 rounded-full bg-wk-orange"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : (
        hint && <p className="text-xs leading-snug text-wk-muted">{hint}</p>
      )}
    </div>
  );
};

export default StatCard;
