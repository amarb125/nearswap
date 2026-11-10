"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ListingCard } from "@/components/api";
import { useLocation } from "@/components/useLocation";
import { ListingGrid } from "@/components/ListingGrid";
import { Button, Empty, ErrorText, Spinner } from "@/components/ui";

const CATEGORIES = ["Electronics", "Mobiles", "Furniture", "Home & Kitchen", "Books", "Fashion", "Sports & Fitness", "Kids & Baby", "Vehicles & Parts", "Musical Instruments", "Tools", "Other"];

export default function Home() {
  const { loc, save, detect, error: locError, locating } = useLocation();
  const [cityInput, setCityInput] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [radius, setRadius] = useState(10);
  const [sort, setSort] = useState("nearest");
  const [items, setItems] = useState<ListingCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loc) return;
    const params = new URLSearchParams({ sort, page: String(page), radiusKm: String(radius) });
    if (loc.lat !== undefined) { params.set("lat", String(loc.lat)); params.set("lng", String(loc.lng)); }
    else if (loc.city) params.set("city", loc.city);
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    setLoading(true);
    setError(null);
    api<{ items: ListingCard[]; hasMore: boolean }>(`/api/listings?${params}`)
      .then((r) => { setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items])); setHasMore(r.hasMore); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loc, query, category, radius, sort, page]);

  const resetAnd = (fn: () => void) => { setPage(1); fn(); };

  if (!loc) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Buy and sell with people near you</h1>
        <p className="mt-3 text-stone-600">Your money stays in escrow until you&apos;ve seen the item in person. No delivery, no scams.</p>
        <div className="mt-8 space-y-3">
          <Button className="w-full" onClick={detect} loading={locating}>📍 Use my location</Button>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (cityInput.trim()) save({ city: cityInput.trim(), label: cityInput.trim() }); }}>
            <input className="flex-1" placeholder="or enter your city (e.g. Pune)" value={cityInput} onChange={(e) => setCityInput(e.target.value)} aria-label="City" />
            <Button variant="secondary" type="submit">Go</Button>
          </form>
          <ErrorText>{locError}</ErrorText>
        </div>
        <Link href="/how-it-works" className="mt-8 inline-block text-sm text-brand-700 underline">How does it work?</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">📍 {loc.label}</span>
        <button className="text-brand-700 underline" onClick={() => { try { localStorage.removeItem("ns_location"); } catch {} location.reload(); }}>change</button>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); resetAnd(() => setQuery(q.trim())); }}>
        <input className="flex-1" type="search" placeholder="Search for cycles, sofas, phones…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <Button type="submit">Search</Button>
      </form>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={!category} onClick={() => resetAnd(() => setCategory(""))}>All</Chip>
        {CATEGORIES.map((c) => <Chip key={c} active={category === c} onClick={() => resetAnd(() => setCategory(c))}>{c}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {loc.lat !== undefined && (
          <select value={radius} onChange={(e) => resetAnd(() => setRadius(Number(e.target.value)))} aria-label="Distance">
            {[2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>Within {r} km</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => resetAnd(() => setSort(e.target.value))} aria-label="Sort">
          {loc.lat !== undefined && <option value="nearest">Nearest first</option>}
          <option value="newest">Newest first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>
      <ErrorText>{error}</ErrorText>
      {loading && page === 1 ? <Spinner /> : items.length === 0 ? (
        <Empty title="Nothing here yet">Try a bigger distance, another category — or <Link className="text-brand-700 underline" href="/sell">list something yourself</Link>.</Empty>
      ) : (
        <>
          <ListingGrid items={items} />
          {hasMore && <div className="text-center"><Button variant="secondary" loading={loading} onClick={() => setPage((p) => p + 1)}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-100"}`}>
      {children}
    </button>
  );
}
