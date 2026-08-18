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

const ModuleQuickLink = ({ metrics }) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="text-lg font-bold tracking-tight text-[#1F2937]">Quick Access Modules</h3>
      <p className="text-[13px] text-[#6B7280]">Manage your enterprise workflow from a central hub</p>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {ADMIN_MODULES.map((mod) => {
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
            className="group relative flex flex-col items-center rounded-xl border border-[#E5E7EB] bg-white p-4 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            {badge != null && (
              <span
                className={`absolute right-2 top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${
                  badgeTone === 'primary' ? 'bg-[#F89C28]' : 'bg-[#EF4444]'
                }`}
              >
                {badge}
              </span>
            )}
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#1F2937] transition-colors group-hover:bg-[#F89C28] group-hover:text-white">
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <h4 className="mb-0.5 text-sm font-bold text-[#1F2937]">{mod.label}</h4>
            <p className="text-[11px] leading-snug text-[#6B7280] line-clamp-2">{mod.desc}</p>
          </Link>
        );
      })}
    </div>
  </section>
);

export default ModuleQuickLink;
