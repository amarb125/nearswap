# Nearswap — hyperlocal resale marketplace with escrow, no delivery

People sell things they no longer need to buyers **in the same locality or city**. There is no
delivery: buyer and seller meet in person. The platform earns a **commission on every sale**,
and both sides are protected by an **escrow + handover-code** mechanism.

## How the mechanism works

```
Seller lists (free) ─► Buyer reserves & pays ─► money held in ESCROW (payment partner)
                                                   │
                         meet in public, buyer inspects the item
                       ┌───────────────────────────┴───────────────────────────┐
              happy: buyer shows 6-digit code                     not as described: buyer rejects
              seller enters it in the app                         ► full refund, item re-listed
              ► seller paid (price − 5% fee), sale final
```

| Situation | What happens |
|---|---|
| Buyer doesn't pay within 30 min | Reservation expires, item is back on sale |
| Seller doesn't show up / cancels | Buyer gets a full refund, seller gets a **strike** (3 strikes = listings hidden) |
| Buyer doesn't show up | Seller reports it (15 min after the meetup time). If the buyer doesn't contest within 24h, the seller gets 5% (max ₹100) as compensation and the rest is refunded |
| Either side contests, or both report a no-show | Order goes to **DISPUTED**. Money stays in escrow and an admin decides |
| Nobody completes within 72h of payment | Automatic full refund |
| Payment lands after the reservation expired | Automatic full refund |
| Seller hasn't added a bank account yet | Sale completes and the payout waits until the bank account is added |

**Why users stay on the platform:** phone numbers, emails, UPI IDs and messaging links are hidden in
chat until the item is paid for. Ratings and the "X sold" count only come from in-app sales. The
seller gets guaranteed payment and no-show compensation. The fee is low and capped (5%, min ₹10,
max ₹500, all configurable).

## Tech

- **Next.js 16** (App Router), TypeScript, Tailwind. Mobile-first PWA. The whole backend is a JSON API under `/api`, so a native app can reuse it later.
- **PostgreSQL + Prisma 7** (node-postgres driver adapter; connection settings live in `prisma.config.ts`). Nearby search uses an indexed bounding box plus a haversine distance, so PostGIS isn't required.
- **Razorpay Route** for escrow: the buyer pays into the platform's Razorpay account. When the handover completes, a *Transfer* goes to the seller's Linked Account. When the order is rejected or cancelled, the payment is *Refunded*. A `mock` provider exists for local development and is refused in production.
- **Phone OTP login** via MSG91 (India, DLT) or Twilio, with database-backed sessions (httpOnly cookies).
- **Images** go to local disk or any S3-compatible store (AWS S3, Cloudflare R2). Files are checked by magic bytes and capped at 5 MB.

### Correctness and safety guarantees
- Every order state change is a conditional `UPDATE … WHERE status = expected`. Double clicks, the webhook racing the client callback, and cron can never apply a transition twice. Tests cover this, for example 5 buyers reserving the same item at once.
- Money movement (`settle()`) runs after the state change. It is idempotent and protected by a per-order lock, and cron retries it until it succeeds. Failed refund/transfer webhooks re-queue it.
- The payment amount and order id are re-checked with the gateway before an order is marked paid. Checkout and webhook signatures are verified with HMAC.
- The handover code is stored as an HMAC (plus AES-GCM encrypted so the buyer can view it again). Only the buyer can reveal it and only the seller can submit it. Five wrong tries lock entry for 15 minutes.
- Seller locations are rounded to ~100 m. Phone numbers are never exposed through the API.
- CSRF origin check on all mutations, Postgres-backed rate limits (OTP, chat, reservations, uploads), strict CSP and security headers, prohibited-items filter, user reports, bans.
- The server refuses to start in production with the mock payment provider, console SMS, or missing secrets.

## Run locally

```bash
cp .env.example .env            # set APP_SECRET (openssl rand -base64 48) and CRON_SECRET
npm install
npx prisma migrate deploy       # needs a Postgres DATABASE_URL
npm run dev                     # http://localhost:3000
```
In dev the OTP is shown on the login screen, and payments use a "simulate payment" confirm dialog.

Tests (need a separate Postgres DB, default `nearswap_test`; set `TEST_DATABASE_URL` to override):
```bash
npm test
```

## Deploy to production

1. **Razorpay**: create an account, complete KYC, and **enable Route** (ask Razorpay support). Then:
   - set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`;
   - in Dashboard → Webhooks, add `https://YOUR_DOMAIN/api/payments/razorpay/webhook` with events
     `payment.authorized`, `payment.captured`, `transfer.failed`, `refund.failed`, `product.route.activated`,
     and set `RAZORPAY_WEBHOOK_SECRET`.
2. **SMS**: MSG91 with a DLT-approved OTP template (`##OTP##`), or Twilio.
3. **Storage**: an S3/R2 bucket with a public CDN URL (`S3_*` vars).
4. `ADMIN_PHONES` = your number(s). They get the `/admin` dashboard (disputes, unsettled payments, reports, revenue).
5. Run it:
   ```bash
   docker compose up -d --build
   ```
   This runs Postgres, the app (which applies migrations on boot) and a cron container that calls
   `/api/cron` every 5 minutes. On Vercel, Railway or Render, use a managed Postgres and any scheduler
   that runs `POST /api/cron` with `Authorization: Bearer $CRON_SECRET` every 5 minutes.
6. Put it behind HTTPS (required for secure cookies and geolocation).

## Before you launch (non-code items)
- **Legal**: have a lawyer review `/terms` and `/privacy` (the current text is a starting point). Register the business and check the IT Act intermediary rules and the DPDP Act 2023. A grievance officer is required for Indian intermediaries.
- **Payments**: the funds are held by Razorpay (an RBI-authorised payment aggregator), not by you. Confirm with Razorpay that your marketplace flow fits their Route terms.
- **Gateway fees**: Razorpay keeps its ~2% fee even on refunded payments. Your 5% commission on completed sales has to cover that. Tune the `FEE_*` values.
- **Test with real money**: Razorpay **test mode** keys work end to end. Run a few real transactions on live keys with small amounts before opening up.

## Project layout
```
prisma/schema.prisma        data model (orders, escrow fields, audit events…)
src/lib/orders.ts           the order/escrow state machine (start here)
src/lib/payments/           razorpay + mock providers
src/lib/mask.ts             contact-detail masking in chat
src/app/api/**              REST API
src/app/**                  pages (browse, sell, listing, chat, orders, account, admin)
tests/                      unit + DB-backed integration tests
```
