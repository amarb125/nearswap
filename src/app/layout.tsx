import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { MeProvider } from "@/components/useMe";
import { BottomNav, TopNav } from "@/components/Nav";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Nearswap";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} – Buy & sell with neighbours, safely`, template: `%s · ${APP_NAME}` },
  description: "Sell things you don't need to people nearby. Pay safely through escrow, meet in person, no delivery.",
  applicationName: APP_NAME,
};

export const viewport: Viewport = { themeColor: "#059669", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <MeProvider>
          <TopNav />
          <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-12">{children}</main>
          <footer className="mx-auto hidden max-w-5xl gap-4 px-4 pb-8 text-xs text-stone-500 sm:flex">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/safety">Safety & prohibited items</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </footer>
          <BottomNav />
        </MeProvider>
      </body>
    </html>
  );
}
