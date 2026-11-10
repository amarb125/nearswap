"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { PublicUser } from "./api";

export function Button({ variant = "primary", loading, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
    secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-100 disabled:text-stone-400",
    danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:text-stone-400",
    ghost: "text-stone-700 hover:bg-stone-100",
  }[variant];
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Badge({ tone = "stone", children }: { tone?: "green" | "amber" | "red" | "stone" | "blue"; children: ReactNode }) {
  const t = {
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-800 ring-red-200",
    stone: "bg-stone-100 text-stone-700 ring-stone-200",
    blue: "bg-sky-50 text-sky-800 ring-sky-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t}`}>{children}</span>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" aria-label="Loading" />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function TrustLine({ user, link = true }: { user: PublicUser; link?: boolean }) {
  const name = link ? <Link href={`/u/${user.id}`} className="font-semibold hover:underline">{user.name}</Link> : <span className="font-semibold">{user.name}</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {name}
      {user.idVerified && <Badge tone="green">ID verified</Badge>}
      {user.rating !== null ? (
        <span className="text-stone-700">★ {user.rating.toFixed(1)} <span className="text-stone-500">({user.ratingCount})</span></span>
      ) : (
        <span className="text-stone-500">No ratings yet</span>
      )}
      <span className="text-stone-500">· {user.completedSales} sold · {user.completedBuys} bought</span>
      {user.noShows > 0 && <Badge tone="red">{user.noShows} no-show{user.noShows > 1 ? "s" : ""}</Badge>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
