import React from 'react';
import { BarChart3, ClipboardList, Package, Pencil, RefreshCcw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatSchoolDisplayName } from '../../utils/schoolName';
import { formatSchoolIdentityPrefix } from '../../utils/componentId';
const SchoolOpsCard = ({
  school,
  pendingCount,
  hasMismatch,
  onEdit,
  onDispatch,
  onAudit,
  onKitStatus,
  onReplacements,
}) => (
  <Card
    className={`flex flex-col justify-between relative group ${hasMismatch ? 'border-l-[3px] border-l-error-500' : ''}`}
  >
    <button
      type="button"
      onClick={() => onEdit(school)}
      className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-brand-primary hover:bg-brand-orange-light/20 opacity-0 group-hover:opacity-100 transition-opacity z-10"
      title="Edit school"
      aria-label="Edit school"
    >
      <Pencil size={16} strokeWidth={2} />
    </button>    <div className="mb-5 flex justify-between items-start">
      <div className="pr-6">
        <h3 className="text-lg font-bold text-brand-deep leading-tight flex items-center gap-2 flex-wrap">
          {formatSchoolDisplayName(school.name)}
          <span className="wk-badge bg-wk-mist font-mono text-wk-body">
            {formatSchoolIdentityPrefix(school.code, school.joiningYear)}
          </span>
        </h3>
        <p className="mt-1.5 text-[13px] text-wk-body">
          Div: {school.divisionId?.name || 'Unassigned'} · AM: {school.rmId?.name || 'Unassigned'}
        </p>
      </div>
      {hasMismatch && <Badge type="error">Mismatch</Badge>}
    </div>
    <div className="grid grid-cols-2 gap-2 mt-auto">
      <Button variant="outline" className="text-xs py-2 font-bold" onClick={() => onDispatch(school._id)}>
        <Package size={16} aria-hidden /> Dispatch
      </Button>
      <Button variant="outline" className="text-xs py-2 font-bold" onClick={() => onAudit(school)}>
        <ClipboardList size={16} aria-hidden /> Audit Repo
      </Button>
      <Button variant="outline" className="text-xs py-2 font-bold text-success-600" onClick={() => onKitStatus(school)}>
        <BarChart3 size={16} aria-hidden /> Kit Status
      </Button>
      <Button
        variant="outline"
        className={`text-xs py-2 relative font-bold ${pendingCount > 0 ? 'border-warning-300' : ''}`}
        onClick={() => onReplacements(school)}
      >
        <RefreshCcw size={16} aria-hidden /> Replace
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-error-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {pendingCount}
          </span>
        )}
      </Button>
    </div>
  </Card>
);

export default SchoolOpsCard;
