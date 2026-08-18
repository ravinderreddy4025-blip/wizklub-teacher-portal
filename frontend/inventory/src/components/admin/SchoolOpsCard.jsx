import React from 'react';
import { Pencil } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatSchoolDisplayName } from '../../utils/schoolName';
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
          <span className="text-[10px] glass-chip text-slate-600 font-mono normal-case tracking-normal">
            {school.code}
          </span>
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 glass-chip inline-block normal-case tracking-normal font-medium">
          Div: {school.divisionId?.name || 'Unassigned'} · AM: {school.rmId?.name || 'Unassigned'}
        </p>
      </div>
      {hasMismatch && <Badge type="error">Mismatch</Badge>}
    </div>
    <div className="grid grid-cols-2 gap-2 mt-auto">
      <Button variant="outline" className="text-xs py-2 font-bold" onClick={() => onDispatch(school._id)}>
        📦 Dispatch
      </Button>
      <Button variant="outline" className="text-xs py-2 font-bold" onClick={() => onAudit(school)}>
        📋 Audit Repo
      </Button>
      <Button variant="outline" className="text-xs py-2 font-bold text-success-600" onClick={() => onKitStatus(school)}>
        📊 Kit Status
      </Button>
      <Button
        variant="outline"
        className={`text-xs py-2 relative font-bold ${pendingCount > 0 ? 'border-warning-300' : ''}`}
        onClick={() => onReplacements(school)}
      >
        🔄 Replace
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-error-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {pendingCount}
          </span>
        )}
      </Button>
    </div>
  </Card>
);

export default SchoolOpsCard;
