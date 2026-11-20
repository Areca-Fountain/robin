import type { ReactNode } from "react";
import RoleGate from "@/components/auth/RoleGate";

// Registrar accounts only. A first-time Google login here becomes a registrar.
export default function RegistrarLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="registrar" registerAs="registrar">
      {children}
    </RoleGate>
  );
}