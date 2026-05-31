import { SettingsClient } from '@/components/settings-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function SettingsPage() {
  await requireCustomerAccess();
  return <SettingsClient />;
}
