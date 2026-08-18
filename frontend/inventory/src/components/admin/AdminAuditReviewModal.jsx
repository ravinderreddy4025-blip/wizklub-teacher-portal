import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from '../../utils/toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import AuditReportDetails from '../AuditReportDetails';
import Badge from '../ui/Badge';
import AdminAuditDispatchModal, { emptyAuditDispatchForm } from './AdminAuditDispatchModal';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { resolveAssignedAm } from '../../utils/divisionAm';

function workflowBadgeType(status) {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Pending Admin Approval') return 'pending';
  return 'warning';
}

export default function AdminAuditReviewModal({
  audit,
  ams = [],
  divisions = [],
  readOnly = false,
  onClose,
  onUpdated,
}) {
  const [currentAudit, setCurrentAudit] = useState(audit);
  const [adminNotes, setAdminNotes] = useState('');
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [dispatchForm, setDispatchForm] = useState(emptyAuditDispatchForm());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCurrentAudit(audit);
    setAdminNotes('');
    setDispatchTarget(null);
    setDispatchForm(emptyAuditDispatchForm());
  }, [audit]);

  if (!currentAudit) return null;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const res = await api.put(`/admin/audit/${currentAudit._id}/approve`, { adminNotes });
      setCurrentAudit(res.data);
      toast.success('Audit approved — school warehouse updated to available quantities.');
      onUpdated?.(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve audit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      const res = await api.put(`/admin/audit/${currentAudit._id}/reject`, { adminNotes });
      setCurrentAudit(res.data);
      toast.success('Audit rejected');
      onUpdated?.(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject audit');
    } finally {
      setSubmitting(false);
    }
  };

  const openDispatchModal = (itemIndex, type, item) => {
    const assignedAm = resolveAssignedAm(currentAudit.school, divisions, ams);
    setDispatchTarget({ itemIndex, type, item });
    setDispatchForm({
      ...emptyAuditDispatchForm(),
      reportingManager: assignedAm?._id || '',
    });
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!dispatchTarget) return;
    if (!dispatchForm.consignmentNo?.trim()) {
      toast.error('Shipment consignment number is required');
      return;
    }
    const assignedAm = resolveAssignedAm(currentAudit.school, divisions, ams);
    if (!assignedAm?._id && !dispatchForm.reportingManager) {
      toast.error('No Account Manager assigned to this school division. Assign an AM before dispatching.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('itemIndex', dispatchTarget.itemIndex);
      formData.append('type', dispatchTarget.type);
      formData.append('consignmentNo', dispatchForm.consignmentNo.trim());
      if (dispatchForm.dispatchDetails) formData.append('dispatchDetails', dispatchForm.dispatchDetails);
      formData.append('reportingManager', dispatchForm.reportingManager || assignedAm._id);
      if (dispatchForm.proofPhoto) formData.append('dispatchProof', dispatchForm.proofPhoto);
      const res = await api.post(`/admin/audit/${currentAudit._id}/dispatch`, formData);
      setCurrentAudit(res.data.audit || res.data);
      setDispatchTarget(null);
      setDispatchForm(emptyAuditDispatchForm());
      const label = dispatchTarget.type === 'lost' ? 'Audit Lost Dispatch' : 'Audit Damaged Dispatch';
      toast.success(`${label} created — school can acknowledge receipt.`);
      onUpdated?.(res.data.audit || res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create dispatch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={!!currentAudit}
        onClose={onClose}
        title={`Audit review — ${formatSchoolDisplayName(currentAudit.school?.name)}`}
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge type={workflowBadgeType(currentAudit.workflowStatus)}>{currentAudit.workflowStatus}</Badge>
            <Badge type={currentAudit.status === 'Mismatch' ? 'error' : 'success'}>{currentAudit.status}</Badge>
            <span className="text-sm text-slate-600">Month: {currentAudit.month}</span>
          </div>

          <AuditReportDetails audit={currentAudit} showWorkflow />

          {currentAudit.workflowStatus === 'Pending Admin Approval' && !readOnly && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">
                Approving sets each kit&apos;s school warehouse quantity to the <strong>available</strong> count reported in this audit.
              </p>
              <Input
                label="Admin notes (optional)"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="gradient" onClick={handleApprove} disabled={submitting}>Approve quantities</Button>
                <Button variant="danger" onClick={handleReject} disabled={submitting}>Reject</Button>
              </div>
            </div>
          )}

          {currentAudit.workflowStatus === 'Approved' && !readOnly && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700">
                Dispatch lost/damaged replacements using the same flow as new dispatch — component ID is auto-generated.
              </p>
              {currentAudit.items.map((item, index) => {
                if (!item.lostQuantity && !item.damagedQuantity) return null;
                return (
                  <div key={index} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <p className="font-bold text-slate-900">{item.kit?.name}</p>
                    {item.lostQuantity > 0 && !item.lostDispatch && (
                      <Button
                        variant="outline"
                        className="text-xs"
                        disabled={submitting}
                        onClick={() => openDispatchModal(index, 'lost', item)}
                      >
                        Create Audit Lost Dispatch ({item.lostQuantity} units)
                      </Button>
                    )}
                    {item.lostDispatch && (
                      <p className="text-xs text-success-700 font-semibold">
                        Audit Lost Dispatch sent
                        {item.lostDispatch.componentId || item.lostDispatch.kitId
                          ? ` · ${item.lostDispatch.componentId || item.lostDispatch.kitId}`
                          : ''}
                        {item.lostDispatch.dispatchId ? ` · ${item.lostDispatch.dispatchId}` : ''}
                      </p>
                    )}
                    {item.damagedQuantity > 0 && !item.damagedDispatch && (
                      <Button
                        variant="outline"
                        className="text-xs"
                        disabled={submitting}
                        onClick={() => openDispatchModal(index, 'damaged', item)}
                      >
                        Create Audit Damaged Dispatch ({item.damagedQuantity} units)
                      </Button>
                    )}
                    {item.damagedDispatch && (
                      <p className="text-xs text-success-700 font-semibold">
                        Audit Damaged Dispatch sent
                        {item.damagedDispatch.componentId || item.damagedDispatch.kitId
                          ? ` · ${item.damagedDispatch.componentId || item.damagedDispatch.kitId}`
                          : ''}
                        {item.damagedDispatch.dispatchId ? ` · ${item.damagedDispatch.dispatchId}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <AdminAuditDispatchModal
        target={dispatchTarget}
        audit={currentAudit}
        ams={ams}
        divisions={divisions}
        form={dispatchForm}
        setForm={setDispatchForm}
        onClose={() => !submitting && setDispatchTarget(null)}
        onSubmit={handleDispatchSubmit}
        submitting={submitting}
      />
    </>
  );
}
