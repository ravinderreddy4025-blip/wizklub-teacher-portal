import React from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import IssueEvidencePanel from '../shared/IssueEvidencePanel';
import { IssueShipmentDetailsCell } from '../shared/DispatchRedispatchCells';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { isReplacementInTransit } from '../../utils/schoolDispatch';
import { AmApprovalSection, AmApprovalTile } from '../am/AmApprovalSections';

function issueBadgeType(issueType) {
  if (issueType === 'Damaged Product' || issueType === 'Shipment Not Received') return 'error';
  if (issueType === 'Quantity Mismatch') return 'info';
  return 'warning';
}

function issueStatusBadge(status) {
  if (status === 'Approved' || status === 'Resolved') return 'success';
  if (status === 'Rejected') return 'error';
  return 'warning';
}

export function AdminReceiptIssueTable({ issues, onReject, onApprove, onAuthorize, onShip }) {
  const approveIssue = onApprove || onAuthorize;
  if (!issues.length) {
    return <p className="inv-empty inv-empty__text">No receipt issues in this category.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="clean-table w-full">
        <thead>
          <tr>
            <th>School</th>
            <th>Kit</th>
            <th>Issue</th>
            <th>Affected</th>
            <th className="hidden md:table-cell">Dispatch ID</th>
            <th className="hidden lg:table-cell">Shipment details</th>
            <th>Status</th>
            <th className="hidden xl:table-cell">Evidence</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue._id}>
              <td className="font-medium text-brand-deep">{formatSchoolDisplayName(issue.school?.name)}</td>
              <td>{issue.kit?.name}</td>
              <td><Badge type={issueBadgeType(issue.issueType)}>{issue.issueType}</Badge></td>
              <td className="font-medium">{issue.quantityAffected}</td>
              <td className="hidden font-mono text-xs md:table-cell">{issue.sourceDispatchRef || issue.dispatch?.dispatchId || '—'}</td>
              <td className="hidden lg:table-cell"><IssueShipmentDetailsCell issue={issue} /></td>
              <td><Badge type={issueStatusBadge(issue.status)}>{issue.status}</Badge></td>
              <td className="hidden max-w-[220px] xl:table-cell">
                {issue.issueType === 'Shipment Not Received' ? (
                  <p className="text-xs text-slate-500">No evidence required</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 mb-2">{issue.damageDescription || issue.remarks || '—'}</p>
                    {issue.severity && <span className="block text-xs text-slate-500 mb-1">Severity: {issue.severity}</span>}
                    {issue.amNotes && <span className="block text-xs text-slate-500 mb-2">AM: {issue.amNotes}</span>}
                    <IssueEvidencePanel issue={issue} compact />
                  </>
                )}
              </td>
              <td className="text-right">
                <div className="flex justify-end gap-2 flex-wrap">
                  {issue.status === 'Approved' && !isReplacementInTransit(issue) ? (
                    <Button variant="gradient" className="text-xs py-1.5 px-2" onClick={() => onShip?.(issue)}>Ship</Button>
                  ) : issue.status === 'Approved' ? (
                    <p className="text-xs font-semibold text-slate-500">In transit</p>
                  ) : (
                    <>
                      <Button variant="danger" className="text-xs py-1.5 px-2" onClick={() => onReject(issue._id)}>Reject</Button>
                      <Button variant="gradient" className="text-xs py-1.5 px-2" onClick={() => approveIssue?.(issue)}>Approve</Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminReplacementRequestTable({ requests, onReject, onAuthorize }) {
  if (!requests.length) {
    return <p className="inv-empty inv-empty__text">No pending replacement requests.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="clean-table w-full">
        <thead>
          <tr>
            <th>School</th>
            <th>Type</th>
            <th>Kit</th>
            <th>Qty</th>
            <th>Details</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req._id}>
              <td className="font-medium text-brand-deep">{formatSchoolDisplayName(req.school?.name)}</td>
              <td>
                <Badge type={req.status === 'Replacement Pending' ? 'warning' : req.type === 'Damaged' ? 'error' : 'pending'}>
                  {req.status || req.type}
                </Badge>
              </td>
              <td>{req.kit?.name}</td>
              <td className="font-medium">x{req.quantity}</td>
              <td className="max-w-xs whitespace-normal text-slate-600">{req.reasonDetails}</td>
              <td className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="danger" className="text-xs py-1.5 px-3" onClick={() => onReject(req._id)}>Deny</Button>
                  <Button variant="gradient" className="text-xs py-1.5 px-3" onClick={() => onAuthorize(req)}>Authorize</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { AmApprovalSection, AmApprovalTile };
