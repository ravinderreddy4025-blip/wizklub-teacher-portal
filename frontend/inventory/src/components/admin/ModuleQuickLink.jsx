import React from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Truck,
  GraduationCap,
  ClipboardCheck,
  RefreshCw,
  FileText,
  Building2,
  Users,
} from 'lucide-react';
import { ADMIN_MODULES } from '../../utils/adminMetrics';

const iconMap = {
  Package,
  Truck,
  GraduationCap,
  ClipboardCheck,
  RefreshCw,
  FileText,
  Building2,
  Users,
};

const TONES = [
  'bg-info-50 text-info-600',
  'bg-wk-peach text-wk-orange-text',
  'bg-success-100 text-success-700',
  'bg-[#EDE3FF] text-[#5B2FD6]',
  'bg-warning-100 text-warning-700',
];

/** IL pastel quick-link tiles: tinted art block, 14/500 label, 12px hint. */
const ModuleQuickLink = ({ metrics }) => (
  <section className="flex flex-col gap-4">
    <div>
      <h2 className="inv-section-title">Quick links</h2>
      <p className="text-sm text-wk-body">Jump straight into any inventory module.</p>
    </div>

    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {ADMIN_MODULES.map((mod, index) => {
        const Icon = iconMap[mod.icon];
        let badge = null;
        let badgeTone = 'error';
        if (mod.label === 'Replacements' && metrics?.pendingAdminApprovals > 0) {
          badge = metrics.pendingAdminApprovals;
        }
        if (mod.label === 'Audit Review' && metrics?.auditMismatches > 0) {
          badge = metrics.auditMismatches;
          badgeTone = 'primary';
        }
        if (mod.label === 'Dispatches' && metrics?.pendingAcknowledgments > 0) {
          badge = metrics.pendingAcknowledgments;
        }

        return (
          <Link
            key={mod.to}
            to={mod.to}
            className="group relative flex flex-col items-start gap-0.5 rounded-2xl text-left focus-visible:outline-offset-4"
          >
            <span
              className={`mb-2 grid h-[84px] w-full place-items-center rounded-2xl transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-soft ${TONES[index % TONES.length]}`}
            >
              {Icon && <Icon size={28} strokeWidth={1.75} aria-hidden />}
            </span>
            {badge != null && (
              <span
                className={`absolute right-2 top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  badgeTone === 'primary' ? 'bg-wk-navy text-white' : 'bg-error-600 text-white'
                }`}
                aria-label={`${badge} pending`}
              >
                {badge}
              </span>
            )}
            <span className="text-sm font-medium text-wk-ink">{mod.label}</span>
            <span className="text-xs leading-snug text-wk-muted line-clamp-2">{mod.desc}</span>
          </Link>
        );
      })}
    </div>
  </section>
);

export default ModuleQuickLink;
