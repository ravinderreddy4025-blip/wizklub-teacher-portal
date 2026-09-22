import React, { useMemo, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComponentIdPreview from './ComponentIdPreview';
import { previewComponentId } from '../../utils/componentId';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { resolveAssignedAm } from '../../utils/divisionAm';

function auditDispatchCategory(type) {
  return type === 'lost' ? 'Audit Lost Dispatch' : 'Audit Damaged Dispatch';
}

const emptyForm = () => ({
  consignmentNo: '',
  reportingManager: '',
  dispatchDetails: '',
});

export { emptyForm as emptyAuditDispatchForm };

function auditReplacementQuantity(item, type) {
  const qty = type === 'lost' ? item?.lostQuantity : item?.damagedQuantity;
  return Math.max(0, Number(qty) || 0);
}

export default function AdminAuditDispatchModal({
  target,
  audit,
  ams = [],
  divisions = [],
  form,
  setForm,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const school = audit?.school;
  const item = target?.item;
  const dispatchQuantity = auditReplacementQuantity(item, target?.type);
  const kit = item?.kit;

  const assignedAm = useMemo(
    () => resolveAssignedAm(school, divisions, ams),
    [school, divisions, ams],
  );

  useEffect(() => {
    if (!target || !audit) return;
    setForm((prev) => ({
      ...prev,
      reportingManager: assignedAm?._id || '',
    }));
  }, [target, audit, assignedAm, setForm]);

  const canSubmit = Boolean(
    form.consignmentNo?.trim()
    && assignedAm?._id
    && dispatchQuantity > 0,
  );

  const componentIdPreview = useMemo(
    () => previewComponentId(school, kit, dispatchQuantity),
    [school, kit, dispatchQuantity],
  );

  if (!target || !audit) return null;

  const category = auditDispatchCategory(target.type);

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title={`Create ${category}`}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
          <p><strong>School:</strong> {formatSchoolDisplayName(school?.name)}</p>
          <p><strong>Audit month:</strong> {audit.month}</p>
          <p><strong>Kit:</strong> {kit?.name}</p>
          <p>
            <strong>Dispatch quantity:</strong>{' '}
            <span className="text-brand-primary font-bold">{dispatchQuantity}</span>{' '}
            {target.type === 'lost' ? 'lost' : 'damaged'} unit(s)
          </p>
          {item?.availableQuantity != null && (
            <p className="text-xs text-slate-500">
              Audit available qty was {item.availableQuantity} — component ID uses only the {dispatchQuantity} replacement unit(s) above.
            </p>
          )}
          <p>
            <strong>Category:</strong> {category}
          </p>
          <p>
            <strong>Status:</strong> Dispatched
          </p>
          <p className="text-xs text-slate-500 pt-1">
            Same flow as new dispatch — component ID is auto-generated for this school and quantity.
            School acknowledges receipt from their dispatch hub.
          </p>
        </div>

        <div className="glass-card-frosted p-4 rounded-xl">
          <ComponentIdPreview
            value={componentIdPreview}
            label="Component ID"
            hint={`Range 01–${String(dispatchQuantity).padStart(2, '0')} for ${dispatchQuantity} replacement unit(s) only`}
          />
        </div>

        <Input
          label="Shipment consignment no."
          required
          placeholder="e.g. AWB-123456789"
          value={form.consignmentNo}
          onChange={(e) => setForm({ ...form, consignmentNo: e.target.value })}
        />

        <Input
          label="Assigned AM"
          required
          disabled
          value={assignedAm?.name || 'No AM assigned to this school division'}
        />
        {!assignedAm && (
          <p className="text-xs text-error-600 font-medium">
            Assign an Account Manager to this division before dispatching.
          </p>
        )}

        <Input
          label="Dispatch details (optional)"
          placeholder="Tracking notes or special instructions"
          value={form.dispatchDetails}
          onChange={(e) => setForm({ ...form, dispatchDetails: e.target.value })}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-wk-body">Dispatch proof photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="saas-input file:mr-3 file:rounded-lg file:border-0 file:rounded-full file:bg-wk-peach file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-wk-navy"
            onChange={(e) => setForm({ ...form, proofPhoto: e.target.files?.[0] || null })}
          />
          <p className="text-xs text-slate-500">
            Snap a photo of the package as proof. Visible to the AM and school.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="gradient" className="flex-1" disabled={submitting || !canSubmit}>
            {submitting ? 'Creating dispatch…' : `Dispatch ${dispatchQuantity} unit(s)`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
