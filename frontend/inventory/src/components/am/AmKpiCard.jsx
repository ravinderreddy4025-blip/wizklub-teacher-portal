import React from 'react';
import { Link } from 'react-router-dom';

export default function AmKpiCard({
  label,
  value,
  hint,
  secondary,
  icon: Icon,
  accent = 'slate',
  to,
}) {
  const accents = {
    slate: 'text-wk-muted',
    orange: 'text-wk-orange-text',
    green: 'text-success-700',
    amber: 'text-warning-700',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${accents[accent]}`}>{label}</p>
        {Icon && <Icon size={16} className={accents[accent]} />}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-wk-ink">{value}</p>
      {secondary ? <p className="mt-1 text-sm font-semibold text-wk-ink">{secondary}</p> : null}
      {hint ? <p className="mt-1 text-xs text-wk-muted">{hint}</p> : null}
    </>
  );
  const className = 'rounded-xl border border-wk-line bg-white p-4';
  if (to) {
    return (
      <Link to={to} className={`${className} block transition hover:border-wk-peach-2 hover:shadow-sm`}>
        {inner}
      </Link>
    );
  }
  return <article className={className}>{inner}</article>;
}
