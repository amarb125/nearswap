"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, fmtDateTime, formatINR, STATUS_LABEL, type OrderView, type PublicUser } from "@/components/api";
import { Badge, Button, Card, ErrorText, Modal, Spinner, TrustLine } from "@/components/ui";
import { pay, type Checkout } from "@/components/checkout";
import { useMe } from "@/components/useMe";

interface Data {
  order: OrderView;
  listing: { id: string; title: string; image: string | null; area: string; city: string };
  other: PublicUser;
  conversationId: string | null;
  myReview: { rating: number } | null;
  timeline: { type: string; at: string; byMe: boolean; system: boolean }[];
}

const EVENT_LABEL: Record<string, string> = {
  RESERVED: "Item reserved", PAID: "Payment held in escrow", MEETUP_SET: "Meetup set", WRONG_CODE: "Wrong handover code entered",
  COMPLETED: "Handover complete", REJECTED: "Buyer rejected the item", CANCELLED: "Order cancelled", NO_SHOW_REPORTED: "No-show reported",
  SELLER_NO_SHOW: "Seller no-show confirmed", BUYER_NO_SHOW: "Buyer no-show confirmed", DISPUTED: "Dispute opened",
  DISPUTE_RESOLVED: "Dispute resolved", REFUND_ISSUED: "Refund issued", PAYOUT_SENT: "Payout sent to seller",
  PAYMENT_WINDOW_EXPIRED: "Reservation expired (not paid)", DEADLINE_EXPIRED: "Deadline passed — refunded", LATE_PAYMENT_REFUND: "Late payment refunded",
};

