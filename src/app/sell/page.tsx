"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, formatINR } from "@/components/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { useMe } from "@/components/useMe";
import { computeFee } from "@/lib/money";
import { CITIES } from "@/lib/cities";

const CATEGORIES = ["Electronics", "Mobiles", "Furniture", "Home & Kitchen", "Books", "Fashion", "Sports & Fitness", "Kids & Baby", "Vehicles & Parts", "Musical Instruments", "Tools", "Other"];
const CONDITIONS = [["NEW", "New (unused)"], ["LIKE_NEW", "Like new"], ["GOOD", "Good"], ["FAIR", "Fair (visible wear)"], ["FOR_PARTS", "For parts / not working"]];

export default function Sell() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [cfg, setCfg] = useState<{ feeBps: number; feeMinPaise: number; feeMaxPaise: number } | null>(null);
  const [photos, setPhotos] = useState<{ key: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState({ title: "", description: "", category: "", condition: "GOOD", price: "", city: "", area: "" });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/sell");
    else if (me && !me.city) router.replace("/account?setup=1&next=/sell");
    else if (me) setF((x) => ({ ...x, city: x.city || me.city || "" }));
  }, [me, loading, router]);
  useEffect(() => { api<typeof cfg>("/api/config").then(setCfg).catch(() => {}); }, []);

  const pricePaise = Math.round(Number(f.price.replace(/[,\s]/g, "")) * 100);
  const fee = useMemo(() => (cfg && pricePaise >= 1000 ? computeFee(pricePaise, cfg) : null), [cfg, pricePaise]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true); setError(null);
    try {
      for (const file of Array.from(files).slice(0, 8 - photos.length)) {
        const form = new FormData();
        form.append("file", file);
        const r = await api<{ key: string; url: string }>("/api/uploads", { form });
        setPhotos((p) => [...p, r]);
      }
    } catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }

  function useGps() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError("Couldn't get your location. We'll use your city centre instead."),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cityKey = Object.keys(CITIES).find((c) => c.toLowerCase() === f.city.trim().toLowerCase());
    const point = gps ?? (cityKey ? { lat: CITIES[cityKey][0], lng: CITIES[cityKey][1] } : null);
    if (!point) return setError("Share your location, or pick a city from the list.");
    if (!photos.length) return setError("Add at least one photo.");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/listings", {
        body: { title: f.title, description: f.description, category: f.category, condition: f.condition, pricePaise, images: photos.map((p) => p.key), city: cityKey ?? f.city.trim(), area: f.area, lat: point.lat, lng: point.lng },
      });
      router.push(`/listings/${r.id}?new=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PROFILE_INCOMPLETE") router.push("/account?setup=1&next=/sell");
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Sell something</h1>
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-3">
          <label>Photos (up to 8) — clear photos of any defects build trust</label>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white">✕</button>
              </div>
            ))}
            {photos.length < 8 && (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-stone-300 text-center text-xs text-stone-500 hover:bg-stone-50">
                {uploading ? "Uploading…" : "+ Add photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
              </label>
            )}
          </div>
        </Card>
        <Card className="space-y-3">
          <div className="space-y-1"><label htmlFor="t">Title</label><input id="t" className="w-full" maxLength={80} required minLength={4} value={f.title} onChange={set("title")} placeholder="e.g. Hero Sprint cycle, 26 inch" /></div>
          <div className="space-y-1"><label htmlFor="d">Description</label><textarea id="d" className="w-full" rows={4} maxLength={2000} required minLength={10} value={f.description} onChange={set("description")} placeholder="Age, condition, any defects, why you're selling" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label htmlFor="c">Category</label>
              <select id="c" className="w-full" required value={f.category} onChange={set("category")}><option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="space-y-1"><label htmlFor="cond">Condition</label>
              <select id="cond" className="w-full" value={f.condition} onChange={set("condition")}>{CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <div className="space-y-1">
            <label htmlFor="p">Price (₹)</label>
            <input id="p" className="w-full" inputMode="decimal" required value={f.price} onChange={set("price")} placeholder="1500" />
            {fee !== null && <p className="text-sm text-stone-600">You&apos;ll receive <b>{formatINR(pricePaise - fee)}</b> after the {formatINR(fee)} platform fee. Listing is free — you only pay when it sells.</p>}
          </div>
        </Card>
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label htmlFor="city">City</label><input id="city" list="cities" className="w-full" required value={f.city} onChange={set("city")} /><datalist id="cities">{Object.keys(CITIES).map((c) => <option key={c} value={c} />)}</datalist></div>
            <div className="space-y-1"><label htmlFor="area">Area / locality</label><input id="area" className="w-full" required value={f.area} onChange={set("area")} placeholder="e.g. Kothrud" /></div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm">
            <span>{gps ? "✓ Using your approximate location (rounded to ~100 m, never shown exactly)" : "Share location so nearby buyers find you"}</span>
            {!gps && <Button type="button" variant="secondary" onClick={useGps}>📍 Share</Button>}
          </div>
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" loading={busy} disabled={uploading}>Publish listing</Button>
        <p className="text-center text-xs text-stone-500">No weapons, drugs, alcohol, medicines, animals or ID documents. <a className="underline" href="/safety">Full policy</a></p>
      </form>
    </div>
  );
}
