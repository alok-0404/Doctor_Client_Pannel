import mongoose from "mongoose";

import { Doctor } from "../models/Doctor";
import type { AppointmentChannel } from "../models/Visit";
import { Visit } from "../models/Visit";

export type { AppointmentChannel };

/** IST calendar day bounds for a given instant (visit timestamp). */
export function getISTDayBoundsForInstant(visitDate: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(visitDate);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    const fallback = visitDate.toISOString().slice(0, 10);
    const start = new Date(`${fallback}T00:00:00+05:30`);
    const end = new Date(`${fallback}T23:59:59.999+05:30`);
    return { start, end };
  }
  const iso = `${y}-${m}-${d}`;
  const start = new Date(`${iso}T00:00:00+05:30`);
  const end = new Date(`${iso}T23:59:59.999+05:30`);
  return { start, end };
}

export async function countVisitsInISTDayForChannel(
  doctorId: string,
  dayStart: Date,
  dayEnd: Date,
  channel: AppointmentChannel
): Promise<number> {
  const did = new mongoose.Types.ObjectId(doctorId);
  if (channel === "WALK_IN") {
    return Visit.countDocuments({
      doctor: did,
      visitDate: { $gte: dayStart, $lte: dayEnd },
      appointmentChannel: "WALK_IN",
    });
  }
  // ONLINE_BOOKING: include legacy visits without channel (treated as portal bookings)
  return Visit.countDocuments({
    doctor: did,
    visitDate: { $gte: dayStart, $lte: dayEnd },
    $or: [
      { appointmentChannel: "ONLINE_BOOKING" },
      { appointmentChannel: { $exists: false } },
      { appointmentChannel: null },
    ],
  });
}

/**
 * Throws if daily quota for this doctor/day/channel is already reached.
 * Limit undefined / null / <= 0 means unlimited.
 */
export async function assertDailyAppointmentQuotaAllowed(
  doctorId: string,
  visitDate: Date,
  channel: AppointmentChannel
): Promise<void> {
  const doctor = await Doctor.findById(doctorId)
    .select("dailyOnlineAppointmentLimit dailyWalkInAppointmentLimit")
    .lean();
  if (!doctor) {
    return;
  }
  const limit =
    channel === "ONLINE_BOOKING"
      ? (doctor as any).dailyOnlineAppointmentLimit
      : (doctor as any).dailyWalkInAppointmentLimit;
  if (limit == null || typeof limit !== "number" || limit <= 0) {
    return;
  }
  const { start, end } = getISTDayBoundsForInstant(visitDate);
  const count = await countVisitsInISTDayForChannel(doctorId, start, end, channel);
  if (count >= limit) {
    throw new Error(
      channel === "ONLINE_BOOKING" ? "DAILY_ONLINE_QUOTA_FULL" : "DAILY_WALKIN_QUOTA_FULL"
    );
  }
}

export async function getDailyAppointmentQuotaSnapshot(
  doctorId: string,
  visitDate: Date
): Promise<{
  online: { limit: number | null; booked: number; remaining: number | null };
  walkIn: { limit: number | null; booked: number; remaining: number | null };
}> {
  const doctor = await Doctor.findById(doctorId)
    .select("dailyOnlineAppointmentLimit dailyWalkInAppointmentLimit")
    .lean();
  const onlineLimit =
    doctor && typeof (doctor as any).dailyOnlineAppointmentLimit === "number" && (doctor as any).dailyOnlineAppointmentLimit > 0
      ? (doctor as any).dailyOnlineAppointmentLimit
      : null;
  const walkLimit =
    doctor && typeof (doctor as any).dailyWalkInAppointmentLimit === "number" && (doctor as any).dailyWalkInAppointmentLimit > 0
      ? (doctor as any).dailyWalkInAppointmentLimit
      : null;

  const { start, end } = getISTDayBoundsForInstant(visitDate);
  const [onlineBooked, walkBooked] = await Promise.all([
    countVisitsInISTDayForChannel(doctorId, start, end, "ONLINE_BOOKING"),
    countVisitsInISTDayForChannel(doctorId, start, end, "WALK_IN"),
  ]);

  return {
    online: {
      limit: onlineLimit,
      booked: onlineBooked,
      remaining: onlineLimit != null ? Math.max(0, onlineLimit - onlineBooked) : null,
    },
    walkIn: {
      limit: walkLimit,
      booked: walkBooked,
      remaining: walkLimit != null ? Math.max(0, walkLimit - walkBooked) : null,
    },
  };
}
