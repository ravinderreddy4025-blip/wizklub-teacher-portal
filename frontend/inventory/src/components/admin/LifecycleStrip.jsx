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
    <div className="mb-3 border-b border-wk-line pb-2">
      <h2 className="text-base font-semibold text-wk-ink">
        Inventory lifecycle
      </h2>
    </div>

    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">      {LIFECYCLE_STAGES.map((stage, index) => {
        const Icon = STAGE_ICONS[stage] || Package;
        const phaseOne = isPhaseOne(index);
        return (
          <div
            key={stage}
            className={`relative flex flex-col items-center overflow-hidden rounded-2xl p-3 text-center ${
              phaseOne ? 'bg-wk-cream' : 'bg-wk-mist'
            }`}
          >
            <div
              className={`mb-1.5 flex h-9 w-9 items-center justify-center rounded-full ${
                phaseOne
                  ? 'bg-wk-orange text-wk-navy'
                  : 'bg-white text-wk-muted'
              }`}
            >
              <Icon size={14} />
            </div>
            <h4 className="text-xs font-medium leading-tight text-wk-ink">{stage}
            </h4>
            <div
              className={`mt-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                phaseOne
                  ? 'bg-success-100 text-success-700'
                  : 'bg-white text-wk-body'
              }`}
            >
              {phaseOne ? 'Phase 1' : 'Phase 2'}
            </div>
            {index < LIFECYCLE_STAGES.length - 1 && (
              <div className="absolute top-1/2 -right-2 hidden h-px w-4 bg-wk-line xl:block" />
            )}
          </div>
        );
      })}
    </div>

    <p className="mt-4 text-[13px] text-wk-body">
      Phase 1 modules cover dispatch, receipt, monthly audit, and replacement. Quarterly audit and
      teacher handover are planned for Phase 2.
    </p>
  </div>
);

export default LifecycleStrip;
