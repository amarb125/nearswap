"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "./useMe";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Nearswap";

export function TopNav() {
  const { me } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">⇄</span>
          {APP_NAME}
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-medium sm:flex">
          <Link className="rounded-lg px-3 py-2 hover:bg-stone-100" href="/how-it-works">How it works</Link>
          {me ? (
            <>
              <Link className="rounded-lg px-3 py-2 hover:bg-stone-100" href="/chats">Chats</Link>
              <Link className="relative rounded-lg px-3 py-2 hover:bg-stone-100" href="/orders">
                Orders{me.activeOrders > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{me.activeOrders}</span>}
              </Link>
              <Link className="rounded-lg px-3 py-2 hover:bg-stone-100" href="/account">Account</Link>
              {me.role === "ADMIN" && <Link className="rounded-lg px-3 py-2 hover:bg-stone-100" href="/admin">Admin</Link>}
            </>
          ) : (
            <Link className="rounded-lg px-3 py-2 hover:bg-stone-100" href="/login">Log in</Link>
          )}
          <Link className="ml-2 rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700" href="/sell">+ Sell</Link>
        </nav>
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  const { me } = useMe();
  const items = [
    { href: "/", label: "Browse", icon: "⌂" },
    { href: "/chats", label: "Chats", icon: "💬" },
    { href: "/sell", label: "Sell", icon: "+" },
    { href: "/orders", label: "Orders", icon: "▤", badge: me?.activeOrders },
    { href: me ? "/account" : "/login", label: me ? "Account" : "Log in", icon: "◉" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="grid grid-cols-5">
        {items.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
          return (
            <Link key={i.label} href={i.href} className={`relative flex flex-col items-center py-2 text-xs ${active ? "text-brand-700" : "text-stone-600"}`}>
              <span className={`text-lg leading-6 ${i.label === "Sell" ? "grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white" : ""}`}>{i.icon}</span>
              {i.label}
              {!!i.badge && <span className="absolute right-4 top-1 rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{i.badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
