"use client";
import Link from "next/link";
import { formatINR, timeAgo, type ListingCard } from "./api";

export function ListingGrid({ items }: { items: ListingCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((l) => (
        <Link key={l.id} href={`/listings/${l.id}`} className="group overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:shadow-md">
          <div className="aspect-square bg-stone-100">
            {l.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="grid h-full place-items-center text-stone-400">No photo</div>
            )}
          </div>
          <div className="p-3">
            <p className="font-bold">{formatINR(l.pricePaise)}</p>
            <p className="line-clamp-1 text-sm text-stone-800">{l.title}</p>
            <p className="mt-1 line-clamp-1 text-xs text-stone-500">
              {l.area}{l.distanceKm !== undefined && ` · ${l.distanceKm < 1 ? "<1" : l.distanceKm} km`} · {timeAgo(l.createdAt)}
            </p>
            {l.status !== "ACTIVE" && <p className="mt-1 text-xs font-semibold text-amber-700">{l.status === "RESERVED" ? "Reserved" : l.status === "SOLD" ? "Sold" : l.status}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
