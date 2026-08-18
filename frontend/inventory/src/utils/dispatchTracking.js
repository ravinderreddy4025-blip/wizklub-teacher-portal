const TRACKING_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getDispatchTrackingValue(item) {
  return (item?.consignmentNo || item?.trackingId || '').trim();
}

export function isTrackingOverdue(item) {
  const tracking = getDispatchTrackingValue(item);
  if (tracking) return false;
  if (item?.status !== 'Dispatched') return false;
  const dispatchedAt = item?.dispatchedAt ? new Date(item.dispatchedAt).getTime() : NaN;
  if (!dispatchedAt || Number.isNaN(dispatchedAt)) return false;
  return Date.now() >= dispatchedAt + TRACKING_EDIT_WINDOW_MS;
}

/**
 * Admin may edit tracking when status is Dispatched and either:
 * - tracking is empty (anytime), or
 * - within 24h of dispatchedAt (can change existing tracking).
 */
export function canAdminEditTracking(item) {
  if (!item || item.status !== 'Dispatched') return false;
  const tracking = getDispatchTrackingValue(item);
  const dispatchedAt = item?.dispatchedAt ? new Date(item.dispatchedAt).getTime() : NaN;
  if (!dispatchedAt || Number.isNaN(dispatchedAt)) return false;
  const withinWindow = Date.now() < dispatchedAt + TRACKING_EDIT_WINDOW_MS;
  if (!tracking) return true;
  return withinWindow;
}

export function trackingDisplayLabel(item) {
  const tracking = getDispatchTrackingValue(item);
  if (tracking) return tracking;
  return 'Pending';
}
