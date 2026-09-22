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
  const [wizklubSchoolId, setWizklubSchoolId] = useState(school?.wizklubSchoolId || '');
  const [joiningYear, setJoiningYear] = useState(
    school?.joiningYear != null ? String(school.joiningYear) : '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCode(school?.code || '');
    setWizklubSchoolId(school?.wizklubSchoolId || '');
    setJoiningYear(school?.joiningYear != null ? String(school.joiningYear) : '');
    setEditing(false);
  }, [school?._id, school?.code, school?.wizklubSchoolId, school?.joiningYear]);

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
        wizklubSchoolId: wizklubSchoolId.trim() || null,
        joiningYear: joiningYear.trim() ? Number(joiningYear) : null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const srCode = school?.code || previewPrefix;
    const originalId = school?.wizklubSchoolId;

    return (
      <div className={`flex items-start justify-between gap-2 ${className}`}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            {srCode && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200">
                <span className="font-sans font-semibold text-slate-500">SR Code:</span>
                <span className="font-bold text-slate-900">{srCode}</span>
              </span>
            )}
            {originalId && originalId !== srCode && (
              <span className="inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-0.5 text-brand-primary border border-orange-200">
                <span className="font-sans font-semibold text-orange-600">School ID:</span>
                <span className="font-bold text-orange-900">{originalId}</span>
              </span>
            )}
          </div>
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
      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-500">SR Code</span>
          <input
            className="h-10 rounded-xl border border-wk-control bg-white px-3 text-sm font-mono outline-none focus:border-wk-orange-text focus:ring-1 focus:ring-wk-orange-text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SC-009/22"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-500">School ID (WizKlub)</span>
          <input
            className="h-10 rounded-xl border border-wk-control bg-white px-3 text-sm font-mono outline-none focus:border-wk-orange-text focus:ring-1 focus:ring-wk-orange-text"
            value={wizklubSchoolId}
            onChange={(e) => setWizklubSchoolId(e.target.value)}
            placeholder="beng0010"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-500">Joining year</span>
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
      <p className="text-xs text-slate-500">
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
            setWizklubSchoolId(school?.wizklubSchoolId || '');
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
