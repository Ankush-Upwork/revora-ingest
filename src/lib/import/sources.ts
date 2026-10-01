// Import source definitions — the single source of truth for:
//   • which target fields each platform CSV maps to
//   • the column-name aliases used for smart auto-mapping
//   • the downloadable template (native-looking headers + example rows)
//
// Pure data + helpers only (no Prisma / no next/headers) so it can be imported
// by both the client mapper UI and the server import route.

export type FieldType = "date" | "number" | "string";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  aliases: string[]; // header names we recognize (first one is the template header)
  examples: string[]; // example values for the template (3 rows)
  note?: string;
};

export type SourceConfig = {
  id: string;
  label: string;
  blurb: string;
  channel?: string; // forced channel for spend sources
  target: "spend" | "traffic" | "hubspot" | "payments" | "searchconsole";
  exportUrl?: string; // deep link to where the user exports from
  exportSteps: string[]; // step-by-step "how to get this data"
  fields: Field[];
  // If set, this source can also be connected live via API.
  connect?: {
    help: string;
    docsUrl: string;
    fields: {
      key: string;
      label: string;
      placeholder: string;
      multiline?: boolean;
    }[];
  };
};

export const SOURCES: SourceConfig[] = [
  {
    id: "google_ads",
    label: "Google Ads",
    blurb: "Daily spend, clicks, and impressions per campaign.",
    channel: "google",
    target: "spend",
    exportUrl: "https://ads.google.com",
    exportSteps: [
      "In Google Ads, open Campaigns from the left menu.",
      "Set your date range in the top-right corner.",
      "Click Segment → Time → Day so each row is one campaign per day.",
      "Make sure the Campaign, Cost, Clicks and Impressions columns are shown.",
      "Click the Download icon (↓) above the table and choose .csv.",
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true, aliases: ["Day", "Date"], examples: ["2026-05-01", "2026-05-01", "2026-05-02"] },
      { key: "campaign", label: "Campaign", type: "string", required: true, aliases: ["Campaign", "Campaign name"], examples: ["Water Damage - Phoenix", "Mold Remediation - Denver", "Water Damage - Phoenix"] },
      { key: "location", label: "Location", type: "string", aliases: ["Location", "City", "Office", "Branch"], note: "Optional — defaults to 'Unassigned'.", examples: ["Phoenix", "Denver", "Phoenix"] },
      { key: "cost", label: "Cost", type: "number", required: true, aliases: ["Cost", "Spend", "Amount spent", "Cost (USD)"], examples: ["142.50", "98.20", "151.75"] },
      { key: "clicks", label: "Clicks", type: "number", aliases: ["Clicks", "Link clicks"], examples: ["6", "4", "7"] },
      { key: "impressions", label: "Impressions", type: "number", aliases: ["Impressions", "Impr.", "Impr"], examples: ["84", "61", "95"] },
    ],
  },
  {
    id: "meta_ads",
    label: "Meta Ads",
    blurb: "Daily spend, clicks, and impressions per campaign (Facebook/Instagram).",
    channel: "meta",
    target: "spend",
    exportUrl: "https://www.facebook.com/adsmanager",
    exportSteps: [
      "Open Meta Ads Manager and go to the Campaigns tab.",
      "Set your date range in the top-right corner.",
      "Click Breakdown → By Time → Day for one row per campaign per day.",
      "Confirm the Amount spent, Link clicks and Impressions columns are visible.",
      "Click Reports → Export → Export as .csv.",
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true, aliases: ["Day", "Date", "Reporting starts"], examples: ["2026-05-01", "2026-05-01", "2026-05-02"] },
      { key: "campaign", label: "Campaign", type: "string", required: true, aliases: ["Campaign name", "Campaign"], examples: ["Storm Damage - Dallas", "Water Damage - Denver", "Storm Damage - Dallas"] },
      { key: "location", label: "Location", type: "string", aliases: ["Location", "City"], note: "Optional — defaults to 'Unassigned'.", examples: ["Dallas", "Denver", "Dallas"] },
      { key: "cost", label: "Amount spent", type: "number", required: true, aliases: ["Amount spent (USD)", "Amount spent", "Spend", "Cost"], examples: ["64.10", "55.30", "70.00"] },
      { key: "clicks", label: "Link clicks", type: "number", aliases: ["Link clicks", "Clicks", "Clicks (all)"], examples: ["18", "15", "21"] },
      { key: "impressions", label: "Impressions", type: "number", aliases: ["Impressions", "Impr."], examples: ["1240", "1010", "1380"] },
    ],
  },
  {
    id: "ga4",
    label: "GA4",
    blurb: "Sessions and conversions per campaign / source.",
    channel: "other",
    target: "traffic",
    connect: {
      help: "Create a Google Cloud service account, enable the Google Analytics Data API, download its JSON key, and add the service-account email as a Viewer on your GA4 property. Then paste the property ID and the JSON below.",
      docsUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
      fields: [
        { key: "propertyId", label: "GA4 Property ID", placeholder: "123456789" },
        { key: "serviceAccount", label: "Service account JSON", placeholder: '{ "type": "service_account", ... }', multiline: true },
      ],
    },
    exportUrl: "https://analytics.google.com",
    exportSteps: [
      "Open Google Analytics (GA4) → Explore → start a blank exploration.",
      "Drag Date and Session campaign into Rows.",
      "Drag Sessions, Engaged sessions and Conversions (or Key events) into Values.",
      "Set the date range at the top of the exploration.",
      "Click the Export icon (top-right) and choose CSV.",
      "GA4 adds a few summary lines above the table — leave them, we skip them automatically.",
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true, aliases: ["Date", "Day"], examples: ["2026-05-01", "2026-05-01", "2026-05-02"] },
      { key: "campaign", label: "Campaign", type: "string", required: true, aliases: ["Session campaign", "Campaign", "Manual campaign name", "Campaign name"], examples: ["Water Damage - Phoenix", "Storm Damage - Dallas", "Water Damage - Phoenix"] },
      { key: "location", label: "Location", type: "string", aliases: ["Location", "City"], note: "Optional.", examples: ["Phoenix", "Dallas", "Phoenix"] },
      { key: "sessions", label: "Sessions", type: "number", required: true, aliases: ["Sessions", "Session"], examples: ["7", "20", "8"] },
      { key: "engaged", label: "Engaged sessions", type: "number", aliases: ["Engaged sessions", "EngagedSessions"], examples: ["5", "13", "6"] },
      { key: "conversions", label: "Conversions", type: "number", aliases: ["Conversions", "Key events", "Conversions count"], examples: ["1", "2", "1"] },
    ],
  },
  {
    id: "hubspot",
    label: "HubSpot",
    blurb: "Contacts/leads and deals — with UTM campaign for attribution.",
    target: "hubspot",
    connect: {
      help: "In HubSpot → Settings → Integrations → Private Apps, create an app with the crm.objects.contacts.read and crm.objects.deals.read scopes, then copy its access token.",
      docsUrl: "https://app.hubspot.com",
      fields: [
        {
          key: "token",
          label: "HubSpot Private App token",
          placeholder: "Paste your HubSpot private app token",
        },
      ],
    },
    exportUrl: "https://app.hubspot.com",
    exportSteps: [
      "In HubSpot, go to CRM → Contacts.",
      "Click Actions → Edit columns and add: Email, Create date, Lead status, your campaign property (e.g. Original/Latest traffic source campaign) and Original source.",
      "To include deals, also add Deal stage and Amount (or export Deals separately).",
      "Select all contacts, then click Export.",
      "Choose CSV — HubSpot will email you the file when it's ready.",
    ],
    fields: [
      { key: "createdAt", label: "Create date", type: "date", required: true, aliases: ["Create date", "Created at", "Createdate", "Date"], examples: ["2026-05-01", "2026-05-02", "2026-05-03"] },
      { key: "email", label: "Email", type: "string", required: true, aliases: ["Email", "Contact email"], note: "Used to match Stripe revenue for attribution.", examples: ["jane.doe@example.com", "bob.smith@example.com", "amy.lee@example.com"] },
      { key: "firstName", label: "First name", type: "string", aliases: ["First name", "Firstname"], examples: ["Jane", "Bob", "Amy"] },
      { key: "lastName", label: "Last name", type: "string", aliases: ["Last name", "Lastname"], examples: ["Doe", "Smith", "Lee"] },
      { key: "status", label: "Lead status", type: "string", aliases: ["Lead status", "Status", "Lifecycle stage"], note: "qualified / new / unqualified.", examples: ["qualified", "new", "qualified"] },
      { key: "utmCampaign", label: "UTM campaign", type: "string", aliases: ["UTM campaign", "Campaign", "Original traffic source campaign", "Latest traffic source campaign", "Campaign name"], note: "Links the lead to a campaign.", examples: ["Water Damage - Phoenix", "Storm Damage - Dallas", "Mold Remediation - Denver"] },
      { key: "utmSource", label: "UTM source", type: "string", aliases: ["UTM source", "Source", "Original source", "Latest source"], note: "google / facebook — sets the channel.", examples: ["google", "facebook", "google"] },
      { key: "location", label: "Location", type: "string", aliases: ["Location", "City", "Office"], examples: ["Phoenix", "Dallas", "Denver"] },
      { key: "dealStage", label: "Deal stage", type: "string", aliases: ["Deal stage", "Stage"], note: "Optional — creates a deal. qualified/booked/won/lost.", examples: ["won", "qualified", "booked"] },
      { key: "dealAmount", label: "Deal amount", type: "number", aliases: ["Amount", "Deal amount", "Value"], note: "Optional.", examples: ["4200", "0", "5200"] },
      { key: "closeDate", label: "Close date", type: "date", aliases: ["Close date", "Closed at"], note: "Optional.", examples: ["2026-05-12", "", "2026-05-18"] },
    ],
  },
  {
    id: "stripe",
    label: "Stripe",
    blurb: "Payments / collected revenue. Matched to leads by email.",
    target: "payments",
    connect: {
      help: "In Stripe → Developers → API keys → Create restricted key, give it Read access to Charges, then paste it here. Use a restricted key, not your secret key.",
      docsUrl: "https://dashboard.stripe.com/apikeys",
      fields: [
        {
          key: "key",
          label: "Stripe restricted (read-only) key",
          placeholder: "Paste your Stripe restricted key (starts with rk_)",
        },
      ],
    },
    exportUrl: "https://dashboard.stripe.com/payments",
    exportSteps: [
      "Open the Stripe Dashboard → Payments.",
      "Set the date range at the top of the list.",
      "Click Export above the table.",
      "Make sure Customer email, Amount and Created date are included in the columns.",
      "Export and download the .csv.",
    ],
    fields: [
      { key: "id", label: "Payment ID", type: "string", aliases: ["id", "Payment ID", "Charge ID"], note: "Optional — used as the upsert key.", examples: ["ch_1001", "ch_1002", "ch_1003"] },
      { key: "createdAt", label: "Created (UTC)", type: "date", required: true, aliases: ["Created (UTC)", "Created", "Date", "Created date"], examples: ["2026-05-12", "2026-05-15", "2026-05-18"] },
      { key: "email", label: "Customer email", type: "string", required: true, aliases: ["Customer Email", "Email", "Receipt Email"], note: "Matched to a HubSpot lead's email.", examples: ["jane.doe@example.com", "carl.ray@example.com", "amy.lee@example.com"] },
      { key: "amount", label: "Amount", type: "number", required: true, aliases: ["Amount", "Amount Paid", "Converted Amount", "Total"], examples: ["4200", "8800", "5200"] },
      { key: "refunded", label: "Amount refunded", type: "number", aliases: ["Amount Refunded", "Refunded Amount", "Refunded"], examples: ["0", "0", "0"] },
      { key: "type", label: "Customer type", type: "string", aliases: ["Type", "Customer type"], note: "new / returning.", examples: ["new", "new", "returning"] },
      { key: "campaign", label: "Campaign", type: "string", aliases: ["Campaign", "UTM campaign"], note: "Optional — overrides email matching.", examples: ["", "", ""] },
      { key: "location", label: "Location", type: "string", aliases: ["Location", "City"], examples: ["", "", ""] },
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    blurb: "E-commerce orders / collected revenue. Matched to leads by email.",
    target: "payments",
    connect: {
      help: "In Shopify admin → Settings → Apps and sales channels → Develop apps → create an app with read_orders scope, install it, and copy the Admin API access token. Also enter your store domain.",
      docsUrl: "https://admin.shopify.com",
      fields: [
        { key: "shop", label: "Store domain", placeholder: "your-store.myshopify.com" },
        { key: "token", label: "Admin API access token", placeholder: "Paste your Shopify Admin API token" },
      ],
    },
    exportUrl: "https://admin.shopify.com",
    exportSteps: [
      "In Shopify admin, go to Orders.",
      "Set the date range / filters you want.",
      "Click Export → Current page or All orders → CSV.",
    ],
    fields: [
      { key: "id", label: "Order", type: "string", aliases: ["Name", "Id", "Order ID"], note: "Optional upsert key.", examples: ["#1001", "#1002", "#1003"] },
      { key: "createdAt", label: "Created at", type: "date", required: true, aliases: ["Created at", "Paid at", "Date"], examples: ["2026-05-12", "2026-05-15", "2026-05-18"] },
      { key: "email", label: "Email", type: "string", required: true, aliases: ["Email", "Customer Email", "Billing Email"], examples: ["jane.doe@example.com", "carl.ray@example.com", "amy.lee@example.com"] },
      { key: "amount", label: "Total", type: "number", required: true, aliases: ["Total", "Total Price", "Subtotal"], examples: ["120", "340", "95"] },
      { key: "refunded", label: "Refunded amount", type: "number", aliases: ["Refunded Amount", "Refunds"], examples: ["0", "0", "0"] },
    ],
  },
  {
    id: "search_console",
    label: "Search Console",
    blurb: "Organic search — clicks, impressions, average position, top queries.",
    target: "searchconsole",
    connect: {
      help: "Create a Google Cloud service account, enable the Search Console API, download its JSON key, and add the service-account email as a user in Search Console (Settings → Users and permissions). Enter your property URL and the JSON.",
      docsUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
      fields: [
        { key: "siteUrl", label: "Property URL", placeholder: "https://www.yoursite.com/  or  sc-domain:yoursite.com" },
        { key: "serviceAccount", label: "Service account JSON", placeholder: '{ "type": "service_account", ... }', multiline: true },
      ],
    },
    exportUrl: "https://search.google.com/search-console",
    exportSteps: [
      "Open Google Search Console → Performance → Search results.",
      "Set the date range.",
      "Click Export → CSV/Sheets. Use the 'Dates' tab for daily rows or 'Queries' for top queries.",
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true, aliases: ["Date", "Day"], examples: ["2026-05-01", "2026-05-02", "2026-05-03"] },
      { key: "query", label: "Query", type: "string", aliases: ["Query", "Top queries", "Search query"], note: "Optional — leave blank for daily totals.", examples: ["water damage repair", "mold removal near me", "emergency plumber"] },
      { key: "clicks", label: "Clicks", type: "number", required: true, aliases: ["Clicks", "Url Clicks"], examples: ["42", "18", "9"] },
      { key: "impressions", label: "Impressions", type: "number", required: true, aliases: ["Impressions"], examples: ["1200", "640", "330"] },
      { key: "ctr", label: "CTR", type: "number", aliases: ["CTR"], note: "Percent or ratio.", examples: ["3.5", "2.8", "2.7"] },
      { key: "position", label: "Avg. position", type: "number", aliases: ["Position", "Average Position"], examples: ["4.2", "6.1", "8.0"] },
    ],
  },
];