const SAFE_SPOTS = ["Metro station entrance", "Mall food court", "Café (e.g. near main market)", "Petrol pump", "Police station / chowki lobby"];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const justPaid = useSearchParams().get("paid");
  const { refresh: refreshMe } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [modal, setModal] = useState<null | "reject" | "cancel" | "dispute" | "contest" | "showcode">(null);
  const [reason, setReason] = useState("");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState("");
  const [editMeetup, setEditMeetup] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/orders/${id}`)); } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Keep both sides in sync during the live part of the deal
  useEffect(() => {
    if (!data || !["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(data.order.status)) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [data, load]);

  async function act(action: string, extra: object = {}, key = action) {
    setBusy(key); setError(null);
    try {
      const r = await api<{ code?: string }>(`/api/orders/${id}`, { body: { action, ...extra } });
      if (r.code) setCode(r.code);
      setModal(null); setReason("");
      await load(); refreshMe();
      return true;
    } catch (e) { setError((e as Error).message); await load(); return false; } finally { setBusy(null); }
  }

  async function payNow() {
    setBusy("pay"); setError(null);
    try {
      const { checkout } = await api<{ checkout: Checkout }>(`/api/orders/${id}`, { body: { action: "checkout" } });
      await pay(id, checkout, { title: data!.listing.title });
      await load(); refreshMe();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner />;
  const { order: o, listing, other } = data;
  const isBuyer = o.role === "buyer";
  const st = STATUS_LABEL[o.status];
  const meetupPassed = o.meetupAt && Date.now() > new Date(o.meetupAt).getTime() + 15 * 60_000;
  const reportedAgainstMe = o.noShowReportedBy && o.noShowReportedBy !== (isBuyer ? "BUYER" : "SELLER");
  const iReported = o.noShowReportedBy && !reportedAgainstMe;
  const codeLocked = o.codeLockedUntil && new Date(o.codeLockedUntil) > new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/orders" className="text-sm text-brand-700">← All orders</Link>

      <Card className="flex gap-3">
        <Link href={`/listings/${listing.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {listing.image && <img src={listing.image} alt="" className="h-full w-full object-cover" />}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge><span className="text-xs text-stone-500">You are the {o.role}</span></div>
          <p className="mt-1 truncate font-semibold">{listing.title}</p>
          <p className="text-lg font-bold">{formatINR(o.pricePaise)}</p>
        </div>
      </Card>

      <Card>
        <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">{isBuyer ? "Seller" : "Buyer"}</p>
        <TrustLine user={other} />
        {data.conversationId && <Link href={`/chats/${data.conversationId}`}><Button variant="secondary" className="mt-3 w-full">💬 Open chat</Button></Link>}
      </Card>

      {justPaid && o.status === "PAID" && !o.meetupAt && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">✅ Payment received and held in escrow. Next: agree a meetup time and place with the seller.</p>
      )}
      <ErrorText>{error}</ErrorText>

      {/* ---------- AWAITING PAYMENT ---------- */}
      {o.status === "PENDING_PAYMENT" && (
        <Card className="space-y-3">
          {isBuyer ? (
            <>
              <p className="text-sm">The item is held for you until <b>{fmtDateTime(o.paymentExpiresAt)}</b>. Complete payment to confirm.</p>
              <Button className="w-full" loading={busy === "pay"} onClick={payNow}>Pay {formatINR(o.pricePaise)} into escrow</Button>
              <Button variant="ghost" className="w-full" onClick={() => setModal("cancel")}>Cancel reservation</Button>
            </>
          ) : <p className="text-sm">The buyer has reserved your item and is completing payment. You&apos;ll be notified in chat once the money is in escrow.</p>}
        </Card>
      )}

      {/* ---------- PAID: MEETUP + HANDOVER ---------- */}
      {o.status === "PAID" && (
        <>
          {reportedAgainstMe && (
            <Card className="border-red-200 bg-red-50 text-sm">
              <p className="font-semibold text-red-900">The {isBuyer ? "seller" : "buyer"} reported that you didn&apos;t come to the meetup.</p>
              <p className="mt-1 text-red-800">If this isn&apos;t true, contest it now. Otherwise it becomes final automatically.</p>
              <Button variant="danger" className="mt-3" onClick={() => setModal("contest")}>Contest this</Button>
            </Card>
          )}
          {iReported && <Card className="bg-amber-50 text-sm">You reported a no-show. If the other person doesn&apos;t contest it, it&apos;s settled automatically within a day.</Card>}

          <Card className="space-y-3">
            <h2 className="font-semibold">1. Meetup</h2>
            {o.meetupAt && !editMeetup ? (
              <div className="flex items-start justify-between gap-2 text-sm">
                <div><p>📍 <b>{o.meetupPlace}</b></p><p>🕒 {fmtDateTime(o.meetupAt)}</p></div>
                <Button variant="ghost" onClick={() => { setPlace(o.meetupPlace ?? ""); setWhen(toLocalInput(new Date(o.meetupAt!))); setEditMeetup(true); }}>Change</Button>
              </div>
            ) : (
              <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await act("meetup", { place, at: new Date(when).toISOString() })) setEditMeetup(false); }}>
                <p className="text-sm text-stone-600">Agree in chat first, then save it here so it&apos;s on record.</p>
                <input className="w-full" placeholder="Public place, e.g. Kothrud metro station, gate 1" value={place} onChange={(e) => setPlace(e.target.value)} required minLength={3} />
                <div className="flex flex-wrap gap-1">{SAFE_SPOTS.map((s) => <button type="button" key={s} onClick={() => setPlace(s)} className="rounded-full bg-stone-100 px-2 py-1 text-xs hover:bg-stone-200">{s}</button>)}</div>
                <input className="w-full" type="datetime-local" value={when} min={toLocalInput(new Date())} max={o.deadlineAt ? toLocalInput(new Date(o.deadlineAt)) : undefined} onChange={(e) => setWhen(e.target.value)} required aria-label="Meetup time" />
                <Button className="w-full" loading={busy === "meetup"}>Save meetup</Button>
              </form>
            )}
            {o.deadlineAt && <p className="text-xs text-stone-500">Handover must happen before {fmtDateTime(o.deadlineAt)}, otherwise the buyer is refunded automatically.</p>}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">2. Inspect & hand over</h2>
            {isBuyer ? (
              <>
                <p className="text-sm text-stone-700">Check the item carefully. <b>Only when you&apos;re happy</b>, show your handover code to the seller. Once they enter it, the payment is released and the sale is final.</p>
                <Button className="w-full" onClick={() => (code ? setModal("showcode") : setModal("showcode"))}>I&apos;ve checked the item — show my code</Button>
                <Button variant="danger" className="w-full" onClick={() => setModal("reject")}>Item not as described — reject & get refund</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-700">Let the buyer inspect the item. <b>Don&apos;t hand it over until the code below is accepted</b> — that&apos;s what guarantees your payment.</p>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("complete", { code: codeInput }); }}>
                  <input className="flex-1 text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} placeholder="••••••" value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))} aria-label="Buyer's handover code" disabled={!!codeLocked} />
                  <Button loading={busy === "complete"} disabled={codeInput.length !== 6 || !!codeLocked}>Confirm</Button>
                </form>
                {codeLocked && <p className="text-xs text-red-700">Too many wrong codes. Try again after {fmtDateTime(o.codeLockedUntil!)}.</p>}
                <p className="text-xs text-stone-500">You&apos;ll receive {formatINR(o.sellerPayoutPaise ?? 0)} ({formatINR(o.pricePaise)} − {formatINR(o.feePaise ?? 0)} fee).</p>
              </>
            )}
          </Card>

          <Card className="space-y-2 text-sm">
            <h2 className="font-semibold">Something went wrong?</h2>
            <div className="flex flex-wrap gap-2">
              {!o.noShowReportedBy && (
                <Button variant="secondary" disabled={!meetupPassed} loading={busy === "no_show"} onClick={() => confirm(`Report that the ${isBuyer ? "seller" : "buyer"} didn't come?`) && act("no_show")}>
                  {isBuyer ? "Seller" : "Buyer"} didn&apos;t show up
                </Button>
              )}
              <Button variant="secondary" onClick={() => setModal("cancel")}>Cancel order</Button>
              <Button variant="secondary" onClick={() => setModal("dispute")}>Get help</Button>
            </div>
            {!meetupPassed && !o.noShowReportedBy && <p className="text-xs text-stone-500">No-shows can be reported 15 min after the saved meetup time.</p>}
            {!isBuyer && <p className="text-xs text-amber-800">Cancelling a paid order as the seller adds a strike to your account.</p>}
          </Card>
        </>
      )}

      {o.status === "DISPUTED" && (
        <Card className="bg-amber-50 text-sm">
          <p className="font-semibold">Our team is reviewing this order.</p>
          <p className="mt-1">Reason: {o.disputeReason}</p>
          <p className="mt-1">The money stays safely in escrow until a decision is made (usually within 48 hours). Please keep all communication in the chat.</p>
        </Card>
      )}

      {/* ---------- CLOSED ---------- */}
      {o.closedAt && o.status !== "PENDING_PAYMENT" && (
        <Card className="space-y-1 text-sm">
          <h2 className="mb-1 font-semibold">Money</h2>
          {o.status === "COMPLETED" && !isBuyer && (
            <>
              <Row k="Sale price" v={formatINR(o.pricePaise)} />
              <Row k="Platform fee" v={`− ${formatINR(o.feePaise ?? 0)}`} />
              <Row k="You receive" v={formatINR(o.transferPaise ?? 0)} bold />
              {o.payoutWaitingForSetup ? (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">Your money is safe and waiting. <Link className="underline" href="/account#payouts">Add your bank account</Link> to receive it.</p>
              ) : <p className="text-stone-500">{o.settled ? "Sent to your bank account. Bank transfers usually arrive within 1–2 working days." : "Payout processing…"}</p>}
            </>
          )}
          {o.status === "COMPLETED" && isBuyer && <Row k="Paid" v={formatINR(o.pricePaise)} bold />}
          {o.refundPaise > 0 && (
            <>
              {isBuyer ? <Row k="Refunded to you" v={formatINR(o.refundPaise)} bold /> : <Row k="Refunded to buyer" v={formatINR(o.refundPaise)} />}
              {isBuyer && <p className="text-stone-500">{o.settled ? "Refund issued. It reaches your account in 5–7 working days depending on your bank." : "Refund processing…"}</p>}
            </>
          )}
          {o.compensationPaise > 0 && <Row k={isBuyer ? "No-show compensation to seller" : "No-show compensation to you"} v={formatINR(o.compensationPaise)} />}
          {o.rejectReason && <p className="text-stone-600">Reason: {o.rejectReason}</p>}
          {o.cancelReason && <p className="text-stone-600">Cancelled — {o.cancelReason}</p>}
          {o.adminNote && <p className="text-stone-600">Support note: {o.adminNote}</p>}
        </Card>
      )}

      {o.status === "COMPLETED" && (
        <Card>
          {data.myReview ? <p className="text-sm">You rated this {isBuyer ? "seller" : "buyer"} {"★".repeat(data.myReview.rating)}. Thanks!</p> : (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act("review", { rating, comment: comment || undefined }); }}>
              <h2 className="font-semibold">Rate the {isBuyer ? "seller" : "buyer"}</h2>
              <div className="flex gap-1 text-3xl" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-label={`${n} stars`} onClick={() => setRating(n)} className={n <= rating ? "text-amber-500" : "text-stone-300"}>★</button>)}
              </div>
              <textarea className="w-full" rows={2} placeholder="Optional comment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button disabled={!rating} loading={busy === "review"}>Submit rating</Button>
            </form>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Timeline</h2>
        <ol className="space-y-1 text-sm">
          {data.timeline.map((e, i) => (
            <li key={i} className="flex justify-between gap-2"><span>{EVENT_LABEL[e.type] ?? e.type}{e.byMe ? " (you)" : ""}</span><span className="shrink-0 text-stone-500">{fmtDateTime(e.at)}</span></li>
          ))}
        </ol>
      </Card>

      {/* ---------- MODALS ---------- */}
      <Modal open={modal === "showcode"} onClose={() => setModal(null)} title="Your handover code">
        {code ? (
          <div className="text-center">
            <p className="font-mono text-5xl font-bold tracking-[0.3em]">{code}</p>
            <p className="mt-3 text-sm text-stone-600">Show this to the seller. Once they enter it, the payment is released and the sale is final.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900">⚠️ Only reveal the code once you have the item in hand and you&apos;re satisfied. Never share it over phone or chat.</p>
            <Button className="w-full" loading={busy === "reveal_code"} onClick={() => act("reveal_code").then(() => setModal("showcode"))}>Reveal code</Button>
          </div>
        )}
      </Modal>
      <ReasonModal open={modal === "reject"} title="Reject the item" placeholder="What's wrong? e.g. screen is cracked, not mentioned in listing" cta="Reject & get full refund" min={5}
        reason={reason} setReason={setReason} busy={busy === "reject"} onClose={() => setModal(null)} onSubmit={() => act("reject", { reason })} />
      <ReasonModal open={modal === "cancel"} title="Cancel order" placeholder="Why are you cancelling?" cta="Cancel order" min={3}
        note={o.status === "PAID" ? `The buyer gets a full refund of ${formatINR(o.pricePaise)}.${isBuyer ? "" : " This adds a strike to your account."}` : undefined}
        reason={reason} setReason={setReason} busy={busy === "cancel"} onClose={() => setModal(null)} onSubmit={() => act("cancel", { reason })} />
      <ReasonModal open={modal === "dispute"} title="Get help from support" placeholder="Describe what happened (e.g. buyer took the item without giving the code)" cta="Open dispute" min={10}
        note="The money stays in escrow until support decides. Include as much detail as possible."
        reason={reason} setReason={setReason} busy={busy === "dispute"} onClose={() => setModal(null)} onSubmit={() => act("dispute", { reason })} />
      <ReasonModal open={modal === "contest"} title="Contest no-show report" placeholder="e.g. I was at the gate at 5pm, the seller wasn't there" cta="Send to support" min={5}
        reason={reason} setReason={setReason} busy={busy === "contest"} onClose={() => setModal(null)} onSubmit={() => act("contest", { reason })} />
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}><span>{k}</span><span>{v}</span></div>;
}

function ReasonModal(p: { open: boolean; title: string; placeholder: string; cta: string; min: number; note?: string; reason: string; setReason: (s: string) => void; busy: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal open={p.open} onClose={p.onClose} title={p.title}>
      <div className="space-y-3">
        {p.note && <p className="text-sm text-stone-600">{p.note}</p>}
        <textarea className="w-full" rows={3} placeholder={p.placeholder} value={p.reason} onChange={(e) => p.setReason(e.target.value)} />
        <Button className="w-full" loading={p.busy} disabled={p.reason.trim().length < p.min} onClick={p.onSubmit}>{p.cta}</Button>
      </div>
    </Modal>
  );
}
