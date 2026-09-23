import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Relay — later, together", template: "%s · Relay" },
  description:
    "A group time capsule on BOT Chain testnet. Everyone encrypts their piece now; the chain records who agreed, to which date and rule, and when it opened.",
};

export const viewport: Viewport = { themeColor: "#fdf6e3", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <a href="#main" className="neo-btn sr-only rounded-lg bg-yellow px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
