import type { Request } from "express";

/** Full API path (mount path + route path). */
export function getFullPath(req: Request): string {
  const base = req.baseUrl || "";
  const path = req.path || "";
  if (!base || base === "/") return path || "/";
  if (path === "/" || path === "") return base;
  return `${base}${path}`;
}

/** Platform-level routes: no tenant isolation (Super Admin, login, health). */
export function isPlatformRoute(req: Request): boolean {
  const full = getFullPath(req);
  if (full === "/health") return true;
  if (full.startsWith("/auth")) return true;
  if (full.startsWith("/super-admin")) return true;
  return false;
}

/** Public patient/clinic flows — tenant optional (resolved from slug when present). */
export function isPublicRoute(req: Request): boolean {
  const full = getFullPath(req);
  if (full.startsWith("/public")) return true;
  return false;
}

/** Skip tenant middleware entirely (no resolve, no enforce). */
export function shouldSkipTenantMiddleware(req: Request): boolean {
  if (isPlatformRoute(req)) return true;
  if (process.env.NODE_ENV === "production") {
    const full = getFullPath(req);
    const accept = req.get("Accept") ?? "";
    if (accept.includes("text/html") && !full.startsWith("/api")) {
      return true;
    }
  }
  return false;
}

/**
 * When TENANT_ENFORCE=true, these routes must have a resolved tenantId.
 * Public and platform routes are excluded.
 */
export function requiresTenantContext(req: Request): boolean {
  if (shouldSkipTenantMiddleware(req)) return false;
  if (isPublicRoute(req)) return false;

  const full = getFullPath(req);
  const tenantScopedPrefixes = [
    "/patients",
    "/appointments",
    "/pharmacy",
    "/orders",
    "/notifications",
    "/api/ocr",
  ];
  return tenantScopedPrefixes.some((prefix) => full.startsWith(prefix));
}
