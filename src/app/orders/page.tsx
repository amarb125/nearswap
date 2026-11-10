"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, formatINR, STATUS_LABEL, timeAgo, type OrderView, type PublicUser } from "@/components/api";
import { Badge, Empty, ErrorText, Spinner } from "@/components/ui";

type Item = OrderView & { listing: { id: string; title: string; image: string | null }; other: PublicUser };

export default function Orders() {
  const [role, setRole] = useState<"" | "buyer" | "seller">("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItems(null);
    api<{ items: Item[] }>(`/api/orders${role ? `?role=${role}` : ""}`).then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, [role]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <div className="flex gap-2">
        {([["", "All"], ["buyer", "Buying"], ["seller", "Selling"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setRole(v)} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${role === v ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-stone-300"}`}>{l}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {!items ? <Spinner /> : items.length === 0 ? <Empty title="No orders yet">When you reserve or sell an item, it shows up here.</Empty> : (
        <ul className="space-y-2">
          {items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3 hover:bg-stone-50">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {o.listing.image && <img src={o.listing.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{o.listing.title}</p><span className="shrink-0 font-bold">{formatINR(o.pricePaise)}</span></div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <Badge tone={STATUS_LABEL[o.status].tone}>{STATUS_LABEL[o.status].label}</Badge>
                    <span>{o.role === "buyer" ? "Buying from" : "Selling to"} {o.other.name}</span>
                    <span>· {timeAgo(o.createdAt)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
