import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Package, Truck, MapPin, CircleAlert, ClipboardCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { getCycleCount, getDispatchRedispatchSummary } from '../../utils/schoolDispatch';
import { DispatchCompareGrid, DispatchShipmentHistoryList } from '@school-portal/components/school/DispatchCompareLines';
import DispatchProofPhoto from './DispatchProofPhoto';

const AM_PENDING_STATUSES = [
  'Pending AM Approval',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
];
const ADMIN_PENDING_STATUSES = [
  'Pending Admin Approval',
  'Clarification Requested',
  'Replacement Pending',
];
const APPROVED_ISSUE_STATUSES = ['Approved', 'Resolved'];

const formatDate = (value) => {
  if (!value) return null;
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatDateShort = (value) => {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

function issueReportTitle(issue) {
  const labels = {
    'Missing Product': 'Missing items reported',
    'Damaged Product': 'Damaged items reported',
    'Quantity Mismatch': 'Quantity mismatch reported',
    'Shipment Not Received': 'Shipment not received',
  };
  return labels[issue?.issueType] || 'Issue reported at school';
}

function buildDeliveryOutcomeStep(dispatch, issue) {
  const status = dispatch.status;
  const isPending = status === 'Pending';
  const isInTransit = status === 'Dispatched';
  const isDelivered = !isPending && !isInTransit;

  let outcomeTitle = 'Awaiting delivery confirmation';
  let outcomeSubtitle = 'School will acknowledge receipt once the shipment arrives';
  let outcomeTone = 'pending';

  if (status === 'Delivery Completed' || status === 'Completed') {
    const outstanding = Number(dispatch.outstandingQuantity) || 0;
    outcomeTitle = outstanding > 0 ? 'Cycle completed' : 'Fulfilled';
    outcomeSubtitle = outstanding > 0
      ? `OK ${dispatch.quantityAcknowledged ?? 0} of initial ${dispatch.quantityInitial ?? dispatch.quantity} · outstanding ${outstanding}`
      : (dispatch.receiverName
        ? `Acknowledged by ${dispatch.receiverName}`
        : 'All outstanding kits have been acknowledged');
    outcomeTone = 'success';
  } else if (status === 'Received') {
    outcomeTitle = 'Delivered — partially received';
    outcomeSubtitle = `Received ${dispatch.quantityReceived ?? '—'} of ${dispatch.quantity} kits`;
    outcomeTone = 'success';
  } else if (issue?.status === 'Rejected') {
    outcomeTitle = 'Replacement request rejected';
    outcomeSubtitle = issue.adminNotes || issue.amNotes || 'No replacement will be dispatched';
    outcomeTone = 'error';
  } else if (issue?.status === 'Approved'
    && (status === 'Dispatched'
      || ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(status))) {
    outcomeTitle = 'Awaiting acknowledgment of latest shipment';
    outcomeSubtitle = dispatch.consignmentNo
      ? `Tracking: ${dispatch.consignmentNo}. Confirm all received or report new issues.`
      : 'Redispatch authorized — confirm all received or report new issues';
    outcomeTone = 'current';
  } else if (status === 'Not Received') {
    outcomeTitle = 'Shipment not received';
    outcomeSubtitle = dispatch.receiptNotes || 'School reported that the shipment was not received';
    outcomeTone = 'error';
  } else if (isInTransit) {
    outcomeTitle = 'Out for delivery';
    outcomeSubtitle = 'Shipment is on the way to your school';
    outcomeTone = 'current';
  } else if (AM_PENDING_STATUSES.includes(issue?.status)) {
    outcomeTitle = 'Awaiting issue resolution';
    outcomeSubtitle = 'Delivery paused while the reported issue is reviewed';
    outcomeTone = 'pending';
  } else if (ADMIN_PENDING_STATUSES.includes(issue?.status)) {
    outcomeTitle = 'Awaiting admin authorization';
    outcomeSubtitle = 'Replacement shipment pending admin approval';
    outcomeTone = 'pending';
  }

  const awaitingReplacementAck = issue
    && issue.status === 'Approved'
    && (status === 'Dispatched'
      || ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(status));

  return {
    key: 'delivered',
    icon: outcomeTone === 'error' ? CircleAlert : MapPin,
    title: outcomeTitle,
    subtitle: outcomeSubtitle,
    date: dispatch.receivedAt,
    state: isDelivered && outcomeTone !== 'current'
      ? (outcomeTone === 'error' ? 'error' : outcomeTone === 'warning' ? 'warning' : 'complete')
      : awaitingReplacementAck || outcomeTone === 'current'
        ? 'current'
        : 'pending',
  };
}

function buildNormalSteps(dispatch) {
  const status = dispatch.status;
  const summary = getDispatchRedispatchSummary(dispatch);
  const trackingId = dispatch.consignmentNo || dispatch.trackingId || '—';
  const transitTrackingSubtitle = summary.mode === 'redispatched'
    ? `Current tracking: ${summary.redispatch?.trackingId || '—'} · ${summary.cycles?.length || 0} cycles`
    : `Tracking ID: ${trackingId}`;
  const isPending = status === 'Pending';
  const isInTransit = status === 'Dispatched';
  const isDelivered = !isPending && !isInTransit;
  const outcome = buildDeliveryOutcomeStep(dispatch, null);

  const shippedComplete = !isPending;
  const transitComplete = isDelivered;
  const transitCurrent = isInTransit;

  return [
    {
      key: 'created',
      icon: Package,
      title: 'Dispatch request created',
      subtitle: dispatch.category || 'New dispatch',
      date: dispatch.createdAt,
      state: 'complete',
    },
    {
      key: 'shipped',
      icon: Truck,
      title: 'Shipped from warehouse',
      subtitle: shippedComplete ? 'Kit dispatched from WizKlub' : 'Waiting to be shipped',
      date: dispatch.dispatchedAt,
      state: shippedComplete ? 'complete' : 'pending',
    },
    {
      key: 'transit',
      icon: Truck,
      title: 'In transit',
      subtitle: transitTrackingSubtitle,
      date: shippedComplete ? dispatch.dispatchedAt : null,
      state: transitCurrent ? 'current' : transitComplete ? 'complete' : 'pending',
    },
    outcome,
  ];
}

function buildIssueTrackingSteps(dispatch) {
  const issue = dispatch.receiptIssue;
  const summary = getDispatchRedispatchSummary(dispatch);
  const isRedispatched = summary.mode === 'redispatched';
  const originalTracking = isRedispatched
    ? summary.original.trackingId
    : (issue?.consignmentNo || dispatch.consignmentNo || dispatch.trackingId || '—');

  const amPending = AM_PENDING_STATUSES.includes(issue.status);
  const adminPending = ADMIN_PENDING_STATUSES.includes(issue.status);
  const amApproved = !amPending && issue.status !== 'Rejected';
  const adminApproved = APPROVED_ISSUE_STATUSES.includes(issue.status);
  const rejected = issue.status === 'Rejected';
  const clarification = issue.status === 'Clarification Requested';

  const steps = [
    {
      key: 'created',
      icon: Package,
      title: 'Dispatch request created',
      subtitle: isRedispatched ? summary.original.category : (dispatch.category || 'New dispatch'),
      date: dispatch.createdAt,
      state: 'complete',
    },
    {
      key: 'shipped-original',
      icon: Truck,
      title: 'Shipped from warehouse',
      subtitle: 'Original kit dispatched from WizKlub',
      date: issue.receivedAt || issue.createdAt,
      state: 'complete',
    },
    {
      key: 'transit-original',
      icon: Truck,
      title: 'Original shipment in transit',
      subtitle: `Tracking ID: ${originalTracking}`,
      date: issue.receivedAt || issue.createdAt,
      state: 'complete',
    },
    {
      key: 'issue-reported',
      icon: CircleAlert,
      title: issueReportTitle(issue),
      subtitle: issue.issueType === 'Shipment Not Received'
        ? `${issue.quantityAffected} kit(s) — entire shipment not delivered`
        : `${issue.quantityAffected} kit(s) affected · ${issue.receiverName ? `Reported by ${issue.receiverName}` : 'Evidence submitted'}`,
      date: issue.receivedAt || issue.createdAt,
      state: 'warning',
    },
    {
      key: 'am-approval',
      icon: ClipboardCheck,
      title: amPending ? 'Pending AM approval' : rejected && !issue.amApprovedAt ? 'AM review' : 'AM approved',
      subtitle: amPending
        ? 'Account Manager is reviewing photo/video evidence'
        : issue.amNotes || 'Forwarded to admin for replacement authorization',
      date: issue.amApprovedAt,
      state: amPending ? 'current' : amApproved ? 'complete' : rejected ? 'error' : 'pending',
    },
    {
      key: 'admin-approval',
      icon: ClipboardCheck,
      title: clarification
        ? 'Clarification requested'
        : adminPending
          ? 'Pending admin approval'
          : adminApproved
            ? 'Admin authorized replacement'
            : rejected
              ? 'Rejected by admin'
              : 'Admin approval',
      subtitle: clarification
        ? (issue.adminNotes || 'Additional information requested before authorization')
        : adminPending
          ? 'Awaiting approval — shipping happens separately'
          : adminApproved
            ? (issue.adminNotes || `Approved for ${issue.quantityAffected} kit(s). Ship when ready.`)
            : rejected
              ? (issue.adminNotes || 'Replacement request declined')
              : 'Pending admin review',
      date: issue.adminApprovedAt,
      state: clarification
        ? 'warning'
        : adminPending && amApproved
          ? 'current'
          : adminApproved
            ? 'complete'
            : rejected
              ? 'error'
              : amApproved
                ? 'pending'
                : 'pending',
    },
  ];

  const replacementShipped = adminApproved && !rejected && (
    dispatch.status === 'Dispatched'
    || isRedispatched
    || (Array.isArray(dispatch.cycles) && dispatch.cycles.some((cycle) => cycle.movementType === 'REPLACEMENT'))
  );

  if (replacementShipped) {
    const redispatchTracking = isRedispatched
      ? summary.redispatch.trackingId
      : (dispatch.consignmentNo || dispatch.trackingId || '—');
    const awaitingAck = dispatch.status === 'Dispatched'
      || ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'].includes(dispatch.status);
    const cycleSubtitle = isRedispatched
      ? `Current: ${redispatchTracking} · ${summary.cycles?.length || 0} cycles`
      : `Tracking ID: ${redispatchTracking}`;

    steps.push(
      {
        key: 'shipped-replacement',
        icon: Truck,
        title: 'Replacement shipped',
        subtitle: 'Redispatch from WizKlub warehouse',
        date: dispatch.dispatchedAt,
        state: 'complete',
      },
      {
        key: 'transit-replacement',
        icon: Truck,
        title: 'Replacement in transit',
        subtitle: cycleSubtitle,
        date: dispatch.dispatchedAt,
        state: awaitingAck ? 'current' : 'complete',
      },
    );
  }

  steps.push(buildDeliveryOutcomeStep(dispatch, issue));
  return steps;
}

function buildTrackingSteps(dispatch) {
  if (dispatch.receiptIssue) {
    return buildIssueTrackingSteps(dispatch);
  }
  return buildNormalSteps(dispatch);
}

const stepStyles = {
  complete: {
    dot: 'bg-success-500 border-success-500 text-white',
    line: 'bg-success-100',
    title: 'text-slate-900',
    icon: Check,
  },
  current: {
    dot: 'bg-brand-primary border-brand-primary text-wk-navy ring-4 ring-brand-primary/20',
    line: 'bg-slate-200',
    title: 'text-brand-primary font-bold',
    icon: null,
  },
  warning: {
    dot: 'bg-warning-500 border-warning-500 text-white',
    line: 'bg-warning-100',
    title: 'text-warning-800 font-bold',
    icon: Check,
  },
  error: {
    dot: 'bg-error-500 border-error-500 text-white',
    line: 'bg-error-100',
    title: 'text-error-700 font-bold',
    icon: CircleAlert,
  },
  pending: {
    dot: 'bg-white border-slate-300 text-slate-300',
    line: 'bg-slate-200',
    title: 'text-slate-400',
    icon: null,
  },
};

const TimelineStep = ({ step, isLast }) => {
  const style = stepStyles[step.state] || stepStyles.pending;
  const Icon = step.icon;
  const DotIcon = style.icon;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${style.dot}`}
        >
          {DotIcon ? <DotIcon size={16} strokeWidth={2.5} /> : Icon ? <Icon size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
        </div>
        {!isLast && <div className={`w-0.5 flex-1 min-h-[2.5rem] mt-1 ${style.line}`} />}
      </div>
      <div className={`pb-8 ${isLast ? 'pb-0' : ''}`}>
        <p className={`text-sm ${style.title}`}>{step.title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.subtitle}</p>
        {step.date && (
          <p className="text-xs font-semibold text-slate-600 mt-1.5">{formatDate(step.date)}</p>
        )}
      </div>
    </div>
  );
};

const statusBadgeType = (status) => {
  if (status === 'Delivery Completed' || status === 'Received' || status === 'Completed') return 'success';
  if (status === 'missing_dispatch' || status === 'damaged_dispatch' || status === 'mismatch_dispatch' || status === 'not_received_dispatch') return 'warning';
  if (status === 'Damage Under Review' || status === 'Missing Item Under Review' || status === 'Received with Issues') return 'warning';
  if (status === 'Replacement Pending') return 'pending';
  if (status === 'Not Received') return 'error';
  if (status === 'Dispatched') return 'info';
  return 'pending';
};

const formatDispatchStatus = (status) => {
  const labels = {
    missing_dispatch: 'Missing Dispatch',
    damaged_dispatch: 'Damaged Dispatch',
    mismatch_dispatch: 'Mismatch Dispatch',
    not_received_dispatch: 'Not Received',
  };
  return labels[status] || status;
};

const DispatchTrackingModal = ({ dispatch, isOpen, onClose }) => {
  const [showDetails, setShowDetails] = useState(false);
  const summary = useMemo(
    () => (dispatch ? getDispatchRedispatchSummary(dispatch) : null),
    [dispatch],
  );
  const steps = useMemo(() => (dispatch ? buildTrackingSteps(dispatch) : []), [dispatch]);

  if (!dispatch) return null;

  const trackingId = dispatch.consignmentNo || dispatch.trackingId || '—';
  const estimatedLabel = dispatch.dispatchedAt
    ? `Shipped on ${formatDateShort(dispatch.dispatchedAt)}`
    : 'Not shipped yet';
  const isRedispatched = summary?.mode === 'redispatched';
  const cycleCount = dispatch ? getCycleCount(dispatch) : 1;
  const currentTrackingRaw = isRedispatched
    ? (summary.redispatch?.trackingId || trackingId)
    : trackingId;
  const currentTracking = !currentTrackingRaw || currentTrackingRaw === '—'
    ? 'Pending'
    : currentTrackingRaw;
  const currentQty = isRedispatched
    ? summary.redispatch?.quantity
    : dispatch.quantity;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Track dispatch" className="max-w-lg">
      <div className="space-y-5">
        <div className="rounded-2xl bg-wk-cream p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-500 normal-case tracking-normal">
                {isRedispatched ? 'Current tracking' : 'Tracking ID'}
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-brand-primary break-all">
                {currentTracking || '—'}
              </p>
            </div>
            {isRedispatched && cycleCount >= 2 && (
              <span className="shrink-0 inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-600">
                {cycleCount} cycles
              </span>
            )}
          </div>
          {isRedispatched && summary.original?.trackingId && (
            <p className="mt-2 text-xs text-slate-400">
              Original: {summary.original.trackingId}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">{estimatedLabel}</p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Package size={28} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 leading-snug">{dispatch.kit?.name || 'Kit'}</p>
            <p className="text-sm text-slate-600 mt-0.5">
              Quantity: <span className="font-semibold text-brand-primary">x{currentQty ?? '—'}</span>
              {isRedispatched
                && summary.original?.quantity != null
                && summary.original.quantity !== currentQty && (
                <span className="text-slate-400 ml-2 text-xs">
                  (orig x{summary.original.quantity})
                </span>
              )}
            </p>
            {isRedispatched && summary.redispatch?.category && (
              <p className="text-xs text-slate-500 mt-1 normal-case tracking-normal font-semibold">
                {summary.redispatch.category}
              </p>
            )}
            <div className="mt-2">
              <Badge type={statusBadgeType(dispatch.status)}>{formatDispatchStatus(dispatch.status)}</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-5">
          <p className="text-xs font-bold text-slate-500 normal-case tracking-normal mb-4">Shipment progress</p>
          {steps.map((step, index) => (
            <TimelineStep key={step.key} step={step} isLast={index === steps.length - 1} />
          ))}
        </div>

        <DispatchShipmentHistoryList item={dispatch} />
        {(dispatch.trackingHistory || []).length > 1 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-500">Tracking history</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {dispatch.trackingHistory.map((row, index) => (
                <li key={`${row.consignmentNo}-${index}`} className="font-mono">
                  {row.consignmentNo}
                  {row.setAt ? ` · ${formatDateShort(row.setAt)}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(dispatch.receiptIssues || []).length > 1 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-500">Issues on this order</p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
              {dispatch.receiptIssues.map((issue, index) => (
                <li key={issue._id || index}>
                  Issue #{issue.cycle || index + 1}: {issue.issueType} · {issue.status}
                  {' '}({issue.quantityAffected} affected)
                </li>
              ))}
            </ul>
          </div>
        )}
        <DispatchCompareGrid item={dispatch} />

        {dispatch.dispatchProofUrl && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <DispatchProofPhoto url={dispatch.dispatchProofUrl} size="lg" label="Dispatch proof photo" />
            <p className="mt-2 text-xs text-slate-500">Photo captured by the admin team when the package was shipped.</p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Shipment details
            {showDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {showDetails && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-2 text-sm">
              {(() => {
                const summary = getDispatchRedispatchSummary(dispatch);
                const detailRows = summary.mode === 'redispatched'
                  ? [
                      ['Dispatch ID', dispatch.dispatchId],
                      ['Replacement ID', dispatch.replacementId || '—'],
                      ['Account manager', dispatch.reportingManager?.name],
                      ['Dispatch notes', dispatch.dispatchDetails],
                    ]
                  : [
                      ['Dispatch ID', dispatch.dispatchId],
                      ['Kit ID', summary.original.kitId],
                      ['Category', summary.original.category],
                      ['Tracking', summary.original.trackingId],
                      ['Quantity', summary.original.quantity != null ? `x${summary.original.quantity}` : null],
                      ['Replacement ID', dispatch.replacementId || '—'],
                      ['Account manager', dispatch.reportingManager?.name],
                      ['Dispatch notes', dispatch.dispatchDetails],
                    ];
                return detailRows.filter(([, v]) => v && v !== '—').map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-xs font-bold text-slate-500 shrink-0">{label}</span>
                    <span className="text-right text-slate-800 font-medium break-all">{value}</span>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-wk-navy hover:opacity-95 transition-opacity"
        >
          Done
        </button>
      </div>
    </Modal>
  );
};

export default DispatchTrackingModal;
