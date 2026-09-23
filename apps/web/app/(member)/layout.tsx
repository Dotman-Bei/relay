import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Providers } from "../providers";

export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
