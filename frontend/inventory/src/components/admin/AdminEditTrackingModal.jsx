import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { getDispatchTrackingValue, isTrackingOverdue } from '../../utils/dispatchTracking';

const AdminEditTrackingModal = ({
  dispatch,
  isOpen,
  onClose,
  onSubmit,
  submitting,
}) => {
  const [consignmentNo, setConsignmentNo] = useState('');

  useEffect(() => {
    if (!isOpen || !dispatch) return;
    setConsignmentNo(getDispatchTrackingValue(dispatch));
  }, [isOpen, dispatch]);

  if (!isOpen || !dispatch) return null;

  const existing = getDispatchTrackingValue(dispatch);
  const overdue = isTrackingOverdue(dispatch);
  const title = existing ? 'Edit tracking' : 'Add tracking';

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = consignmentNo.trim();
    if (!trimmed) return;
    onSubmit({ consignmentNo: trimmed });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-xs font-bold text-slate-500 normal-case tracking-normal">Dispatch ID</p>
          <p className="font-mono text-sm font-bold text-brand-primary break-all">
            {dispatch.dispatchId || dispatch._id}
          </p>
          <p className="text-xs text-slate-600 pt-1">{dispatch.kit?.name || 'Kit'}</p>
        </div>

        {overdue && (
          <div className="rounded-xl border border-error-200 bg-error-50/50 p-3">
            <p className="text-sm font-semibold text-error-800">
              Tracking is overdue (more than 24 hours since dispatch). Add it now.
            </p>
          </div>
        )}

        <Input
          label="Tracking ID (consignment no.)"
          required
          value={consignmentNo}
          onChange={(e) => setConsignmentNo(e.target.value)}
          placeholder="e.g. AWB-123456789"
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gradient"
            className="flex-1"
            disabled={submitting || !consignmentNo.trim()}
          >
            {submitting ? 'Saving…' : 'Save tracking'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AdminEditTrackingModal;
