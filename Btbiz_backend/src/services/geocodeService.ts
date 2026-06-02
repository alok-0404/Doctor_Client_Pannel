/** OpenStreetMap Nominatim — free geocoding for Indian addresses (rate-limited). */

const cache = new Map<string, { lat: number; lng: number }>();
let lastRequestAt = 0;

const MIN_INTERVAL_MS = 1100;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

const CITY_FALLBACK_QUERIES: Record<string, string> = {
  gurgaon: "Gurgaon, Haryana, India",
  gurugram: "Gurugram, Haryana, India",
  faridabad: "Faridabad, Haryana, India",
  delhi: "New Delhi, India",
  noida: "Noida, Uttar Pradesh, India",
  ghaziabad: "Ghaziabad, Uttar Pradesh, India",
  mumbai: "Mumbai, Maharashtra, India",
  bangalore: "Bengaluru, Karnataka, India",
  bengaluru: "Bengaluru, Karnataka, India",
  hyderabad: "Hyderabad, Telangana, India",
  chennai: "Chennai, Tamil Nadu, India",
  pune: "Pune, Maharashtra, India",
  jaipur: "Jaipur, Rajasthan, India",
  lucknow: "Lucknow, Uttar Pradesh, India",
};

export function cityFallbackQueriesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const [key, query] of Object.entries(CITY_FALLBACK_QUERIES)) {
    if (lower.includes(key)) {
      out.push(query);
    }
  }
  return out;
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  const cacheKey = normalized.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  await waitForRateLimit();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", normalized);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "BtbizDoctorPanel/1.0 (provider-distance; contact@medigraph.com)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const coords = { lat, lng };
    cache.set(cacheKey, coords);
    return coords;
  } catch {
    return null;
  }
}

export function formatTenantAddress(addr?: {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): string | undefined {
  if (!addr) return undefined;
  const parts = [addr.line1, addr.city, addr.state, addr.pincode].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function buildProviderLocationQuery(
  tenantAddress?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  },
  clinicAddress?: string,
  businessName?: string
): string | undefined {
  const fromTenant = formatTenantAddress(tenantAddress);
  if (fromTenant) return `${fromTenant}, India`;
  if (clinicAddress?.trim()) return `${clinicAddress.trim()}, India`;
  if (businessName?.trim()) return `${businessName.trim()}, India`;
  return undefined;
}

export function buildGeocodeAttempts(
  primary?: string,
  businessName?: string
): string[] {
  const seen = new Set<string>();
  const add = (q?: string) => {
    const t = q?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(t);
  };

  const attempts: string[] = [];
  add(primary);
  if (businessName) {
    for (const cityQ of cityFallbackQueriesFromText(businessName)) {
      add(cityQ);
    }
    add(`${businessName.trim()}, India`);
  }
  if (primary) {
    for (const cityQ of cityFallbackQueriesFromText(primary)) {
      add(cityQ);
    }
  }
  return attempts;
}

/** Try several address strings one-by-one (Nominatim allows ~1 req/s). */
export async function geocodeAddressWithFallbacks(
  primary?: string,
  businessName?: string
): Promise<{ lat: number; lng: number } | null> {
  const attempts = buildGeocodeAttempts(primary, businessName);
  for (const q of attempts) {
    const coords = await geocodeAddress(q);
    if (coords) return coords;
  }
  return null;
}
