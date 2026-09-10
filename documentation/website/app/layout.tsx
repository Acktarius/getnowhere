import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

import "./global.css";

export const metadata = {
  title: {
    default: "Get NowHere documentation",
    template: "%s | Get NowHere",
  },
  description:
    "Public documentation for Get NowHere, a web-first Conceal wallet and private-relationship client.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          search={{
            options: {
              type: "static",
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
