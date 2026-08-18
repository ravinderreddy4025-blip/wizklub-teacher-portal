import React, { createContext, useContext, useState, useMemo } from 'react';

const AdminApprovalCountsContext = createContext(null);

const EMPTY_COUNTS = {
  total: 0,
  receiptIssues: 0,
  replacements: 0,
  auditReview: 0,
  lostProduct: 0,
  damagedProduct: 0,
  missingProduct: 0,
  quantityMismatch: 0,
};

export const AdminApprovalCountsProvider = ({ children }) => {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const value = useMemo(() => ({ counts, setCounts }), [counts]);

  return (
    <AdminApprovalCountsContext.Provider value={value}>
      {children}
    </AdminApprovalCountsContext.Provider>
  );
};

export const useAdminApprovalCounts = () => {
  const ctx = useContext(AdminApprovalCountsContext);
  if (!ctx) {
    return { counts: EMPTY_COUNTS, setCounts: () => {} };
  }
  return ctx;
};
