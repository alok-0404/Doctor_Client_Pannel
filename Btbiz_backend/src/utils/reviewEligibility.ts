import mongoose from "mongoose";

import { Visit } from "../models/Visit";

/** A review (follow-up) with the same doctor is free within this many days of the consultation. */
export const FREE_REVIEW_WINDOW_DAYS = 10;

export type ReviewEligibilityReason = "NO_PREVIOUS_CONSULTATION" | "WINDOW_EXPIRED";

export interface ReviewEligibility {
  eligible: boolean;
  /** False while the 10-day rule is switched off: every review is free and never blocked. */
  enforced: boolean;
  windowDays: number;
  reason?: ReviewEligibilityReason;
  /** IST date (YYYY-MM-DD) of the consultation the review is counted from. */
  consultationDate?: string;
  /** Last IST date (YYYY-MM-DD) a free review can be booked for. */
  validUntil?: string;
  daysSinceConsultation?: number;
}

/** Website sends "Review Appointment", the bot sends "REVIEW_APPOINTMENT". */
export function isReviewConsultation(type: unknown): boolean {
  return /review/i.test(String(type ?? ""));
}

function istDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Set ENFORCE_REVIEW_WINDOW=true to turn the 10-day free-review rule on. Off = reviews always free. */
export function isReviewWindowEnforced(): boolean {
  return process.env.ENFORCE_REVIEW_WINDOW === "true";
}

/**
 * A review is free when the patient's latest non-review consultation with the same doctor
 * is on or before the requested date and at most FREE_REVIEW_WINDOW_DAYS earlier.
 * While the rule is not enforced, every review is reported as eligible (free).
 */
export async function checkReviewEligibility(
  patientId: string,
  doctorId: string,
  appointmentDate: string
): Promise<ReviewEligibility> {
  const result = await evaluateReviewWindow(patientId, doctorId, appointmentDate);
  if (isReviewWindowEnforced()) return result;
  return { ...result, eligible: true, enforced: false, reason: undefined };
}

async function evaluateReviewWindow(
  patientId: string,
  doctorId: string,
  appointmentDate: string
): Promise<ReviewEligibility> {
  const base: ReviewEligibility = { eligible: false, enforced: true, windowDays: FREE_REVIEW_WINDOW_DAYS };
  if (
    !mongoose.isValidObjectId(patientId) ||
    !mongoose.isValidObjectId(doctorId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
  ) {
    return { ...base, reason: "NO_PREVIOUS_CONSULTATION" };
  }

  const endOfRequestedDay = new Date(`${appointmentDate}T23:59:59.999+05:30`);
  const visits = await Visit.find({
    patient: new mongoose.Types.ObjectId(patientId),
    doctor: new mongoose.Types.ObjectId(doctorId),
    visitDate: { $lte: endOfRequestedDay }
  })
    .select("visitDate reason")
    .sort({ visitDate: -1 })
    .limit(50)
    .lean();

  const consultation = (visits as any[]).find((v) => !isReviewConsultation(v.reason));
  if (!consultation) {
    return { ...base, reason: "NO_PREVIOUS_CONSULTATION" };
  }

  const consultationDate = istDateKey(new Date(consultation.visitDate));
  const daysSinceConsultation = dayNumber(appointmentDate) - dayNumber(consultationDate);
  const validUntil = addDaysToKey(consultationDate, FREE_REVIEW_WINDOW_DAYS);
  const eligible = daysSinceConsultation >= 0 && daysSinceConsultation <= FREE_REVIEW_WINDOW_DAYS;

  return {
    ...base,
    eligible,
    reason: eligible ? undefined : "WINDOW_EXPIRED",
    consultationDate,
    validUntil,
    daysSinceConsultation
  };
}
