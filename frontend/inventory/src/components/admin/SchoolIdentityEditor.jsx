import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import Button from '../ui/Button';
import { formatSchoolIdentityPrefix } from '../../utils/componentId';

const SchoolIdentityEditor = ({
  school,
  onSave,
  compact = false,
  className = '',
}) => {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(school?.code || '');
  const [joiningYear, setJoiningYear] = useState(
    school?.joiningYear != null ? String(school.joiningYear) : '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCode(school?.code || '');
    setJoiningYear(school?.joiningYear != null ? String(school.joiningYear) : '');
    setEditing(false);
  }, [school?._id, school?.code, school?.joiningYear]);

  const previewPrefix = useMemo(() => {
    if (!code.trim()) return '—';
    const yearValue = joiningYear.trim() ? Number(joiningYear) : school?.joiningYear;
    return formatSchoolIdentityPrefix(code, yearValue);
  }, [code, joiningYear, school?.joiningYear]);

  const handleSave = async () => {
    if (!code.trim()) return;
    setSaving(true);
    try {
      await onSave({
        code: code.trim(),
        joiningYear: joiningYear.trim() ? Number(joiningYear) : null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className={`flex items-start justify-between gap-2 ${className}`}>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-medium">
            ID: <span className="font-mono text-slate-700">{previewPrefix}</span>
          </p>
          {school?.code && school.code !== previewPrefix.split('/')[0] && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Login: <span className="font-mono">{school.code}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-orange-light/20 transition-colors"
          title="Edit school ID and joining year"
          aria-label="Edit school ID and joining year"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3 ${className}`}>
      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">School ID</span>
          <input
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-mono outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BENG-0010 or beng0010"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Joining year</span>
          <input
            type="number"
            min={2000}
            max={2099}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
            value={joiningYear}
            onChange={(e) => setJoiningYear(e.target.value)}
            placeholder="2025"
          />
        </label>
      </div>
      <p className="text-[10px] text-slate-500">
        Component prefix: <span className="font-mono font-semibold text-brand-primary">{previewPrefix}</span>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="gradient"
          className="text-xs py-1.5 px-3 h-auto"
          disabled={saving || !code.trim()}
          onClick={handleSave}
        >
          <Check size={14} className="mr-1" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-xs py-1.5 px-3 h-auto"
          disabled={saving}
          onClick={() => {
            setCode(school?.code || '');
            setJoiningYear(school?.joiningYear != null ? String(school.joiningYear) : '');
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default SchoolIdentityEditor;
