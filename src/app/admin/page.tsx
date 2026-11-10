"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtDateTime, formatINR, STATUS_LABEL } from "@/components/api";
import { Badge, Button, Card, Empty, ErrorText, Spinner } from "@/components/ui";
import { useMe } from "@/components/useMe";

interface Party { id: string; name: string | null; phone: string; [k: string]: unknown }
interface AdminOrder {
  id: string; status: string; pricePaise: number; feePaise: number; disputeReason: string | null; noShowReportedBy: string | null;
  meetupPlace: string | null; meetupAt: string | null; settlementError: string | null; createdAt: string;
  listing: { id: string; title: string }; buyer: Party; seller: Party;
  events: { type: string; actorId: string | null; data: unknown; at: string }[];
  messages: { from: string; body: string; at: string }[];
}
interface Stats { users: number; activeListings: number; completed30d: number; revenue30dPaise: number; gmv30dPaise: number; openDisputes: number; unsettledOrders: number; soldOffPlatform30d: number }
interface ReportItem { id: string; reason: string; createdAt: string; reporter: string | null; listing: { id: string; title: string; status: string; sellerId: string; sellerName: string | null } | null }

export default function Admin() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<"disputed" | "unsettled" | "reports">("disputed");
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await api<Stats>("/api/admin/stats"));
      if (tab === "reports") setReports((await api<{ items: ReportItem[] }>("/api/admin/reports")).items);
      else setOrders((await api<{ items: AdminOrder[] }>(`/api/admin/orders?filter=${tab}`)).items);
    } catch (e) { setError((e as Error).message); }
  }, [tab]);
  useEffect(() => { if (me?.role === "ADMIN") load(); }, [me, load]);

  async function run(key: string, path: string, body: object) {
    setBusy(key); setError(null);
    try { await api(path, { body }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  if (loading) return <Spinner />;
  if (me?.role !== "ADMIN") return <Empty title="Admins only" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Revenue (30d)", formatINR(stats.revenue30dPaise)], ["GMV (30d)", formatINR(stats.gmv30dPaise)], ["Sales (30d)", stats.completed30d],
            ["Users", stats.users], ["Active listings", stats.activeListings], ["Open disputes", stats.openDisputes],
            ["Unsettled orders", stats.unsettledOrders], ["Sold off-platform (30d)", stats.soldOffPlatform30d],
          ].map(([k, v]) => <Card key={k as string} className="!p-3"><p className="text-xs text-stone-500">{k}</p><p className="text-xl font-bold">{v}</p></Card>)}
        </div>
      )}
      <div className="flex gap-2">
        {(["disputed", "unsettled", "reports"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize ring-1 ring-inset ${tab === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-stone-300"}`}>{t}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {tab === "reports" ? (!reports ? <Spinner /> : reports.length === 0 ? <Empty title="No open reports" /> : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id} className="space-y-2 text-sm">
              <p><b>{r.listing ? <Link className="underline" href={`/listings/${r.listing.id}`}>{r.listing.title}</Link> : "—"}</b> by {r.listing?.sellerName} · reported by {r.reporter} · {fmtDateTime(r.createdAt)}</p>
              <p className="rounded bg-stone-50 p-2">{r.reason}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={busy === r.id + "rm"} onClick={() => run(r.id + "rm", "/api/admin/reports", { reportId: r.id, removeListing: true })}>Remove listing</Button>
                <Button variant="secondary" loading={busy === r.id + "ok"} onClick={() => run(r.id + "ok", "/api/admin/reports", { reportId: r.id, removeListing: false })}>Dismiss</Button>
                {r.listing && <Button variant="danger" loading={busy === r.id + "ban"} onClick={() => confirm("Ban this seller?") && run(r.id + "ban", `/api/admin/users/${r.listing!.sellerId}`, { action: "ban" })}>Ban seller</Button>}
              </div>
            </Card>
          ))}
        </div>
      )) : !orders ? <Spinner /> : orders.length === 0 ? <Empty title="Nothing to review 🎉" /> : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_LABEL[o.status].tone}>{STATUS_LABEL[o.status].label}</Badge>
                <Link className="font-semibold underline" href={`/listings/${o.listing.id}`}>{o.listing.title}</Link>
                <span>{formatINR(o.pricePaise)}</span><span className="text-stone-500">#{o.id.slice(-8)} · {fmtDateTime(o.createdAt)}</span>
              </div>
              {o.disputeReason && <p className="rounded bg-amber-50 p-2"><b>Dispute:</b> {o.disputeReason}</p>}
              {o.settlementError && <p className="rounded bg-red-50 p-2 text-red-800"><b>Settlement error:</b> {o.settlementError}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {(["buyer", "seller"] as const).map((role) => {
                  const p = o[role];
                  return (
                    <div key={role} className="rounded-lg bg-stone-50 p-2">
                      <p className="font-semibold capitalize">{role}: {p.name} <span className="font-normal text-stone-500">{p.phone}</span></p>
                      <p className="text-xs text-stone-600">{Object.entries(p).filter(([k]) => !["id", "name", "phone"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                      <div className="mt-1 flex gap-1">
                        <button className="text-xs text-red-700 underline" onClick={() => confirm(`Ban ${role}?`) && run(o.id + role, `/api/admin/users/${p.id}`, { action: "ban" })}>ban</button>
                        <button className="text-xs underline" onClick={() => run(o.id + role, `/api/admin/users/${p.id}`, { action: "verify_id" })}>mark ID verified</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {o.meetupPlace && <p>Meetup: {o.meetupPlace} at {o.meetupAt && fmtDateTime(o.meetupAt)}</p>}
              <details><summary className="cursor-pointer text-stone-600">Chat ({o.messages.length}) & events ({o.events.length})</summary>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded bg-stone-50 p-2 text-xs">
                  {[...o.messages.map((m) => ({ at: m.at, t: `[${m.from}] ${m.body}` })), ...o.events.map((e) => ({ at: e.at, t: `⚙ ${e.type} ${e.data ? JSON.stringify(e.data) : ""}` }))]
                    .sort((a, b) => a.at.localeCompare(b.at)).map((x, i) => <p key={i}><span className="text-stone-400">{fmtDateTime(x.at)}</span> {x.t}</p>)}
                </div>
              </details>
              {o.status === "DISPUTED" ? (
                <div className="space-y-2">
                  <input className="w-full" placeholder="Note to both parties (shown in chat)" value={notes[o.id] ?? ""} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {([["PAY_SELLER", "Pay seller"], ["REFUND_BUYER", "Full refund to buyer"], ["BUYER_NO_SHOW", "Buyer no-show"], ["SELLER_NO_SHOW", "Seller no-show"]] as const).map(([r, l]) => (
                      <Button key={r} variant="secondary" loading={busy === o.id + r} onClick={() => confirm(`${l}? This moves money and can't be undone.`) && run(o.id + r, `/api/admin/orders/${o.id}/resolve`, { resolution: r, note: notes[o.id] ?? "" })}>{l}</Button>
                    ))}
                  </div>
                </div>
              ) : <Button variant="secondary" loading={busy === o.id + "retry"} onClick={() => run(o.id + "retry", `/api/admin/orders/${o.id}/resolve`, { resolution: "RETRY_SETTLEMENT" })}>Retry settlement</Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
