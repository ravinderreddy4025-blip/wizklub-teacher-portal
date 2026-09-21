import React from 'react';

/**
 * Read-only component / kit ID preview — same styling as Create New Dispatch modal.
 */
const ComponentIdPreview = ({
  value,
  label = 'Component ID (preview)',
  hint = 'School ID / joining year — kit id — qty (01–NN)',
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
    <div className="saas-input font-mono text-sm text-brand-primary font-bold bg-brand-primary/5 break-all min-h-[42px] flex items-center">
      {value || '—'}
    </div>
    {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
  </div>
);

export default ComponentIdPreview;
