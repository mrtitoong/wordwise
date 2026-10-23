import { AdminShell } from "@/features/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
