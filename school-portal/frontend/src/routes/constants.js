/** School portal route paths — portable subset of inventory routes. */
export const SCHOOL_ROUTES = {
  login: '/login/school',
  instructorSelect: '/login/school/select',
  root: '/school',
  dispatches: '/school/dispatches',
  warehouse: '/school/warehouse',
  audit: '/school/audit',
  replacements: '/school/replacements',
};

/** Re-export full ROUTES from inventory app when embedded in monolith. */
export { ROUTES, ROLE_HOME } from '@inventory/utils/routes';
