import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import IssueEvidencePanel from '../shared/IssueEvidencePanel';
import ComponentIdPreview from './ComponentIdPreview';
import { previewComponentId } from '../../utils/componentId';
import { formatSchoolDisplayName } from '../../utils/schoolName';

function replacementCategory(issueType) {
  if (issueType === 'Damaged Product') return 'Damaged Dispatch';
  if (issueType === 'Quantity Mismatch') return 'Mismatch Dispatch';
  return 'Lost Dispatch';
}

const AdminAuthorizeReplacementModal = ({
  issue,
  form,
  setForm,
  onClose,
  onSubmit,
  mode = 'approve',
}) => {
  const school = issue?.school;
  const kit = issue?.kit;
  const qty = issue?.quantityAffected;
  const isShip = mode === 'ship';

  const newKitIdPreview = useMemo(
    () => previewComponentId(school, kit, qty),
    [school, kit, qty],
  );

  const originalKitId = issue?.originalKitId
    || issue?.dispatch?.kitId
    || issue?.dispatch?.componentId
    || '—';

  if (!issue) return null;

  return (
    <Modal
      isOpen={!!issue}
      onClose={onClose}
      title={isShip ? 'Ship replacement' : 'Approve replacement'}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
          <p><strong>School:</strong> {formatSchoolDisplayName(school?.name)}</p>
          <p><strong>Kit:</strong> {kit?.name}</p>
          <p><strong>Issue type:</strong> {issue.issueType}</p>
          <p>
            <strong>Quantity:</strong>{' '}
            <span className="text-brand-primary font-bold">{qty}</span> kit(s)
          </p>
          <p>
            <strong>Dispatch ID:</strong>{' '}
            <span className="font-mono text-xs">{issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}</span>
          </p>
          <p className="text-xs text-slate-500 pt-1">
            {isShip
              ? `Shipping opens a replacement cycle, marks the dispatch Dispatched, deducts ${qty} unit(s) from warehouse, and sets category to ${replacementCategory(issue.issueType)}.`
              : 'Approval does not ship. The dispatch stays Completed and warehouse stock is unchanged until you ship.'}
          </p>
        </div>

        {isShip && (
          <div className="glass-card-frosted p-4 rounded-xl space-y-3">
            <p className="text-xs font-bold text-slate-500 normal-case tracking-normal">Kit IDs for this school</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600 normal-case tracking-normal">Original Kit ID</label>
              <div className="saas-input font-mono text-sm text-slate-700 bg-slate-50 break-all min-h-[42px] flex items-center">
                {originalKitId}
              </div>
            </div>
            <ComponentIdPreview
              value={newKitIdPreview}
              label="New Kit ID (preview)"
              hint="Auto-generated for this school when you ship"
            />
          </div>
        )}

        <IssueEvidencePanel issue={issue} />
        {isShip && (
          <div className="flex flex-col gap-1.5">
            <Input
              label="New tracking ID (consignment no.)"
              value={form.consignmentNo}
              onChange={(e) => setForm({ ...form, consignmentNo: e.target.value })}
              placeholder="Required to ship"
              required
            />
            <p className="text-xs text-slate-500">
              Required — this is the tracking ID for the replacement shipment.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-wk-body">Admin notes</label>
          <textarea
            className="saas-input min-h-[80px]"
            value={form.adminNotes}
            onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gradient" className="flex-1">
            {isShip ? 'Ship replacement' : 'Approve'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AdminAuthorizeReplacementModal;
