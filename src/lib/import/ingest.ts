// Server-side ingest: takes rows already mapped to target field keys (by the
// client mapper) and upserts them into the caller's private "user" dataset
// (scoped by ownerId = their userId). Includes the attribution relink that
// matches Stripe payments to HubSpot leads by email — also owner-scoped.
import { prisma } from "../db";
import { getSource } from "./sources";

const DATASET = "user";

export type IngestResult = {
  source: string;
  rows: number;
  imported: number;
  skipped: number;
  attributed?: number;
  message: string;
};

type Row = Record<string, string | undefined>;

// ---- parsing helpers ------------------------------------------------------
function parseDate(v?: string): Date | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`);
  // GA4 exports dates as YYYYMMDD with no separators
  if (/^\d{8}$/.test(s))
    return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return new Date(Date.UTC(+y, +m - 1, +d, 12));
  }
  const t = new Date(s);
  return isNaN(t.getTime()) ? null : t;
}

function toNum(v?: string): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function channelFromSource(src?: string): string {
  const s = (src || "").toLowerCase();
  if (s.includes("google") || s.includes("adwords")) return "google";
  if (s.includes("facebook") || s.includes("meta") || s.includes("instagram") || s.includes("fb"))
    return "meta";
  return "other";
}

function normStatus(v?: string): string {
  const s = (v || "").toLowerCase();
  if (s.includes("qualif") && !s.includes("un")) return "qualified";
  if (s.includes("unqualif")) return "unqualified";
  return "new";
}

function normStage(v?: string): string {
  const s = (v || "").toLowerCase();
  if (s.includes("won") || s.includes("closed won")) return "won";
  if (s.includes("lost")) return "lost";
  if (s.includes("book") || s.includes("appoint")) return "booked";
  return "qualified";
}

// ---- ensure helpers (cached within one ingest call, scoped to ownerId) ----
async function ensureLocation(ownerId: string, name: string, cache: Map<string, string>) {
  const clean = name?.trim() || "Unassigned";
  const cached = cache.get(clean);
  if (cached) return cached;
  const loc = await prisma.location.upsert({
    where: { ownerId_dataset_name: { ownerId, dataset: DATASET, name: clean } },
    update: {},
    create: { ownerId, dataset: DATASET, name: clean, city: clean, state: "" },
  });
  cache.set(clean, loc.id);
  return loc.id;
}

async function ensureCampaign(
  ownerId: string,
  externalId: string,
  data: { name: string; channel: string; service: string; locationId: string },
  cache: Map<string, string>
) {
  const key = externalId?.trim() || "Unattributed";
  const cached = cache.get(key);
  if (cached) return cached;
  const camp = await prisma.campaign.upsert({
    where: { ownerId_dataset_externalId: { ownerId, dataset: DATASET, externalId: key } },
    update: {}, // don't overwrite an existing campaign's attributes
    create: {
      ownerId,
      dataset: DATASET,
      externalId: key,
      name: data.name || key,
      channel: data.channel,
      service: data.service || "",
      locationId: data.locationId,
    },
  });
  cache.set(key, camp.id);
  return camp.id;
}

// ---- per-source ingest ----------------------------------------------------
export async function ingest(sourceId: string, rows: Row[], ownerId: string): Promise<IngestResult> {
  const source = getSource(sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);

  const locCache = new Map<string, string>();
  const campCache = new Map<string, string>();
  let imported = 0;
  let skipped = 0;

  if (source.target === "spend") {
    for (const r of rows) {
      const date = parseDate(r.date);
      const campaign = r.campaign?.trim();
      if (!date || !campaign) {
        skipped++;
        continue;
      }
      const locationId = await ensureLocation(ownerId, r.location || "Unassigned", locCache);
      const campaignId = await ensureCampaign(
        ownerId,
        campaign,
        { name: campaign, channel: source.channel || "other", service: "", locationId },
        campCache
      );
      await prisma.spendDaily.upsert({
        where: { campaignId_date: { campaignId, date } },
        update: { cost: toNum(r.cost), clicks: toNum(r.clicks), impressions: toNum(r.impressions), dataset: DATASET, ownerId },
        create: {
          ownerId,
          dataset: DATASET,
          date,
          campaignId,
          cost: toNum(r.cost),
          clicks: Math.round(toNum(r.clicks)),
          impressions: Math.round(toNum(r.impressions)),
        },
      });
      imported++;
    }
  } else if (source.target === "traffic") {
    for (const r of rows) {
      const date = parseDate(r.date);
      const campaign = r.campaign?.trim();
      if (!date || !campaign) {
        skipped++;
        continue;
      }
      const locationId = await ensureLocation(ownerId, r.location || "Unassigned", locCache);
      const campaignId = await ensureCampaign(
        ownerId,
        campaign,
        { name: campaign, channel: "other", service: "", locationId },
        campCache
      );
      await prisma.trafficDaily.upsert({
        where: { campaignId_date: { campaignId, date } },
        update: {
          sessions: Math.round(toNum(r.sessions)),
          engaged: Math.round(toNum(r.engaged)),
          conversions: Math.round(toNum(r.conversions)),
          dataset: DATASET,
          ownerId,
        },
        create: {
          ownerId,
          dataset: DATASET,
          date,
          campaignId,
          sessions: Math.round(toNum(r.sessions)),
          engaged: Math.round(toNum(r.engaged)),
          conversions: Math.round(toNum(r.conversions)),
        },
      });
      imported++;
    }
  } else if (source.target === "hubspot") {
    for (const r of rows) {
      const createdAt = parseDate(r.createdAt);
      const email = r.email?.trim().toLowerCase();
      if (!createdAt || !email) {
        skipped++;
        continue;
      }
      const channel = channelFromSource(r.utmSource);
      const locationId = await ensureLocation(ownerId, r.location || "Unassigned", locCache);
      const campaignId = await ensureCampaign(
        ownerId,
        r.utmCampaign || "Unattributed",
        { name: r.utmCampaign || "Unattributed", channel, service: "", locationId },
        campCache
      );
      const dayKey = createdAt.toISOString().slice(0, 10);
      const extKey = `${email}|${dayKey}`;
      const lead = await prisma.lead.upsert({
        where: { ownerId_dataset_extKey: { ownerId, dataset: DATASET, extKey } },
        update: {
          status: normStatus(r.status),
          campaignId,
          locationId,
          channel,
          utmCampaign: r.utmCampaign || "",
          utmSource: r.utmSource || "",
        },
        create: {
          ownerId,
          dataset: DATASET,
          extKey,
          createdAt,
          email,
          firstName: r.firstName || "",
          lastName: r.lastName || "",
          status: normStatus(r.status),
          utmSource: r.utmSource || "",
          utmMedium: "cpc",
          utmCampaign: r.utmCampaign || "",
          channel,
          locationId,
          campaignId,
        },
      });

      // optional deal
      if (r.dealStage?.trim()) {
        const dealExt = `deal|${extKey}`;
        await prisma.deal.upsert({
          where: { ownerId_dataset_extKey: { ownerId, dataset: DATASET, extKey: dealExt } },
          update: {
            stage: normStage(r.dealStage),
            amount: toNum(r.dealAmount),
            closedAt: parseDate(r.closeDate),
            campaignId,
            locationId,
            channel,
          },
          create: {
            ownerId,
            dataset: DATASET,
            extKey: dealExt,
            createdAt,
            closedAt: parseDate(r.closeDate),
            stage: normStage(r.dealStage),
            amount: toNum(r.dealAmount),
            email,
            channel,
            locationId,
            campaignId,
            leadId: lead.id,
          },
        });
      }
      imported++;
    }
    const attributed = await relinkPayments(ownerId);
    return { source: sourceId, rows: rows.length, imported, skipped, attributed, message: ok(imported, skipped, `${attributed} payment(s) re-attributed by email`) };
  } else if (source.target === "payments") {
    for (const r of rows) {
      const createdAt = parseDate(r.createdAt);
      const email = r.email?.trim().toLowerCase();
      const amount = toNum(r.amount);
      if (!createdAt || !email) {
        skipped++;
        continue;
      }
      const extKey = r.id?.trim() || `${email}|${createdAt.toISOString().slice(0, 10)}|${amount}`;

      // attribution: explicit campaign column wins; else match a lead by email
      let campaignId: string | null = null;
      let locationId: string | null = null;
      let channel = "other";
      if (r.campaign?.trim()) {
        locationId = await ensureLocation(ownerId, r.location || "Unassigned", locCache);
        campaignId = await ensureCampaign(
          ownerId,
          r.campaign,
          { name: r.campaign, channel: "other", service: "", locationId },
          campCache
        );
      } else {
        const lead = await prisma.lead.findFirst({
          where: { ownerId, dataset: DATASET, email },
          orderBy: { createdAt: "desc" },
        });
        if (lead) {
          campaignId = lead.campaignId;
          locationId = lead.locationId;
          channel = lead.channel;
        }
      }
      if (!campaignId || !locationId) {
        locationId = await ensureLocation(ownerId, "Unassigned", locCache);
        campaignId = await ensureCampaign(
          ownerId,
          "Unattributed",
          { name: "Unattributed", channel: "other", service: "", locationId },
          campCache
        );
      }

      await prisma.payment.upsert({
        where: { ownerId_dataset_extKey: { ownerId, dataset: DATASET, extKey } },
        update: {
          amount,
          refunded: toNum(r.refunded),
          type: (r.type || "new").toLowerCase().includes("return") ? "returning" : "new",
          campaignId,
          locationId,
          channel,
        },
        create: {
          ownerId,
          dataset: DATASET,
          extKey,
          createdAt,
          amount,
          refunded: toNum(r.refunded),
          type: (r.type || "new").toLowerCase().includes("return") ? "returning" : "new",
          email,
          channel,
          locationId,
          campaignId,
        },
      });
      imported++;
    }
  } else if (source.target === "searchconsole") {
    for (const r of rows) {
      const q = r.query?.trim();
      if (q) {
        await prisma.searchQuery.upsert({
          where: { ownerId_dataset_query: { ownerId, dataset: DATASET, query: q } },
          update: { clicks: Math.round(toNum(r.clicks)), impressions: Math.round(toNum(r.impressions)), ctr: toNum(r.ctr), position: toNum(r.position) },
          create: { ownerId, dataset: DATASET, query: q, clicks: Math.round(toNum(r.clicks)), impressions: Math.round(toNum(r.impressions)), ctr: toNum(r.ctr), position: toNum(r.position) },
        });
        imported++;
        continue;
      }
      const date = parseDate(r.date);
      if (!date) {
        skipped++;
        continue;
      }
      await prisma.searchConsoleDaily.upsert({
        where: { ownerId_dataset_date: { ownerId, dataset: DATASET, date } },
        update: { clicks: Math.round(toNum(r.clicks)), impressions: Math.round(toNum(r.impressions)), ctr: toNum(r.ctr), position: toNum(r.position) },
        create: { ownerId, dataset: DATASET, date, clicks: Math.round(toNum(r.clicks)), impressions: Math.round(toNum(r.impressions)), ctr: toNum(r.ctr), position: toNum(r.position) },
      });
      imported++;
    }
  }

  return { source: sourceId, rows: rows.length, imported, skipped, message: ok(imported, skipped) };
}

function ok(imported: number, skipped: number, extra?: string): string {
  let m = `Imported ${imported} row${imported === 1 ? "" : "s"}`;
  if (skipped) m += `, skipped ${skipped} (missing required fields)`;
  if (extra) m += `. ${extra}`;
  return m + ".";
}

// Re-match a user's payments to their leads by email (idempotent, owner-scoped).
export async function relinkPayments(ownerId: string): Promise<number> {
  const payments = await prisma.payment.findMany({ where: { ownerId, dataset: DATASET } });
  if (!payments.length) return 0;
  const leads = await prisma.lead.findMany({
    where: { ownerId, dataset: DATASET },
    orderBy: { createdAt: "desc" },
  });
  const leadByEmail = new Map<string, (typeof leads)[number]>();
  for (const l of leads) if (!leadByEmail.has(l.email)) leadByEmail.set(l.email, l);

  let updated = 0;
  for (const p of payments) {
    const lead = leadByEmail.get(p.email);
    if (lead && (lead.campaignId !== p.campaignId || lead.locationId !== p.locationId)) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { campaignId: lead.campaignId, locationId: lead.locationId, channel: lead.channel },
      });
      updated++;
    }
  }
  return updated;
}

// Wipe one owner's user dataset (for the "clear my data" action).
export async function clearUserData(ownerId: string) {
  await prisma.payment.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.deal.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.lead.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.trafficDaily.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.spendDaily.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.campaign.deleteMany({ where: { ownerId, dataset: DATASET } });
  await prisma.location.deleteMany({ where: { ownerId, dataset: DATASET } });
}
