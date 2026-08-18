import React from 'react';

const accentStyles = {
  primary: {
    bar: 'border-t-[#F89C28]',
    icon: 'bg-[#F89C28]/10 text-[#F89C28]',
    valueHover: 'group-hover:text-[#F89C28]',
  },
  blue: {
    bar: 'border-t-[#F7941D]',
    icon: 'bg-orange-50 text-[#F7941D]',
    valueHover: 'group-hover:text-[#F7941D]',
  },
  success: {
    bar: 'border-t-[#22C55E]',
    icon: 'bg-[#22C55E]/10 text-[#22C55E]',
    valueHover: 'group-hover:text-[#22C55E]',
  },
  warning: {
    bar: 'border-t-[#F59E0B]',
    icon: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    valueHover: 'group-hover:text-[#F59E0B]',
  },
  error: {
    bar: 'border-t-[#EF4444]',
    icon: 'bg-[#EF4444]/10 text-[#EF4444]',
    valueHover: 'group-hover:text-[#EF4444]',
  },
  slate: {
    bar: 'border-t-[#E5E7EB]',
    icon: 'bg-[#F8FAFC] text-[#6B7280]',
    valueHover: 'group-hover:text-[#1F2937]',
  },
};

const StatCard = ({ label, value, hint, accent = 'primary', icon: Icon, progress }) => {
  const style = accentStyles[accent] || accentStyles.primary;
  return (
    <div
      className={`stitch-kpi group relative overflow-hidden transition-shadow hover:shadow-md ${style.bar}`}
      role="group"
      aria-label={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</h3>
          <p className={`mt-0.5 font-heading text-xl font-bold leading-none text-[#1F2937] transition-colors sm:text-2xl ${style.valueHover}`}>
            {value}
          </p>
        </div>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${style.icon}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      {typeof progress === 'number' ? (
        <div className="mt-2 h-1 w-full rounded-full bg-[#F8FAFC]">
          <div
            className="h-1 rounded-full bg-[#F89C28]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : (
        hint && <p className="text-[11px] leading-snug text-[#6B7280]">{hint}</p>
      )}
    </div>
  );
};

export default StatCard;
