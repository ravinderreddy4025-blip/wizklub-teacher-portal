import RoleLogin from '@inventory/pages/auth/RoleLogin';

/** School portal login — School ID + Instructor tabs. */
export default function SchoolLogin() {
  return <RoleLogin expectedRole="School" />;
}
