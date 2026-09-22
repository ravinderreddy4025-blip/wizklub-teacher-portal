import React, { useEffect, useState } from 'react';
import { Camera, Video, Upload } from 'lucide-react';
import Input from '@inventory/components/ui/Input';
import Button from '@inventory/components/ui/Button';

const ISSUE_TYPES = [
  { value: 'Missing Product', label: 'Missing product' },
  { value: 'Damaged Product', label: 'Damaged product' },
  { value: 'Quantity Mismatch', label: 'Quantity mismatch' },
];

const emptyItemState = (dispatch) => {
  const issue = dispatch.receiptIssue;
  const quantitySent = dispatch.quantity ?? 0;

  if (issue) {
    const isReplacementAck = issue.status === 'Approved';
    const defaultReceived = Math.max(0, quantitySent > 0 ? quantitySent - 1 : 0);
    const priorReceived = Number(issue.quantityReceived);
    const quantityReceived = isReplacementAck
      ? defaultReceived
      : Math.min(Number.isNaN(priorReceived) ? defaultReceived : priorReceived, quantitySent);

    return {
      dispatchId: dispatch._id,
      kitName: dispatch.kit?.name || 'Kit',
      quantitySent,
      quantityReceived,
      issueType: isReplacementAck ? '' : issue.issueType,
      damageDescription: isReplacementAck ? '' : (issue.damageDescription || ''),
      severity: issue.severity || 'Minor Damage',
      remarks: isReplacementAck ? '' : (issue.remarks || ''),
      photos: [],
      video: null,
    };
  }

  return {
    dispatchId: dispatch._id,
    kitName: dispatch.kit?.name || 'Kit',
    quantitySent,
    quantityReceived: Math.max(0, quantitySent > 0 ? quantitySent - 1 : 0),
    issueType: '',
    damageDescription: '',
    severity: 'Minor Damage',
    remarks: '',
    photos: [],
    video: null,
  };
};

const EvidenceUploadBox = ({ label, hint, accept, multiple, icon: Icon, files, onChange, required }) => (
  <div className="rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary">
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">
          {label}
          {required && <span className="text-error-500"> *</span>}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onChange}
          className="mt-3 w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:rounded-full file:bg-wk-orange file:text-wk-navy file:font-semibold file:cursor-pointer"
        />
        {files?.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-success-700">
            {files.length} file{files.length === 1 ? '' : 's'} selected
          </p>
        )}
        {files?.name && (
          <p className="mt-2 text-xs font-semibold text-success-700">Video selected: {files.name}</p>
        )}
      </div>
    </div>
  </div>
);

