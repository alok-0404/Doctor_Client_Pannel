import type { Request } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { Doctor } from "../models/Doctor";
import { Tenant } from "../models/Tenant";

interface StaffJwtPayload {
  doctorId?: string;
  role?: string;
  tenantId?: string;
  tenantType?: string;
}

interface PatientJwtPayload {
  patientId?: string;
  type?: string;
  tenantId?: string;
}

const SLUG_HEADER = "x-tenant-slug";

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

function extractSlugFromPath(path: string): string | null {
  const match = path.match(/\/(?:public\/)?clinic\/([^/]+)/i);
  if (!match?.[1]) return null;
  return normalizeSlug(decodeURIComponent(match[1]));
}

function extractSubdomainSlug(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub || sub === "www" || sub === "api") return null;
  return normalizeSlug(sub);
}

function extractWhatsappNumber(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const candidates = [record.to, record.To, record.whatsappNumber, record.phone_number_id];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export async function resolveTenantIdBySlug(slug: string): Promise<string | null> {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const tenant = await Tenant.findOne({ slug: normalized, status: "ACTIVE" })
    .select("_id")
    .lean();
  return tenant?._id ?? null;
}

export async function resolveTenantIdByWhatsappNumber(number: string): Promise<string | null> {
  const trimmed = number.trim();
  if (!trimmed) return null;
  const tenant = await Tenant.findOne({
    whatsappNumber: trimmed,
    status: "ACTIVE",
  })
    .select("_id")
    .lean();
  return tenant?._id ?? null;
}

async function resolveFromJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  let decoded: StaffJwtPayload & PatientJwtPayload;
  try {
    decoded = jwt.verify(token, env.jwt.secret) as StaffJwtPayload & PatientJwtPayload;
  } catch {
    return null;
  }

  if (decoded.role === "SUPER_ADMIN") return null;

  if (typeof decoded.tenantId === "string" && decoded.tenantId.trim()) {
    return decoded.tenantId.trim();
  }

  if (decoded.doctorId) {
    const doctor = await Doctor.findById(decoded.doctorId).select("tenantId").lean();
    const fromDb = doctor?.tenantId;
    if (typeof fromDb === "string" && fromDb.trim()) {
      return fromDb.trim();
    }
  }

  return null;
}

/** Slug/subdomain/header only — for mismatch detection vs JWT. */
export async function resolveTenantIdFromSlugOnly(req: Request): Promise<string | null> {
  const headerSlug = req.get(SLUG_HEADER);
  if (headerSlug) {
    return resolveTenantIdBySlug(headerSlug);
  }

  const pathSlug = extractSlugFromPath(req.originalUrl || req.path);
  if (pathSlug) {
    return resolveTenantIdBySlug(pathSlug);
  }

  const subdomainSlug = extractSubdomainSlug(req.get("host"));
  if (subdomainSlug) {
    return resolveTenantIdBySlug(subdomainSlug);
  }

  return null;
}

/**
 * Resolve tenant for the current request (priority: JWT → slug path → subdomain → header → WhatsApp body).
 */
export async function resolveTenantId(req: Request): Promise<string | null> {
  if (req.tenantId) {
    return req.tenantId;
  }

  const fromJwt = await resolveFromJwt(req);
  if (fromJwt) return fromJwt;

  const fromSlug = await resolveTenantIdFromSlugOnly(req);
  if (fromSlug) return fromSlug;

  const waNumber = extractWhatsappNumber(req.body);
  if (waNumber) {
    const fromWa = await resolveTenantIdByWhatsappNumber(waNumber);
    if (fromWa) return fromWa;
  }

  if (req.doctor?.tenantId) {
    return req.doctor.tenantId;
  }

  return null;
}
