import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { runWithTenantContext } from "./tenantContext";
import {
  isPlatformRoute,
  requiresTenantContext,
  shouldSkipTenantMiddleware,
} from "./publicRoutes";
import { resolveTenantId, resolveTenantIdFromSlugOnly } from "./tenantResolver";

function logTenantMismatch(req: Request, jwtTenantId: string, slugTenantId: string): void {
  // eslint-disable-next-line no-console
  console.warn("[tenant] JWT vs URL tenant mismatch (possible tampering)", {
    path: req.originalUrl,
    method: req.method,
    jwtTenantId,
    slugTenantId,
    ip: req.ip,
  });
}

/**
 * Express middleware: resolve tenantId and store in AsyncLocalStorage + req.tenantId.
 *
 * Default (TENANT_ENFORCE=false): legacy requests without tenant still pass through.
 * Strict (TENANT_ENFORCE=true): protected routes without tenant return 403.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (shouldSkipTenantMiddleware(req)) {
      next();
      return;
    }

    const tenantId = await resolveTenantId(req);
    const slugTenantId = await resolveTenantIdFromSlugOnly(req);

    if (tenantId && slugTenantId && tenantId !== slugTenantId && !isPlatformRoute(req)) {
      logTenantMismatch(req, tenantId, slugTenantId);
      if (env.tenant.enforce) {
        res.status(403).json({ error: "Tenant context mismatch" });
        return;
      }
    }

    if (tenantId) {
      req.tenantId = tenantId;
      runWithTenantContext(tenantId, () => next());
      return;
    }

    if (requiresTenantContext(req) && env.tenant.enforce) {
      res.status(403).json({ error: "Tenant context required" });
      return;
    }

    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Tenant middleware error:", {
      path: req.originalUrl,
      ip: req.ip,
      error: error instanceof Error ? error.message : error,
    });
    res.status(403).json({ error: "Invalid tenant context" });
  }
}
