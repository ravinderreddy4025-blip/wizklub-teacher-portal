import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import Modal from '../ui/Modal';
import api from '../../utils/api';
import toast from '../../utils/toast';
import DivisionAmSelector from './DivisionAmSelector';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { resolveAssignedAm } from '../../utils/divisionAm';

const STEPS = ['Pick schools', 'Preview', 'Identity', 'Division & AM', 'Confirm'];

function schoolLabel(school) {
  if (!school) return '—';
  const name = formatSchoolDisplayName(school.name || school.branchName);
  return `${name} (${school.code})`;
}

const SchoolMergeWizard = ({
  isOpen,
  onClose,
  schools = [],
  divisions = [],
  ams = [],
  initialPrimary = null,
  onSuccess,
  onRefresh,
}) => {
  const [step, setStep] = useState(0);
  const [primarySchoolId, setPrimarySchoolId] = useState('');
  const [secondarySchoolId, setSecondarySchoolId] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [identitySource, setIdentitySource] = useState('primary');
  const [customIdentity, setCustomIdentity] = useState({
    name: '', code: '', wizklubSchoolId: '', joiningYear: '',
  });
  const [finalDivisionId, setFinalDivisionId] = useState('');
  const [finalAmId, setFinalAmId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [merging, setMerging] = useState(false);

  const sortedSchools = useMemo(
    () => [...schools].sort((a, b) => formatSchoolDisplayName(a.name).localeCompare(formatSchoolDisplayName(b.name))),
    [schools],
  );

  const primarySchool = sortedSchools.find((s) => String(s._id) === String(primarySchoolId));
  const secondarySchool = sortedSchools.find((s) => String(s._id) === String(secondarySchoolId));

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setPreview(null);
    setIdentitySource('primary');
    setConfirmText('');
    setPrimarySchoolId(initialPrimary?._id || '');
    setSecondarySchoolId('');
    if (initialPrimary) {
      const divId = initialPrimary.divisionId?._id || initialPrimary.divisionId || '';
      setFinalDivisionId(divId);
      const am = resolveAssignedAm(initialPrimary, divisions, ams);
      setFinalAmId(am?._id || '');
    } else {
      setFinalDivisionId('');
      setFinalAmId('');
    }
    setCustomIdentity({ name: '', code: '', wizklubSchoolId: '', joiningYear: '' });
  }, [isOpen, initialPrimary, divisions, ams]);

  useEffect(() => {
    if (!finalDivisionId) {
      setFinalAmId('');
      return;
    }
    const am = resolveAssignedAm({ divisionId: finalDivisionId }, divisions, ams);
    setFinalAmId(am?._id || '');
  }, [finalDivisionId, divisions, ams]);

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await api.post('/admin/schools/merge/preview', {
        primarySchoolId,
        secondarySchoolId,
      });
      setPreview(res.data);
      if (!res.data.canMerge) {
        toast.error('Resolve blocking conflicts before merging');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load merge preview');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!primarySchoolId || !secondarySchoolId) {
        toast.error('Select both schools');
        return;
      }
      if (primarySchoolId === secondarySchoolId) {
        toast.error('Select two different schools');
        return;
      }
      setStep(1);
      await loadPreview();
      return;
    }
    if (step === 1) {
      if (!preview?.canMerge) {
        toast.error('Resolve blocking conflicts before continuing');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (identitySource === 'custom') {
        if (!customIdentity.name.trim() || !customIdentity.code.trim()) {
          toast.error('Name and school code are required for custom identity');
          return;
        }
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!finalDivisionId) {
        toast.error('Select a final division');
        return;
      }
      setStep(4);
      return;
    }
  };

  const handleMerge = async () => {
    if (confirmText.trim().toUpperCase() !== 'MERGE') {
      toast.error('Type MERGE to confirm');
      return;
    }
    setMerging(true);
    try {
      const res = await api.post('/admin/schools/merge', {
        primarySchoolId,
        secondarySchoolId,
        identitySource,
        customIdentity: identitySource === 'custom' ? {
          ...customIdentity,
          joiningYear: customIdentity.joiningYear === '' ? null : Number(customIdentity.joiningYear),
        } : undefined,
        finalDivisionId,
        finalAmId: finalAmId || undefined,
      });
      toast.success(`Merged successfully — ${res.data.transferred?.dispatches || 0} dispatches transferred`);
      onSuccess?.(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const footer = (
    <div className="flex w-full gap-2">
      {step > 0 && (
        <button type="button" className="stitch-btn-secondary flex-1" onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft size={16} className="inline mr-1" />
          Back
        </button>
      )}
      {step < 4 ? (
        <button type="button" className="stitch-btn-primary flex-1" onClick={handleNext} disabled={previewLoading}>
          {previewLoading ? 'Loading…' : 'Next'}
          {!previewLoading && <ArrowRight size={16} className="inline ml-1" />}
        </button>
      ) : (
        <button type="button" className="stitch-btn-primary flex-1" onClick={handleMerge} disabled={merging}>
          {merging ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Merge schools'}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Merge schools — ${STEPS[step]}`}
      footer={footer}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex gap-1">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-wk-orange' : 'bg-wk-line'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-wk-muted">
              The primary school keeps its record ID. The secondary school will be absorbed and deleted.
            </p>
            <div className="space-y-2">
              <label className="stitch-label">Primary school (survivor)</label>
              <select className="stitch-input" value={primarySchoolId} onChange={(e) => setPrimarySchoolId(e.target.value)}>
                <option value="">Select primary school</option>
                {sortedSchools.map((school) => (
                  <option key={school._id} value={school._id} disabled={school._id === secondarySchoolId}>
                    {schoolLabel(school)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="stitch-label">Secondary school (absorbed)</label>
              <select className="stitch-input" value={secondarySchoolId} onChange={(e) => setSecondarySchoolId(e.target.value)}>
                <option value="">Select secondary school</option>
                {sortedSchools.map((school) => (
                  <option key={school._id} value={school._id} disabled={school._id === primarySchoolId}>
                    {schoolLabel(school)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {previewLoading ? (
              <p className="text-sm text-wk-muted">Loading preview…</p>
            ) : preview ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-wk-line p-3 text-sm">
                    <p className="font-semibold text-wk-ink">Primary</p>
                    <p>{schoolLabel(preview.primary)}</p>
                    <p className="text-wk-muted">{preview.primary?.division?.name || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-wk-line p-3 text-sm">
                    <p className="font-semibold text-wk-ink">Secondary</p>
                    <p>{schoolLabel(preview.secondary)}</p>
                    <p className="text-wk-muted">{preview.secondary?.division?.name || '—'}</p>
                  </div>
                </div>
                <ul className="space-y-1 text-sm text-wk-ink">
                  <li>Total dispatches after merge: {preview.counts.dispatches.total}</li>
                  <li>Receipt issues to transfer: {preview.counts.receiptIssues}</li>
                  <li>Replacement requests: {preview.counts.replacementRequests}</li>
                  <li>Inventory rows: {preview.counts.inventoryRows}</li>
                  <li>Audit reports: {preview.counts.auditReports}</li>
                </ul>
                {preview.warnings.inventoryOverlaps > 0 && (
                  <p className="text-sm text-amber-700">
                    {preview.warnings.inventoryOverlaps} kit(s) exist in both schools — quantities will be summed.
                  </p>
                )}
                {preview.warnings.auditMonthOverlaps?.length > 0 && (
                  <p className="text-sm text-amber-700">
                    Audit month overlap: {preview.warnings.auditMonthOverlaps.join(', ')} — line items will be merged.
                  </p>
                )}
                {preview.blockingConflicts?.length > 0 && (
                  <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700">
                    <p className="font-semibold">Blocking conflicts</p>
                    <ul className="mt-1 list-inside list-disc">
                      {preview.blockingConflicts.map((row, index) => (
                        <li key={index}>{row.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-wk-muted">No preview loaded.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-wk-muted">Choose which identity the merged school will use.</p>
            {['primary', 'secondary', 'custom'].map((option) => (
              <label key={option} className="flex cursor-pointer items-start gap-3 rounded-xl border border-wk-line p-3">
                <input
                  type="radio"
                  name="identitySource"
                  value={option}
                  checked={identitySource === option}
                  onChange={() => setIdentitySource(option)}
                  className="mt-1"
                />
                <div className="text-sm">
                  <p className="font-semibold capitalize text-wk-ink">{option === 'custom' ? 'New custom identity' : `Use ${option} school`}</p>
                  {option === 'primary' && primarySchool && (
                    <p className="text-wk-muted">{schoolLabel(primarySchool)}</p>
                  )}
                  {option === 'secondary' && secondarySchool && (
                    <p className="text-wk-muted">{schoolLabel(secondarySchool)}</p>
                  )}
                  {option === 'custom' && <p className="text-wk-muted">Enter new name, code, and portal ID</p>}
                </div>
              </label>
            ))}
            {identitySource === 'custom' && (
              <div className="space-y-2 rounded-xl border border-wk-line bg-wk-cream p-4">
                <input className="stitch-input" placeholder="Branch name" value={customIdentity.name} onChange={(e) => setCustomIdentity((p) => ({ ...p, name: e.target.value }))} />
                <input className="stitch-input" placeholder="School code" value={customIdentity.code} onChange={(e) => setCustomIdentity((p) => ({ ...p, code: e.target.value }))} />
                <input className="stitch-input" placeholder="WizKlub portal ID (optional)" value={customIdentity.wizklubSchoolId} onChange={(e) => setCustomIdentity((p) => ({ ...p, wizklubSchoolId: e.target.value }))} />
                <input className="stitch-input" type="number" placeholder="Joining year" value={customIdentity.joiningYear} onChange={(e) => setCustomIdentity((p) => ({ ...p, joiningYear: e.target.value }))} />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <DivisionAmSelector
              divisionId={finalDivisionId}
              onDivisionChange={setFinalDivisionId}
              divisions={divisions}
              ams={ams}
              onRefresh={onRefresh}
            />
            <div className="space-y-2">
              <label className="stitch-label">Final Account Manager</label>
              <select className="stitch-input" value={finalAmId} onChange={(e) => setFinalAmId(e.target.value)}>
                <option value="">Use division AM</option>
                {ams.map((am) => (
                  <option key={am._id} value={am._id}>{am.name} ({am.email})</option>
                ))}
              </select>
              <p className="text-xs text-wk-muted">Selecting an AM will assign them to the final division.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-wk-line bg-wk-cream p-4 text-sm space-y-1">
              <p><span className="font-semibold">Survivor:</span> {schoolLabel(primarySchool)}</p>
              <p><span className="font-semibold">Absorbed:</span> {schoolLabel(secondarySchool)}</p>
              <p><span className="font-semibold">Identity:</span> {identitySource}</p>
              <p><span className="font-semibold">Final division:</span> {divisions.find((d) => String(d._id) === String(finalDivisionId))?.name || '—'}</p>
              <p><span className="font-semibold">Dispatches transferred:</span> {preview?.counts?.dispatches?.secondary || 0}</p>
            </div>
            <p className="text-sm text-wk-muted">
              Historical component IDs will be kept as-is. Type <strong>MERGE</strong> to confirm.
            </p>
            <input
              className="stitch-input"
              placeholder="Type MERGE to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SchoolMergeWizard;
