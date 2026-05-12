import type { Request } from "express";

import { env } from "./env";

/**
 * Browser-facing origin (scheme + host) for absolute URLs returned in JSON (document links, etc.).
 * Behind Replit/nginx TLS, req.protocol can be "http" unless trust proxy + X-Forwarded-* are applied.
 */
export function getPublicBaseUrl(req: Request): string {
  const override = env.publicAppBaseUrl?.replace(/\/+$/, "");
  if (override) return override;

  const xfProto = (req.get("x-forwarded-proto") || "").split(",")[0]?.trim().toLowerCase();
  const xfHost = (req.get("x-forwarded-host") || "").split(",")[0]?.trim();

  let proto = (xfProto || req.protocol || "http").replace(/:$/, "");
  if (proto !== "http" && proto !== "https") proto = "https";

  const host = (xfHost || req.get("host") || "").trim();
  if (!host) return `${proto}://localhost`;

  if (proto === "http" && (host.endsWith(".replit.app") || host.endsWith(".replit.dev"))) {
    proto = "https";
  }

  return `${proto}://${host}`;
}
