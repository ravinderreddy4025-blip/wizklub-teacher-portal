import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@inventory/components/ui/Modal';
import Input from '@inventory/components/ui/Input';
import Button from '@inventory/components/ui/Button';
import SlideToConfirm from '@inventory/components/ui/SlideToConfirm';
import ReportIssueStep from './ReportIssueStep';
import { isReplacementAwaitingReceipt } from '@inventory/utils/schoolDispatch';
import { clsx } from 'clsx';

const todayIso = () => new Date().toISOString().slice(0, 10);

const DispatchReceiptModal = ({
  consignment,
  isOpen,
  onClose,
  onSubmit,
  onReportIssues,
  submitting,
}) => {
  const items = useMemo(() => consignment?.items || [], [consignment]);
  const primary = items[0];
  const sent = primary?.quantity ?? 0;
  const editMode = !!consignment?.editMode;
  const hideNotReceivedOption = editMode;
  const isReplacementReceipt = isReplacementAwaitingReceipt(primary);

  const [step, setStep] = useState('choose');
  const [selectedOption, setSelectedOption] = useState(null);
  const [receiverName, setReceiverName] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [deliveryPhoto, setDeliveryPhoto] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !primary) return;
    const issue = primary.receiptIssue;

    if (editMode) {
      if (issue?.issueType === 'Shipment Not Received') {
        setStep('choose');
      } else if (issue) {
        setStep('report_issue');
      } else {
        setStep('choose');
      }
    } else if (primary.status === 'Not Received' && !issue) {
      setStep('not_received');
    } else {
      setStep('choose');
    }

    setSelectedOption(null);
    setReceiverName(primary.receiverName || issue?.receiverName || '');
    setReceivedDate(
      primary.receivedAt || issue?.receivedAt
        ? new Date(primary.receivedAt || issue.receivedAt).toISOString().slice(0, 10)
        : todayIso(),
    );
    setDeliveryPhoto(null);
    setNotes(primary.receiptNotes || issue?.remarks || '');
  }, [isOpen, primary, editMode]);

  const confirmSelectedOption = () => {
    if (selectedOption === 'all_received') setStep('all_received');
    else if (selectedOption === 'report_issue') setStep('report_issue');
    else if (selectedOption === 'not_received' && !hideNotReceivedOption) setStep('not_received');
  };

  if (!isOpen || !primary) {
    return null;
  }

  const dispatchSummary = (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
      <p className="text-xs font-bold text-slate-500 normal-case tracking-normal">Dispatch ID</p>
      <p className="font-mono text-sm font-bold text-brand-primary break-all">
        {primary.dispatchId || primary._id}
      </p>
      <p className="font-bold text-slate-900 pt-1">{primary.kit?.name}</p>
      <p className="text-xs text-slate-500">Kit ID: {primary.kitId || '—'}</p>
      <p className="text-xs text-slate-500">Tracking ID: {primary.consignmentNo || primary.trackingId || '—'}</p>
      <p className="text-sm font-semibold text-brand-primary">
        Kits sent: <span className="text-slate-900">{sent}</span>
      </p>
    </div>
  );

  const submitAllReceived = async (e) => {
    e.preventDefault();
    onSubmit({
      receiptType: 'all_received',
      items,
      receiverName: receiverName.trim(),
      receivedDate,
      receiptNotes: notes.trim(),
      deliveryPhoto,
      replaceReceipt: editMode,
    });
  };

  const submitNotReceived = async (e) => {
    e.preventDefault();
    onReportIssues({
      isEdit: false,
      receiverName: '',
      receivedDate: todayIso(),
      receiptNotes: '',
      rows: [{
        dispatchId: primary._id,
        quantityReceived: 0,
        issueType: 'Shipment Not Received',
        remarks: '',
      }],
    });
  };

  const handleReportIssues = (payload, validationError) => {
    if (validationError) {
      return onReportIssues(null, validationError);
    }
    onReportIssues({ ...payload, replaceReceipt: editMode });
  };

  const modalTitle = editMode
    ? 'Edit acknowledgment'
    : step === 'choose'
      ? 'Acknowledge receipt'
      : isReplacementReceipt
        ? 'Confirm replacement received'
        : 'Shipment received by school';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} className="max-w-2xl">
      {step === 'choose' && (
        <div className="space-y-5">
          {dispatchSummary}
          {isReplacementReceipt && (
            <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-3">
              <p className="text-sm font-semibold text-brand-primary">
                Latest redispatch ({sent} kit{sent === 1 ? '' : 's'}) — confirm with Option A if everything is correct, or Option B if there are new problems.
              </p>
            </div>
          )}
          {editMode && primary?.receiptIssue?.issueType === 'Shipment Not Received' && (
            <div className="rounded-xl border border-warning-200 bg-warning-50/50 p-3">
              <p className="text-sm font-semibold text-warning-800">
                You reported this shipment as not received. Choose Option A or B below to update your acknowledgment.
              </p>
            </div>
          )}
          <p className="text-sm text-slate-600">
            {editMode ? 'Update how this shipment arrived at your school:' : 'How did this shipment arrive at your school?'}
          </p>
          <div className="space-y-3" role="radiogroup" aria-label="Receipt outcome">
            <button
              type="button"
              role="radio"
              aria-checked={selectedOption === 'all_received'}
              onClick={() => setSelectedOption('all_received')}
              className={clsx(
                'w-full text-left rounded-xl border-2 p-4 transition-colors',
                selectedOption === 'all_received'
                  ? 'border-success-500 bg-success-50 ring-2 ring-success-200'
                  : 'border-success-200 bg-success-50/50 hover:border-success-400 hover:bg-success-50',
              )}
            >
              <p className="font-bold text-success-800">Option A — Everything received correctly</p>
              <p className="text-sm text-success-700 mt-1">
                {isReplacementReceipt
                  ? `Confirm all ${sent} kit(s) from the latest shipment — closes this dispatch.`
                  : 'All items verified and in good condition.'}
              </p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selectedOption === 'report_issue'}
              onClick={() => setSelectedOption('report_issue')}
              className={clsx(
                'w-full text-left rounded-xl border-2 p-4 transition-colors',
                selectedOption === 'report_issue'
                  ? 'border-warning-500 bg-warning-50 ring-2 ring-warning-200'
                  : 'border-warning-200 bg-warning-50/50 hover:border-warning-400 hover:bg-warning-50',
              )}
            >
              <p className="font-bold text-warning-800">Option B — Received with issues</p>
              <p className="text-sm text-warning-700 mt-1">
                {isReplacementReceipt
                  ? 'Report problems with the latest redispatched shipment — starts a new review cycle.'
                  : 'Report damaged, missing, wrong, or mismatched items.'}
              </p>
            </button>
            {!hideNotReceivedOption && (
              <button
                type="button"
                role="radio"
                aria-checked={selectedOption === 'not_received'}
                onClick={() => setSelectedOption('not_received')}
                className={clsx(
                  'w-full text-left rounded-xl border-2 p-4 transition-colors',
                  selectedOption === 'not_received'
                    ? 'border-error-500 bg-error-50 ring-2 ring-error-200'
                    : 'border-error-200 bg-error-50/50 hover:border-error-400 hover:bg-error-50',
                )}
              >
                <p className="font-bold text-error-800">Option C — Shipment not received</p>
                <p className="text-sm text-error-700 mt-1">Nothing was delivered or the shipment could not be accepted.</p>
              </button>
            )}
          </div>

          <SlideToConfirm
            enabled={!!selectedOption}
            disabled={submitting}
            resetKey={selectedOption}
            label="Slide to continue"
            confirmingLabel="Opening…"
            onConfirm={confirmSelectedOption}
          />

          <Button type="button" variant="outline" className="w-full" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      )}

      {step === 'all_received' && (
        <form onSubmit={submitAllReceived} className="space-y-5">
          {dispatchSummary}
          <div className="rounded-xl border border-success-200 bg-success-50/40 p-3">
            <p className="text-sm font-semibold text-success-800">Verify all items, then confirm below.</p>
          </div>
          <Input label="Receiver name" required value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
          <Input type="date" label="Received date" required max={todayIso()} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-wk-body">Photo of delivered boxes (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => setDeliveryPhoto(e.target.files?.[0] || null)} className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:rounded-full file:bg-wk-peach file:text-wk-navy file:font-semibold" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(editMode ? 'choose' : 'choose')} disabled={submitting}>Back</Button>
            <Button type="submit" variant="gradient" className="flex-1" disabled={submitting || !receiverName.trim() || !receivedDate}>
              {submitting ? 'Saving…' : 'All items received'}
            </Button>
          </div>
        </form>
      )}

      {step === 'report_issue' && (
        <ReportIssueStep
          items={items}
          receiverName={receiverName}
          setReceiverName={setReceiverName}
          receivedDate={receivedDate}
          setReceivedDate={setReceivedDate}
          notes={notes}
          setNotes={setNotes}
          onBack={editMode ? null : () => setStep('choose')}
          onSubmit={handleReportIssues}
          submitting={submitting}
          editMode={editMode}
        />
      )}

      {step === 'not_received' && (
        <form onSubmit={submitNotReceived} className="space-y-5">
          {dispatchSummary}
          <div className="rounded-xl border border-error-200 bg-error-50/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-error-800">Confirm shipment not received</p>
            <p className="text-xs text-error-700 leading-relaxed">
              The full shipment will be reported as not delivered. This goes to your Account Manager, then Admin for replacement authorization — same as other receipt issues.
            </p>
            <p className="text-xs text-slate-600">
              No receiver details or evidence are required for this report.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('choose')} disabled={submitting}>
              Back
            </Button>
            <Button type="submit" variant="gradient" className="flex-1" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Report not received'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default DispatchReceiptModal;
