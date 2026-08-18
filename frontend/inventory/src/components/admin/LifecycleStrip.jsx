import React from 'react';
import {
  ClipboardCheck,
  GraduationCap,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { LIFECYCLE_STAGES } from '../../utils/adminMetrics';

const STAGE_ICONS = {
  Procurement: ShoppingCart,
  Warehouse: Warehouse,
  Dispatch: Truck,
  'School Receipt': Package,
  Usage: Wrench,
  'Monthly Audit': ClipboardCheck,
  'Quarterly Audit': ClipboardCheck,
  'Teacher Handover': GraduationCap,
  Replacement: RefreshCw,
};

/** Phase 1 = first five stages (Procurement → Usage); rest planned Phase 2. */
const isPhaseOne = (index) => index <= 4;

const LifecycleStrip = () => (
  <div className="relative z-10">
    <div className="mb-3 border-b border-[#E5E7EB] pb-2">
      <h2 className="font-heading text-base font-bold text-[#1F2937] sm:text-lg">
        Inventory Lifecycle
      </h2>
    </div>

    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">      {LIFECYCLE_STAGES.map((stage, index) => {
        const Icon = STAGE_ICONS[stage] || Package;
        const phaseOne = isPhaseOne(index);
        return (
          <div
            key={stage}
            className={`relative flex flex-col items-center overflow-hidden rounded-xl border bg-white p-2 text-center shadow-sm transition-shadow hover:shadow-md ${
              phaseOne ? 'border-[#E5E7EB]' : 'border-[#E5E7EB] opacity-70'
            }`}
          >
            {phaseOne && <div className="absolute left-0 top-0 h-1 w-full bg-[#F89C28]" />}
            <div
              className={`mb-1.5 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ${
                phaseOne
                  ? 'bg-[#F89C28] text-white'
                  : 'bg-[#F8FAFC] text-[#6B7280]'
              }`}
            >
              <Icon size={14} />
            </div>
            <h4 className="text-[10px] font-semibold leading-tight tracking-wide text-[#1F2937]">              {stage}
            </h4>
            <div
              className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                phaseOne
                  ? 'bg-[#22C55E]/10 text-[#22C55E]'
                  : 'bg-[#F8FAFC] text-[#6B7280]'
              }`}
            >
              {phaseOne ? 'Phase 1' : 'Phase 2'}
            </div>
            {index < LIFECYCLE_STAGES.length - 1 && (
              <div className="absolute top-1/2 -right-2 hidden h-px w-4 bg-[#E5E7EB] xl:block" />
            )}
          </div>
        );
      })}
    </div>

    <p className="mt-4 text-xs text-[#6B7280]">
      Phase 1 modules cover dispatch, receipt, monthly audit, and replacement. Quarterly audit and
      teacher handover are planned for Phase 2.
    </p>
  </div>
);

export default LifecycleStrip;
