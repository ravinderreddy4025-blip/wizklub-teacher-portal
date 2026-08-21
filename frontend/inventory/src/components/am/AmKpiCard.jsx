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
    slate: 'text-[#6B7280]',
    orange: 'text-[#F89C28]',
    green: 'text-[#16A34A]',
    amber: 'text-[#D97706]',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${accents[accent]}`}>{label}</p>
        {Icon && <Icon size={16} className={accents[accent]} />}
      </div>
      <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-[#1F2937]">{value}</p>
      {secondary ? <p className="mt-1 text-sm font-semibold text-[#1F2937]">{secondary}</p> : null}
      {hint ? <p className="mt-1 text-[11px] text-[#6B7280]">{hint}</p> : null}
    </>
  );
  const className = 'rounded-xl border border-[#E5E7EB] bg-white p-4';
  if (to) {
    return (
      <Link to={to} className={`${className} block transition hover:border-[#F89C28]/50 hover:shadow-sm`}>
        {inner}
      </Link>
    );
  }
  return <article className={className}>{inner}</article>;
}
