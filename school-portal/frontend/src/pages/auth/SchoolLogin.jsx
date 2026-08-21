import RoleLogin from '@inventory/pages/auth/RoleLogin';

/** School portal login — WizKlub instructor (teacher) account only. */
export default function SchoolLogin() {
  return <RoleLogin expectedRole="School" />;
}