const ReportIssueStep = ({ items, receiverName, setReceiverName, receivedDate, setReceivedDate, notes, setNotes, onBack, onSubmit, submitting, editMode = false }) => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const next = (items || []).map(emptyItemState);
    setRows(next);
  }, [items]);

  const clampReceived = (sent, value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.min(Math.max(0, n), sent);
  };

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.quantityReceived !== undefined) {
        next.quantityReceived = clampReceived(row.quantitySent, patch.quantityReceived);
      }
      return next;
    }));
  };

  const affectedQty = (row) => Math.max(0, row.quantitySent - (Number(row.quantityReceived) || 0));

  const validate = () => {
    if (!receiverName.trim()) return 'Receiver name is required';
    if (!receivedDate) return 'Received date is required';

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.issueType) {
        return `Select an issue type for ${row.kitName}`;
      }

      const received = Number(row.quantityReceived);
      if (Number.isNaN(received) || received < 0 || received > row.quantitySent) {
        return `Received OK cannot exceed sent quantity (${row.quantitySent}) for ${row.kitName}`;
      }
      if (affectedQty(row) < 1) {
        return `Enter how many are affected for ${row.kitName} (received must be less than sent)`;
      }
      if (!row.remarks.trim()) {
        return `Remarks are required for ${row.kitName}`;
      }
      if (row.photos.length < 1 && !row.video) {
        const existingIssue = items?.[0]?.receiptIssue;
        const hasExistingEvidence = (existingIssue?.photoUrls?.length || 0) > 0
          || (existingIssue?.videoUrls?.length || 0) > 0;
        if (!editMode || !hasExistingEvidence) {
          return `Upload at least one photo or a video for ${row.kitName}`;
        }
      }
      if (row.issueType === 'Damaged Product' && !row.damageDescription.trim()) {
        return `Damage description is required for ${row.kitName}`;
      }
    }
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const error = validate();
    if (error) return onSubmit(null, error);
    onSubmit({
      receiverName: receiverName.trim(),
      receivedDate,
      receiptNotes: notes.trim(),
      rows,
    });
  };

  const primary = items?.[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-warning-200 bg-warning-50/50 p-4 space-y-2">
        <p className="text-sm font-semibold text-warning-800">
          Received with issues — report missing, damaged, or mismatched kits for this dispatch ID.
        </p>
        <p className="text-xs text-warning-700">
          Upload clear photo or video evidence. AM reviews first, then admin authorizes replacement quantity under the same dispatch ID (new tracking number may apply).
        </p>
        {primary?.dispatchId && (
          <p className="text-xs font-mono font-bold text-slate-700">Dispatch ID: {primary.dispatchId}</p>
        )}
      </div>

      <Input label="Receiver name" required value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
      <Input type="date" label="Received date" required max={new Date().toISOString().slice(0, 10)} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="clean-table text-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th>Sent</th>
              <th>Received OK</th>
              <th>Affected qty</th>
              <th>Issue type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.dispatchId}>
                <td className="font-semibold text-slate-900">{row.kitName}</td>
                <td>{row.quantitySent}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={row.quantitySent}
                    className={`saas-input w-20 py-1.5 text-sm ${Number(row.quantityReceived) > row.quantitySent ? 'border-error-500 ring-1 ring-error-300' : ''}`}
                    value={row.quantityReceived}
                    onChange={(e) => updateRow(index, { quantityReceived: e.target.value })}
                  />
                  {Number(row.quantityReceived) > row.quantitySent && (
                    <p className="text-xs text-error-600 mt-1">Max {row.quantitySent}</p>
                  )}
                </td>
                <td className="font-medium text-warning-700">
                  {row.issueType ? affectedQty(row) : '—'}
                </td>
                <td>
                  <select
                    className="saas-input py-1.5 text-sm min-w-[170px]"
                    value={row.issueType}
                    onChange={(e) => {
                      const issueType = e.target.value;
                      updateRow(index, {
                        issueType,
                        quantityReceived: Math.min(
                          Number(row.quantityReceived) || 0,
                          row.quantitySent - 1,
                        ),
                      });
                    }}
                    required
                  >
                    <option value="" disabled>Select issue type</option>
                    {ISSUE_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.map((row, index) => row.issueType && (
        <div key={`detail-${row.dispatchId}`} className="rounded-xl border-2 border-warning-200 bg-white p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-warning-600" />
            <p className="font-bold text-slate-900">
              {row.kitName} — {row.issueType} · {affectedQty(row)} kit(s) for AM review
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">Remarks (required)</label>
            <textarea
              className="saas-input min-h-[72px]"
              required
              value={row.remarks}
              onChange={(e) => updateRow(index, { remarks: e.target.value })}
              placeholder={
                row.issueType === 'Missing Product'
                  ? 'Describe missing items, tampered box, or courier loss...'
                  : row.issueType === 'Damaged Product'
                    ? 'Describe the damage observed...'
                    : 'Explain the quantity mismatch...'
              }
            />
          </div>

          {row.issueType === 'Damaged Product' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-wk-body">Damage description (required)</label>
                <textarea
                  className="saas-input min-h-[72px]"
                  required
                  value={row.damageDescription}
                  onChange={(e) => updateRow(index, { damageDescription: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-wk-body">Severity</label>
                <select className="saas-input" value={row.severity} onChange={(e) => updateRow(index, { severity: e.target.value })}>
                  <option value="Minor Damage">Minor damage</option>
                  <option value="Major Damage">Major damage</option>
                </select>
              </div>
            </>
          )}

          <EvidenceUploadBox
            label="Photo evidence"
            hint="Upload one or more clear photos of the issue (required if no video)."
            accept="image/*"
            multiple
            icon={Camera}
            files={row.photos}
            onChange={(e) => updateRow(index, { photos: Array.from(e.target.files || []).slice(0, 5) })}
          />

          <EvidenceUploadBox
            label="Video evidence"
            hint="Optional short video (mp4, webm, mov) — use if photos are not enough."
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            multiple={false}
            icon={Video}
            files={row.video}
            onChange={(e) => updateRow(index, { video: e.target.files?.[0] || null })}
          />
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-wk-body">General notes (optional)</label>
        <textarea className="saas-input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-3 pt-2">
        {onBack && (
          <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Back</Button>
        )}
        <Button type="submit" variant="gradient" className={onBack ? 'flex-1' : 'w-full'} disabled={submitting}>
          {submitting ? 'Submitting…' : editMode ? 'Save changes' : 'Submit for AM approval'}
        </Button>
      </div>
    </form>
  );
};

export default ReportIssueStep;
