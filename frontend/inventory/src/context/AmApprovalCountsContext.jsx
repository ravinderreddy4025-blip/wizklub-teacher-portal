import React, { createContext, useContext, useState, useMemo } from 'react';

const AmApprovalCountsContext = createContext(null);

const EMPTY_COUNTS = {
  total: 0,
  quantityMismatch: 0,
  missingProduct: 0,
  lostProduct: 0,
  damagedProduct: 0,
};

export const AmApprovalCountsProvider = ({ children }) => {
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  const value = useMemo(() => ({ counts, setCounts }), [counts]);

  return (
    <AmApprovalCountsContext.Provider value={value}>
      {children}
    </AmApprovalCountsContext.Provider>
  );
};

export const useAmApprovalCounts = () => {
  const ctx = useContext(AmApprovalCountsContext);
  if (!ctx) {
    return { counts: EMPTY_COUNTS, setCounts: () => {} };
  }
  return ctx;
};
