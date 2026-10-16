import mongoose from "mongoose";

import { Doctor } from "../models/Doctor";
import { Visit } from "../models/Visit";
import { getDailyAppointmentQuotaSnapshot } from "./appointmentQuota";

export interface OpdSession {
  startMinutes: number;
  endMinutes: number;
}

export interface DoctorSlot {
  /** Display label, e.g. "10:30 AM" — also the value sent back as preferredSlot. */
  time: string;
  startsAt: string;
  available: boolean;
  booked: number;
}

export interface DoctorSlotsResult {
  date: string;
  slotMinutes: number;
  capacityPerSlot: number;
  doctorAvailable: boolean;
  unavailableReason?: string;
  quotaFull: boolean;
  slots: DoctorSlot[];
}

const DEFAULT_OPD_SESSIONS = "10:00-19:00";
const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_CAPACITY_PER_SLOT = 1;
/** Today's slots that start sooner than this are not offered. */
const MIN_LEAD_MINUTES = 15;

function parseHHMM(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** OPD_SESSIONS="10:00-19:00" or "10:00-13:00,17:00-20:00" (IST, 24h). Invalid entries are ignored. */
export function parseOpdSessions(raw: string | undefined): OpdSession[] {
  const sessions: OpdSession[] = [];
  for (const part of String(raw || DEFAULT_OPD_SESSIONS).split(",")) {
    const [from, to] = part.split("-");
    const start = from ? parseHHMM(from) : null;
    const end = to ? parseHHMM(to) : null;
    if (start != null && end != null && end > start) {
      sessions.push({ startMinutes: start, endMinutes: end });
    }
  }
  return sessions.length ? sessions : parseOpdSessions(DEFAULT_OPD_SESSIONS);
}

function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function getSlotConfig(): { sessions: OpdSession[]; slotMinutes: number; capacityPerSlot: number } {
  return {
    sessions: parseOpdSessions(process.env.OPD_SESSIONS),
    slotMinutes: positiveIntFromEnv(process.env.OPD_SLOT_MINUTES, DEFAULT_SLOT_MINUTES),
    capacityPerSlot: positiveIntFromEnv(process.env.OPD_PATIENTS_PER_SLOT, DEFAULT_CAPACITY_PER_SLOT),
  };
}

export function formatSlotLabel(minutesOfDay: number): string {
  const h24 = Math.floor(minutesOfDay / 60);
  const min = minutesOfDay % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${mer}`;
}

function istInstant(dateStr: string, minutesOfDay: number): Date {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const mm = String(minutesOfDay % 60).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00+05:30`);
}

/**
 * Bookable OPD slots for one doctor on one IST calendar day.
 * A slot is unavailable when it is in the past, already holds `capacityPerSlot` online
 * bookings, falls inside the doctor's "unavailable" window, or the daily online quota is full.
 */
export async function getDoctorSlotsForDate(
  doctorId: string,
  dateStr: string,
  now: Date = new Date()
): Promise<DoctorSlotsResult | null> {
  const doctor = await Doctor.findOne({
    _id: doctorId,
    role: "DOCTOR",
    approvalStatus: { $nin: ["PENDING", "REJECTED"] },
  })
    .select("availabilityStatus unavailableReason unavailableUntil")
    .lean();
  if (!doctor) return null;

  const { sessions, slotMinutes, capacityPerSlot } = getSlotConfig();
  const dayStart = istInstant(dateStr, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  const quota = await getDailyAppointmentQuotaSnapshot(doctorId, istInstant(dateStr, 12 * 60));
  const quotaFull = quota.online.remaining === 0;

  const visits = await Visit.find({
    doctor: new mongoose.Types.ObjectId(doctorId),
    visitDate: { $gte: dayStart, $lte: dayEnd },
    $or: [
      { appointmentChannel: "ONLINE_BOOKING" },
      { appointmentChannel: { $exists: false } },
      { appointmentChannel: null },
    ],
  })
    .select("visitDate")
    .lean();

  const status = (doctor as any).availabilityStatus as string | undefined;
  const unavailableUntilRaw = (doctor as any).unavailableUntil as Date | undefined;
  const unavailableUntil = unavailableUntilRaw ? new Date(unavailableUntilRaw) : undefined;
  const isUnavailableNow = status === "unavailable";
  const isToday = now >= dayStart && now <= dayEnd;
  const isBlockedByStatus = (slotStart: Date): boolean => {
    if (!isUnavailableNow) return false;
    if (unavailableUntil && !Number.isNaN(unavailableUntil.getTime())) {
      return slotStart < unavailableUntil;
    }
    // No end time given: treat as "off for today" only.
    return isToday;
  };

  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60 * 1000);
  const slots: DoctorSlot[] = [];
  for (const session of sessions) {
    for (let m = session.startMinutes; m + slotMinutes <= session.endMinutes; m += slotMinutes) {
      const start = istInstant(dateStr, m);
      const end = new Date(start.getTime() + slotMinutes * 60 * 1000);
      const booked = visits.filter((v: any) => {
        const t = new Date(v.visitDate).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      const available =
        !quotaFull && start >= earliest && booked < capacityPerSlot && !isBlockedByStatus(start);
      slots.push({ time: formatSlotLabel(m), startsAt: start.toISOString(), available, booked });
    }
  }

  const blockedAllDay = slots.length > 0 && slots.every((s) => isBlockedByStatus(new Date(s.startsAt)));
  return {
    date: dateStr,
    slotMinutes,
    capacityPerSlot,
    doctorAvailable: !blockedAllDay,
    ...(blockedAllDay && (doctor as any).unavailableReason
      ? { unavailableReason: String((doctor as any).unavailableReason) }
      : {}),
    quotaFull,
    slots,
  };
}

/** True when `preferredSlot` matches a currently available slot label for that day. */
export async function isSlotStillAvailable(
  doctorId: string,
  dateStr: string,
  preferredSlot: string
): Promise<boolean> {
  const result = await getDoctorSlotsForDate(doctorId, dateStr);
  if (!result) return false;
  const wanted = preferredSlot.trim().toUpperCase().replace(/\s+/g, " ");
  return result.slots.some((s) => s.available && s.time.toUpperCase() === wanted);
}
