import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../utils/routes';
import { formatSchoolDisplayName } from '../../utils/schoolName';
const AttentionPanel = ({ items }) => {
  const list = items.slice(0, 6);
  const taskCount = list.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="h-5 w-1 shrink-0 rounded-sm bg-[#F89C28]" />
        <div>
          <h3 className="text-base font-bold text-[#1F2937]">Attention Required</h3>
          <p className="text-[13px] text-[#6B7280]">            {taskCount === 0
              ? 'No priority tasks right now'
              : `${taskCount} priority task${taskCount === 1 ? '' : 's'} identified`}
          </p>
        </div>
      </div>

      {taskCount === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-8 text-center">
          <p className="font-medium text-[#1F2937]">All schools are up to date</p>
          <p className="mt-1 text-xs text-[#6B7280]">
            No pending acknowledgments, audits, or mismatches.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map(({ school, pendingAck, hasMismatch, needsAudit, pendingReplace }, index) => {
            const name = formatSchoolDisplayName(school.name || 'School');
            const initials = name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('') || 'S';
            const highlighted = index === 0;

            return (
              <Link
                key={school._id}
                to={ROUTES.admin.dispatches}
                className={`relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-[#E5E7EB] p-3 transition hover:-translate-y-0.5 hover:bg-[#F8FAFC] hover:shadow-sm ${
                  highlighted ? 'bg-[#F8FAFC]' : 'bg-white'
                }`}
              >                {highlighted && (
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#F89C28]" />
                )}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-xs font-bold text-[#F89C28]">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#1F2937]">{name}</p>
                  <p className="text-[11px] font-medium text-[#6B7280]">{school.code}</p>                </div>
                <div className="flex max-w-[45%] flex-col items-end gap-1">
                  {pendingAck > 0 && (
                    <span className="rounded-full bg-[#F89C28]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F89C28]">
                      {pendingAck} Pending Ack
                    </span>
                  )}
                  {needsAudit && (
                    <span className="rounded-full bg-[#F59E0B]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
                      Audit Due
                    </span>
                  )}
                  {hasMismatch && (
                    <span className="rounded-full bg-[#EF4444]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#EF4444]">
                      Mismatch
                    </span>
                  )}
                  {pendingReplace > 0 && (
                    <span className="rounded-full bg-[#F89C28]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F89C28]">
                      {pendingReplace} Replace
                    </span>
                  )}
                  {!pendingAck && !needsAudit && !hasMismatch && !pendingReplace && (
                    <span className="rounded-full bg-[#22C55E]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#22C55E]">
                      Active
                    </span>
                  )}
                </div>
              </Link>
            );          })}
        </div>
      )}

      <Link
        to={ROUTES.admin.schools}
        className="w-full rounded-xl py-2.5 text-center text-[13px] font-bold text-[#F89C28] transition hover:bg-[#F89C28]/5 hover:border-[#F89C28]/20 border border-transparent"
      >
        View all schools
      </Link>
    </section>
  );
};

export default AttentionPanel;
