import { AsyncLocalStorage } from "async_hooks";

export interface TenantStore {
  tenantId: string;
}

/** Request-scoped tenant id for Mongoose hooks and services. */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function runWithTenantContext<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

export async function runWithTenantContextAsync<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

export function getOptionalTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

export function hasTenantContext(): boolean {
  return Boolean(getOptionalTenantId());
}

/** Strict: throws when tenant context is missing (used when TENANT_ENFORCE=true). */
export function getCurrentTenantId(): string {
  const tenantId = getOptionalTenantId();
  if (!tenantId) {
    throw new Error("No tenant context found. All DB operations require a tenant.");
  }
  return tenantId;
}

export function isStrictTenantMode(): boolean {
  return process.env.TENANT_ENFORCE === "true";
}

export function isStrictPluginMode(): boolean {
  return process.env.TENANT_PLUGIN_ENFORCE === "true";
}

/**
 * During Step 8 backfill: include documents without tenantId in scoped queries.
 * Set TENANT_LEGACY_ORPHAN_READ=false after backfill completes.
 */
export function includesLegacyOrphanRecords(): boolean {
  return process.env.TENANT_LEGACY_ORPHAN_READ !== "false";
}

export function buildTenantQueryFilter(tenantId: string): Record<string, unknown> {
  if (!includesLegacyOrphanRecords()) {
    return { tenantId };
  }
  return {
    $or: [
      { tenantId },
      { tenantId: { $exists: false } },
      { tenantId: null },
      { tenantId: "" },
    ],
  };
}
