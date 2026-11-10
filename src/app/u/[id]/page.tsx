"use client";
import { use, useEffect, useState } from "react";
import { api, timeAgo, type ListingCard, type PublicUser } from "@/components/api";
import { Card, ErrorText, Spinner, TrustLine } from "@/components/ui";
import { ListingGrid } from "@/components/ListingGrid";

interface Data { user: PublicUser; reviews: { rating: number; comment: string | null; author: string; createdAt: string }[]; listings: ListingCard[] }

export default function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Data>(`/api/users/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner />;
  const u = data.user;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <h1 className="text-2xl font-bold">{u.name}</h1>
        <div className="mt-2"><TrustLine user={u} link={false} /></div>
        <p className="mt-1 text-sm text-stone-500">{u.city} · Member since {new Date(u.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
        <p className="mt-2 text-xs text-stone-500">Ratings and sale counts only come from transactions completed through the app with escrow, so they can&apos;t be faked.</p>
      </Card>
      <section>
        <h2 className="mb-2 font-semibold">Reviews</h2>
        {data.reviews.length === 0 ? <p className="text-sm text-stone-600">No reviews yet.</p> : (
          <ul className="space-y-2">
            {data.reviews.map((r, i) => (
              <li key={i}><Card><p className="text-amber-500">{"★".repeat(r.rating)}<span className="text-stone-300">{"★".repeat(5 - r.rating)}</span></p>{r.comment && <p className="mt-1 text-sm">{r.comment}</p>}<p className="mt-1 text-xs text-stone-500">{r.author} · {timeAgo(r.createdAt)}</p></Card></li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Items for sale</h2>
        {data.listings.length ? <ListingGrid items={data.listings} /> : <p className="text-sm text-stone-600">Nothing listed right now.</p>}
      </section>
    </div>
  );
}
