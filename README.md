# revora-ingest

The import layer of **Revora**, my marketing-attribution product. Revora ties ad spend to booked
revenue for lead-generation businesses: Google Ads and Meta spend, GA4 traffic, HubSpot leads and
deals, and Stripe or Shopify payments, joined into one owner-scoped model.

The full app (Next.js, Prisma, Neon Postgres, Vercel) is private. This repo is the part I'd most
like someone to read: the code that takes messy platform exports and turns them into trustworthy
rows.

## What's here

| File | What it does |
|---|---|
| `src/lib/import/sources.ts` | One declarative config per platform: target fields, the column aliases each platform actually uses, export instructions and template rows. Also header auto-mapping (`autoMap`) and `sliceToHeaderRow`, which finds the real header row in exports that prepend summary lines (GA4 does). Pure data and helpers, so the client mapper UI and the server route share it. |
| `src/lib/import/ingest.ts` | Server-side ingest. Upserts mapped rows into the caller's own dataset, then re-attributes payments to leads by email. |
| `src/lib/db.ts` | The Prisma client. |
| `prisma/schema.prisma` | An excerpt of the models ingest touches. |

## Decisions worth noticing

- **Every write is scoped to `ownerId`.** Each table is keyed by owner and dataset, and every
  query filters on them, so one customer's import can never touch another's rows.
- **Re-running an import is safe.** Rows upsert on natural keys: the payment ID when there is one,
  otherwise `email|date|amount`. Leads key on `email|day`. Uploading the same CSV twice changes
  nothing.
- **Bad rows are counted, not guessed.** Rows missing a required field are skipped and reported
  back ("Imported 412 rows, skipped 3"), rather than filled with defaults that would distort
  revenue.
- **Attribution is explicit first, inferred second.** A payment row with a campaign column wins.
  Otherwise it inherits the campaign of the most recent lead with the same email. Anything left
  over goes to an `Unattributed` bucket instead of disappearing. `relinkPayments` re-runs the
  match idempotently after each HubSpot import, so the order of uploads doesn't matter.
- **Existing campaigns are never overwritten by an import** (`update: {}` in `ensureCampaign`).
  A later export with a sparser row can't erase what an earlier one recorded.
- **Dates are normalised at noon UTC**, so a day doesn't shift when it's displayed in a US time zone.

## What I'd change next

The ingest loop issues one upsert per row, which is fine at the volumes Revora sees but would want
batching (`createMany` plus a conflict-merge step) for six-figure exports. The email match also
takes the most recent lead, where a fuller model would weight first touch and last touch
separately.

---

Ankush Gulati · [datavoris.com](https://datavoris.com) ·
[LinkedIn](https://www.linkedin.com/in/ankush-gulati-4764bb78/)
