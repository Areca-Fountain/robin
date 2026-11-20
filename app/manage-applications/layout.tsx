import type { ReactNode } from "react";
import RoleGate from "@/components/auth/RoleGate";

// Robin admins only (emails listed in the ADMIN_EMAILS env var).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate
      role="admin"
      signInTitle="Robin team sign-in"
      signInText="Sign in with your Robin admin Google account."
    >
      {children}
    </RoleGate>
  );
}