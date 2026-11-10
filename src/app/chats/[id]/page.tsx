"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, formatINR, STATUS_LABEL, type OrderView, type PublicUser } from "@/components/api";
import { Badge, Button, ErrorText, Spinner, TrustLine } from "@/components/ui";

interface Msg { id: string; mine: boolean; system: boolean; body: string; masked: boolean; createdAt: string }
interface Data { id: string; role: "buyer" | "seller"; listing: { id: string; title: string; image: string | null; pricePaise: number; status: string }; other: PublicUser; order: OrderView | null; contactsUnlocked: boolean; messages: Msg[] }

export default function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>(`/api/conversations/${id}`);
      setData(d);
      if (d.messages.length !== count.current) { count.current = d.messages.length; setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50); }
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true); setError(null);
    try {
      const r = await api<{ notice?: string }>(`/api/conversations/${id}`, { body: { text } });
      setNotice(r.notice ?? null);
      setText("");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  }

  if (error && !data) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner />;
  const o = data.order;

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] max-w-2xl flex-col sm:h-[calc(100dvh-7rem)]">
      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <Link href={`/listings/${data.listing.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {data.listing.image && <img src={data.listing.image} alt="" className="h-full w-full object-cover" />}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{data.listing.title}</p>
            <p className="text-sm font-bold">{formatINR(data.listing.pricePaise)}</p>
          </div>
          {o ? <Link href={`/orders/${o.id}`}><Button variant="secondary">Order <Badge tone={STATUS_LABEL[o.status].tone}>{STATUS_LABEL[o.status].label}</Badge></Button></Link>
            : data.role === "buyer" && data.listing.status === "ACTIVE" && <Link href={`/listings/${data.listing.id}`}><Button>Reserve</Button></Link>}
        </div>
        <TrustLine user={data.other} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {!data.contactsUnlocked && <p className="mx-auto max-w-sm rounded-lg bg-stone-100 p-2 text-center text-xs text-stone-600">🔒 Phone numbers and payment IDs are hidden until the item is paid for in escrow. Never pay outside the app.</p>}
        {data.messages.map((m) => m.system ? (
          <div key={m.id} className="mx-auto max-w-md rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-900">{m.body}</div>
        ) : (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-brand-600 text-white" : "border border-stone-200 bg-white"}`}>
              {m.body}
              <div className={`mt-0.5 text-[10px] ${m.mine ? "text-emerald-100" : "text-stone-400"}`}>{new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {notice && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{notice}</p>}
      <ErrorText>{error}</ErrorText>
      <form onSubmit={send} className="flex gap-2 pt-1">
        <input className="flex-1" placeholder="Type a message…" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <Button loading={sending} disabled={!text.trim()}>Send</Button>
      </form>
    </div>
  );
}
