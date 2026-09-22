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
        <div className="h-5 w-1 shrink-0 rounded-sm bg-wk-orange" />
        <div>
          <h3 className="text-base font-bold text-wk-ink">Attention Required</h3>
          <p className="text-[13px] text-wk-muted">            {taskCount === 0
              ? 'No priority tasks right now'
              : `${taskCount} priority task${taskCount === 1 ? '' : 's'} identified`}
          </p>
        </div>
      </div>

      {taskCount === 0 ? (
        <div className="rounded-xl border border-wk-line bg-wk-cream px-4 py-8 text-center">
          <p className="font-medium text-wk-ink">All schools are up to date</p>
          <p className="mt-1 text-xs text-wk-muted">
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
                className={`relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-wk-line p-3 transition hover:-translate-y-0.5 hover:bg-wk-cream hover:shadow-sm ${
                  highlighted ? 'bg-wk-cream' : 'bg-white'
                }`}
              >                {highlighted && (
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-wk-orange" />
                )}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-wk-line bg-white text-xs font-bold text-wk-orange-text">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-wk-ink">{name}</p>
                  <p className="text-xs font-medium text-wk-muted">{school.code}</p>                </div>
                <div className="flex max-w-[45%] flex-col items-end gap-1">
                  {pendingAck > 0 && (
                    <span className="rounded-full bg-wk-peach px-2.5 py-1 text-sm font-medium text-wk-orange-text">
                      {pendingAck} Pending Ack
                    </span>
                  )}
                  {needsAudit && (
                    <span className="rounded-full bg-warning-50 px-2.5 py-1 text-sm font-medium text-warning-700">
                      Audit Due
                    </span>
                  )}
                  {hasMismatch && (
                    <span className="rounded-full bg-error-50 px-2.5 py-1 text-sm font-medium text-error-600">
                      Mismatch
                    </span>
                  )}
                  {pendingReplace > 0 && (
                    <span className="rounded-full bg-wk-peach px-2.5 py-1 text-sm font-medium text-wk-orange-text">
                      {pendingReplace} Replace
                    </span>
                  )}
                  {!pendingAck && !needsAudit && !hasMismatch && !pendingReplace && (
                    <span className="rounded-full bg-success-100 px-2.5 py-1 text-sm font-medium text-success-700">
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
        className="w-full rounded-xl py-2.5 text-center text-[13px] font-bold text-wk-orange-text transition hover:bg-wk-cream hover:border-wk-peach-2 border border-transparent"
      >
        View all schools
      </Link>
    </section>
  );
};

export default AttentionPanel;
