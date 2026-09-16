import type { BookingSource } from "../models/Visit";

export type { BookingSource };

/** Normalize a client-supplied booking source. Bot aliases count as WhatsApp. */
export function parseBookingSource(value: unknown): BookingSource | undefined {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "WHATSAPP" || raw === "BOT") return "WHATSAPP";
  if (raw === "WEBSITE" || raw === "WEB" || raw === "PORTAL") return "WEBSITE";
  if (raw === "WALK_IN" || raw === "WALKIN") return "WALK_IN";
  return undefined;
}

/**
 * Resolve source for API responses.
 * Legacy visits (before bookingSource existed):
 * - WhatsApp old-patient flow stored "OPD No:" in notes
 * - WhatsApp new-patient flow stored reason "New appointment"
 * Website family bookings use "New Consultation" / "Family appointment" and must NOT be WhatsApp.
 */
export function resolveBookingSource(visit: {
  bookingSource?: string;
  reason?: string;
  notes?: string;
}): BookingSource | undefined {
  const stored = parseBookingSource(visit.bookingSource);
  if (stored) return stored;

  const notes = String(visit.notes ?? "").toUpperCase();
  const reason = String(visit.reason ?? "").toUpperCase().replace(/\s+/g, "_");
  if (notes.includes("OPD NO:")) return "WHATSAPP";
  if (reason === "NEW_APPOINTMENT") return "WHATSAPP";
  return undefined;
}
