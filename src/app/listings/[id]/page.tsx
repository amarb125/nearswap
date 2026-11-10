"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, formatINR, timeAgo, type ListingCard, type OrderView } from "@/components/api";
import { Badge, Button, Card, ErrorText, Modal, Spinner, TrustLine } from "@/components/ui";
import { useMe } from "@/components/useMe";
import { pay, type Checkout } from "@/components/checkout";

const COND: Record<string, string> = { NEW: "New", LIKE_NEW: "Like new", GOOD: "Good", FAIR: "Fair", FOR_PARTS: "For parts" };

interface Data { listing: ListingCard; isOwner: boolean; myOrder: OrderView | null; feePreviewPaise?: number }

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = useSearchParams().get("new");
  const { me } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [img, setImg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => api<Data>(`/api/listings/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const requireLogin = () => { if (!me) { router.push(`/login?next=/listings/${id}`); return true; } return false; };

  async function chat() {
    if (requireLogin()) return;
    setBusy("chat");
    try { const r = await api<{ id: string }>("/api/conversations", { body: { listingId: id } }); router.push(`/chats/${r.id}`); }
    catch (e) { setError((e as Error).message); setBusy(null); }
  }

  async function reserve() {
    setConfirmOpen(false);
    setBusy("reserve"); setError(null);
    let orderId: string | undefined;
    try {
      const r = await api<{ orderId: string; checkout: Checkout }>("/api/orders", { body: { listingId: id } });
      orderId = r.orderId;
      await pay(r.orderId, r.checkout, { title: data!.listing.title });
      router.push(`/orders/${r.orderId}?paid=1`);
    } catch (e) {
      setError((e as Error).message + (orderId ? " The item is held for you for a few minutes — you can pay from your Orders page." : ""));
      setBusy(null);
      load();
    }
  }

  async function ownerAction(body: object, key: string) {
    setBusy(key); setError(null);
    try { const r = await api<{ nudge?: string }>(`/api/listings/${id}`, { method: "PATCH", body }); if (r.nudge) setNotice(r.nudge); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function report() {
    setBusy("report");
    try { await api(`/api/listings/${id}/report`, { body: { reason: reportText } }); setReportOpen(false); setNotice("Thanks — our team will review this listing."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner />;
  const l = data.listing;

  return (
    <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="aspect-square overflow-hidden rounded-2xl bg-stone-100">
          {l.images[img] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.images[img]} alt={l.title} className="h-full w-full object-contain" />}
        </div>
        {l.images.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {l.images.map((src, i) => (
              <button key={src} onClick={() => setImg(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 ${i === img ? "ring-brand-600" : "ring-transparent"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isNew && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">🎉 Your listing is live! Buyers nearby can now find it.</p>}
        {notice && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{notice}</p>}
        <div>
          <p className="text-3xl font-bold">{formatINR(l.pricePaise)}</p>
          <h1 className="text-xl font-semibold">{l.title}</h1>
          <p className="mt-1 text-sm text-stone-600">📍 {l.area}, {l.city} · {timeAgo(l.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{l.category}</Badge><Badge>{COND[l.condition]}</Badge>
            {l.status === "RESERVED" && <Badge tone="amber">Reserved</Badge>}
            {l.status === "SOLD" && <Badge tone="stone">Sold</Badge>}
          </div>
        </div>

        {data.myOrder ? (
          <Card className="bg-sky-50">
            <p className="text-sm">You have an active order for this item.</p>
            <Link href={`/orders/${data.myOrder.id}`}><Button className="mt-2 w-full">View order</Button></Link>
          </Card>
        ) : data.isOwner ? (
          l.status === "ACTIVE" && (
            <Card className="space-y-3">
              <p className="text-sm text-stone-600">If it sells, you&apos;ll receive <b>{formatINR(l.pricePaise - (data.feePreviewPaise ?? 0))}</b> (after {formatINR(data.feePreviewPaise ?? 0)} fee).</p>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ownerAction({ pricePaise: Math.round(Number(editPrice) * 100) }, "price"); }}>
                <input className="flex-1" inputMode="decimal" placeholder="New price (₹)" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} aria-label="New price" />
                <Button variant="secondary" loading={busy === "price"} disabled={!editPrice}>Update price</Button>
              </form>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" loading={busy === "sold"} onClick={() => ownerAction({ action: "sold_elsewhere" }, "sold")}>Sold elsewhere</Button>
                <Button variant="danger" className="flex-1" loading={busy === "remove"} onClick={() => confirm("Remove this listing?") && ownerAction({ action: "remove" }, "remove")}>Remove</Button>
              </div>
            </Card>
          )
        ) : l.status === "ACTIVE" ? (
          <div className="space-y-2">
            <Button className="w-full py-3 text-base" loading={busy === "reserve"} onClick={() => !requireLogin() && setConfirmOpen(true)}>Reserve & pay {formatINR(l.pricePaise)}</Button>
            <Button variant="secondary" className="w-full" loading={busy === "chat"} onClick={chat}>💬 Chat with seller</Button>
            <p className="text-center text-xs text-stone-600">🔒 Your money is held in escrow. The seller only gets paid when you hand over your code after checking the item. Don&apos;t like it? Full refund.</p>
          </div>
        ) : (
          <Card><p className="text-sm text-stone-600">This item is {l.status === "RESERVED" ? "reserved by another buyer. It may become available again if they don't complete the purchase" : "no longer available"}.</p></Card>
        )}

        <ErrorText>{error}</ErrorText>

        <Card>
          <h2 className="mb-2 font-semibold">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-stone-800">{l.description}</p>
        </Card>
        {l.seller && (
          <Card>
            <h2 className="mb-2 font-semibold">Seller</h2>
            <TrustLine user={l.seller} />
            <p className="mt-1 text-xs text-stone-500">Member since {new Date(l.seller.memberSince).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
          </Card>
        )}
        <Card className="text-sm text-stone-700">
          <h2 className="mb-2 font-semibold">Stay safe</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Always pay through the app — never by cash or direct UPI. Off-app payments are not protected.</li>
            <li>Meet in a busy public place (metro station, mall, café) during the day.</li>
            <li>Check the item fully before giving your handover code.</li>
          </ul>
        </Card>
        {!data.isOwner && me && <button className="text-xs text-stone-500 underline" onClick={() => setReportOpen(true)}>Report this listing</button>}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="How your payment is protected">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li>You pay <b>{formatINR(l.pricePaise)}</b> now. It&apos;s held in escrow — the seller doesn&apos;t receive it yet.</li>
          <li>Agree a public meetup place and time in chat.</li>
          <li>Inspect the item. If you&apos;re happy, show the seller your <b>6-digit handover code</b>. Only then is the seller paid.</li>
          <li>Not as described? Tap <b>Reject</b> for a full refund.</li>
        </ol>
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">If you don&apos;t turn up at the agreed time, a small part of the payment may go to the seller to cover their time.</p>
        <Button className="mt-4 w-full" onClick={reserve}>Continue to payment</Button>
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report listing">
        <textarea className="w-full" rows={3} placeholder="What's wrong? (scam, prohibited item, fake photos…)" value={reportText} onChange={(e) => setReportText(e.target.value)} />
        <Button className="mt-3 w-full" loading={busy === "report"} disabled={reportText.trim().length < 5} onClick={report}>Send report</Button>
      </Modal>
    </div>
  );
}
