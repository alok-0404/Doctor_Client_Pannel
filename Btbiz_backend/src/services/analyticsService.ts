import { AnalyticsEvent, AnalyticsEventType } from "../models/AnalyticsEvent";
import { Visit } from "../models/Visit";
import { PatientTestRequest } from "../models/PatientTestRequest";
import { PatientMedicineRequest } from "../models/PatientMedicineRequest";

export type IntelligencePeriod = "today" | "7d" | "30d";

export interface TrackEventInput {
  eventType: AnalyticsEventType;
  success?: boolean;
  actorRole?: string;
  userId?: string;
  tenantId?: string;
  route?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface IntelligenceTrendPoint {
  label: string;
  key: string;
  appointments: number;
  labOrders: number;
  pharmacyOrders: number;
  payments: number;
  logins: number;
  apiErrors: number;
}

/**
 * Fire-and-forget analytics write. Never throws to callers.
 */
export function trackEvent(input: TrackEventInput): void {
  void AnalyticsEvent.create({
    eventType: input.eventType,
    success: input.success !== false,
    actorRole: input.actorRole,
    userId: input.userId,
    tenantId: input.tenantId,
    route: input.route,
    durationMs: input.durationMs,
    metadata: input.metadata,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[analytics] trackEvent failed:", err instanceof Error ? err.message : err);
  });
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function resolvePeriodRange(period: IntelligencePeriod): { from: Date; to: Date } {
  const to = new Date();
  let from: Date;
  if (period === "today") {
    from = startOfUtcDay(to);
  } else if (period === "7d") {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { from, to };
}

async function countEvents(
  eventType: AnalyticsEventType,
  from: Date,
  to: Date,
  successOnly = false
): Promise<number> {
  const filter: Record<string, unknown> = {
    eventType,
    createdAt: { $gte: from, $lte: to },
  };
  if (successOnly) filter.success = true;
  return AnalyticsEvent.countDocuments(filter);
}

type BucketGranularity = "hour" | "day";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildEmptyBuckets(
  period: IntelligencePeriod,
  from: Date,
  to: Date
): { granularity: BucketGranularity; buckets: Map<string, IntelligenceTrendPoint> } {
  const buckets = new Map<string, IntelligenceTrendPoint>();

  if (period === "today") {
    const day = startOfUtcDay(to);
    for (let h = 0; h < 24; h++) {
      const key = `${day.toISOString().slice(0, 10)}T${pad2(h)}`;
      buckets.set(key, {
        key,
        label: `${pad2(h)}:00`,
        appointments: 0,
        labOrders: 0,
        pharmacyOrders: 0,
        payments: 0,
        logins: 0,
        apiErrors: 0,
      });
    }
    return { granularity: "hour", buckets };
  }

  const cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    const label = cursor.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
    buckets.set(key, {
      key,
      label,
      appointments: 0,
      labOrders: 0,
      pharmacyOrders: 0,
      payments: 0,
      logins: 0,
      apiErrors: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { granularity: "day", buckets };
}

async function aggregateByBucket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: { aggregate: (pipeline: object[]) => Promise<Array<{ _id: string; count: number }>> },
  match: Record<string, unknown>,
  dateField: string,
  granularity: BucketGranularity
): Promise<Map<string, number>> {
  const format = granularity === "hour" ? "%Y-%m-%dT%H" : "%Y-%m-%d";
  const rows = await model.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format,
            date: `$${dateField}`,
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row?._id) map.set(String(row._id), Number(row.count) || 0);
  }
  return map;
}

function mergeCounts(
  buckets: Map<string, IntelligenceTrendPoint>,
  counts: Map<string, number>,
  field: keyof Omit<IntelligenceTrendPoint, "label" | "key">
): void {
  for (const [key, count] of counts) {
    const bucket = buckets.get(key);
    if (bucket) bucket[field] = count;
  }
}

async function getIntelligenceTrends(
  period: IntelligencePeriod,
  from: Date,
  to: Date
): Promise<IntelligenceTrendPoint[]> {
  const { granularity, buckets } = buildEmptyBuckets(period, from, to);
  const createdInRange = { createdAt: { $gte: from, $lte: to } };

  const [
    appointments,
    labOrders,
    pharmacyOrders,
    paymentsWithPaidAtLab,
    paymentsWithPaidAtMed,
    paymentsNoPaidAtLab,
    paymentsNoPaidAtMed,
    logins,
    apiErrors,
  ] = await Promise.all([
    aggregateByBucket(Visit as any, createdInRange, "createdAt", granularity),
    aggregateByBucket(PatientTestRequest as any, createdInRange, "createdAt", granularity),
    aggregateByBucket(PatientMedicineRequest as any, createdInRange, "createdAt", granularity),
    aggregateByBucket(
      PatientTestRequest as any,
      { paymentStatus: "PAID", paidAt: { $gte: from, $lte: to } },
      "paidAt",
      granularity
    ),
    aggregateByBucket(
      PatientMedicineRequest as any,
      { paymentStatus: "PAID", paidAt: { $gte: from, $lte: to } },
      "paidAt",
      granularity
    ),
    aggregateByBucket(
      PatientTestRequest as any,
      {
        paymentStatus: "PAID",
        $or: [{ paidAt: null }, { paidAt: { $exists: false } }],
        createdAt: { $gte: from, $lte: to },
      },
      "createdAt",
      granularity
    ),
    aggregateByBucket(
      PatientMedicineRequest as any,
      {
        paymentStatus: "PAID",
        $or: [{ paidAt: null }, { paidAt: { $exists: false } }],
        createdAt: { $gte: from, $lte: to },
      },
      "createdAt",
      granularity
    ),
    aggregateByBucket(
      AnalyticsEvent as any,
      {
        eventType: "user.login",
        success: true,
        createdAt: { $gte: from, $lte: to },
      },
      "createdAt",
      granularity
    ),
    aggregateByBucket(
      AnalyticsEvent as any,
      {
        eventType: "api.error",
        createdAt: { $gte: from, $lte: to },
      },
      "createdAt",
      granularity
    ),
  ]);

  mergeCounts(buckets, appointments, "appointments");
  mergeCounts(buckets, labOrders, "labOrders");
  mergeCounts(buckets, pharmacyOrders, "pharmacyOrders");

  const payments = new Map<string, number>();
  for (const src of [
    paymentsWithPaidAtLab,
    paymentsWithPaidAtMed,
    paymentsNoPaidAtLab,
    paymentsNoPaidAtMed,
  ]) {
    for (const [k, v] of src) payments.set(k, (payments.get(k) ?? 0) + v);
  }
  mergeCounts(buckets, payments, "payments");
  mergeCounts(buckets, logins, "logins");
  mergeCounts(buckets, apiErrors, "apiErrors");

  return Array.from(buckets.values());
}

/**
 * Hybrid summary:
 * - Appointments / lab / pharmacy / payments from live collections
 * - Logins / API errors from AnalyticsEvent stream
 * - Trends: bucketed series for charts
 */
export async function getIntelligenceSummary(period: IntelligencePeriod) {
  const { from, to } = resolvePeriodRange(period);
  const createdInRange = { createdAt: { $gte: from, $lte: to } };

  const [
    appointments,
    labOrders,
    pharmacyOrders,
    paymentsLab,
    paymentsPharmacy,
    logins,
    loginFails,
    apiErrors,
    trends,
  ] = await Promise.all([
    Visit.countDocuments(createdInRange),
    PatientTestRequest.countDocuments(createdInRange),
    PatientMedicineRequest.countDocuments(createdInRange),
    PatientTestRequest.countDocuments({
      paymentStatus: "PAID",
      $or: [
        { paidAt: { $gte: from, $lte: to } },
        { paidAt: null, createdAt: { $gte: from, $lte: to } },
      ],
    }),
    PatientMedicineRequest.countDocuments({
      paymentStatus: "PAID",
      $or: [
        { paidAt: { $gte: from, $lte: to } },
        { paidAt: null, createdAt: { $gte: from, $lte: to } },
      ],
    }),
    countEvents("user.login", from, to, true),
    AnalyticsEvent.countDocuments({
      eventType: "user.login",
      success: false,
      createdAt: { $gte: from, $lte: to },
    }),
    countEvents("api.error", from, to),
    getIntelligenceTrends(period, from, to),
  ]);

  const payments = paymentsLab + paymentsPharmacy;
  const activity = appointments + labOrders + pharmacyOrders + logins + payments;
  let healthScore = 100;
  if (activity > 0) {
    healthScore -= Math.min(40, Math.round((apiErrors / activity) * 100));
    healthScore -= Math.min(20, Math.round((loginFails / Math.max(logins + loginFails, 1)) * 40));
  } else if (apiErrors > 0) {
    healthScore = Math.max(40, 100 - apiErrors * 5);
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    healthScore,
    kpis: {
      appointments,
      logins,
      labOrders,
      pharmacyOrders,
      payments,
      apiErrors,
    },
    trends,
    meta: {
      loginFails,
      source: "hybrid_collections_and_events",
      trendGranularity: period === "today" ? "hour" : "day",
    },
  };
}