export function getSource(id: string): SourceConfig | undefined {
  return SOURCES.find((s) => s.id === id);
}

// Normalize a header for fuzzy matching: lowercase, strip non-alphanumerics.
export function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Best-guess mapping of { fieldKey -> csvHeader|null } from the uploaded headers.
export function autoMap(
  headers: string[],
  fields: Field[]
): Record<string, string | null> {
  const normToOriginal = new Map<string, string>();
  for (const h of headers) normToOriginal.set(normHeader(h), h);

  const map: Record<string, string | null> = {};
  for (const f of fields) {
    let match: string | null = null;
    for (const alias of f.aliases) {
      const hit = normToOriginal.get(normHeader(alias));
      if (hit) {
        match = hit;
        break;
      }
    }
    // fallback: exact-ish match on the field key itself
    if (!match) match = normToOriginal.get(normHeader(f.key)) ?? null;
    map[f.key] = match;
  }
  return map;
}

// Some exports (notably GA4 Explorations) prepend summary / comment / blank
// lines before the real data table. Find the most likely header row by scoring
// each line against the known column aliases, and drop everything above it.
// Returns the original text unchanged when no confident header is found.
export function sliceToHeaderRow(text: string, fields: Field[]): string {
  const lines = text.split(/\r?\n/);
  const aliasNorms = new Set<string>();
  for (const f of fields) {
    aliasNorms.add(normHeader(f.key));
    for (const a of f.aliases) aliasNorms.add(normHeader(a));
  }
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(lines.length, 40);
  for (let i = 0; i < limit; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(",").map((c) => c.replace(/^"|"$/g, ""));
    let score = 0;
    for (const c of cells) if (aliasNorms.has(normHeader(c))) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  // Only shift if we're confident (≥2 recognized columns); else parse as-is.
  return bestScore >= 2 ? lines.slice(bestIdx).join("\n") : text;
}

// CSV text for a source's downloadable template. A leading comment line notes
// which fields are required vs. optional; the importer skips it automatically
// (so a filled-in template re-uploads cleanly).
export function buildTemplateCsv(source: SourceConfig): string {
  const note =
    "# Fields marked * in the importer are required. Others are optional — leave the column blank (or omit it) if your export does not include it.";
  const headers = source.fields.map((f) => f.aliases[0]);
  const rows = [0, 1, 2].map((i) =>
    source.fields.map((f) => csvCell(f.examples[i] ?? "")).join(",")
  );
  return [note, headers.map(csvCell).join(","), ...rows].join("\n") + "\n";
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
