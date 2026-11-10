"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, formatINR, timeAgo, type PublicUser } from "@/components/api";
import { Empty, ErrorText, Spinner } from "@/components/ui";

interface Item { id: string; listing: { title: string; image: string | null; pricePaise: number }; other: PublicUser; role: string; lastMessage: string | null; lastMessageAt: string }

export default function Chats() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: Item[] }>("/api/conversations").then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, []);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Chats</h1>
      <ErrorText>{error}</ErrorText>
      {!items ? <Spinner /> : items.length === 0 ? <Empty title="No conversations yet">Tap &quot;Chat with seller&quot; on any listing to ask a question.</Empty> : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/chats/${c.id}`} className="flex gap-3 p-3 hover:bg-stone-50">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.listing.image && <img src={c.listing.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><p className="truncate font-semibold">{c.other.name} <span className="font-normal text-stone-500">· {c.listing.title}</span></p><span className="shrink-0 text-xs text-stone-500">{timeAgo(c.lastMessageAt)}</span></div>
                  <p className="truncate text-sm text-stone-600">{c.lastMessage ?? `${c.role === "buyer" ? "You asked about" : "Interested in"} ${formatINR(c.listing.pricePaise)} item`}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
