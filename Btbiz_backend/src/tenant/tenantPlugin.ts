import type { Schema } from "mongoose";

import {
  getCurrentTenantId,
  getOptionalTenantId,
  buildTenantQueryFilter,
  isStrictPluginMode,
  tenantStorage,
} from "./tenantContext";

export {
  tenantStorage,
  getCurrentTenantId,
  getOptionalTenantId,
  hasTenantContext,
  buildTenantQueryFilter,
  includesLegacyOrphanRecords,
} from "./tenantContext";
export { runWithTenantContext, runWithTenantContextAsync } from "./tenantContext";

const QUERY_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
] as const;

/**
 * Mongoose plugin: adds tenantId and auto-scopes queries when tenant context exists.
 *
 * Soft mode (default): no context → queries unchanged (legacy DB still works).
 * Strict mode (TENANT_PLUGIN_ENFORCE=true): no context → throw on query/save.
 */
export function tenantPlugin(schema: Schema): void {
  if (!schema.path("tenantId")) {
    schema.add({
      tenantId: { type: String, index: true },
    });
  }

  schema.pre("save", function (next) {
    const doc = this as { tenantId?: string };
    if (doc.tenantId) {
      next();
      return;
    }
    const tenantId = getOptionalTenantId();
    if (tenantId) {
      doc.tenantId = tenantId;
      next();
      return;
    }
    if (isStrictPluginMode()) {
      next(new Error("No tenant context for save"));
      return;
    }
    next();
  });

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function (next) {
      const tenantId = getOptionalTenantId();
      if (!tenantId) {
        if (isStrictPluginMode()) {
          next(new Error(`No tenant context for ${hook}`));
          return;
        }
        next();
        return;
      }
      this.where(buildTenantQueryFilter(tenantId));
      next();
    });
  }

  schema.pre("aggregate", function (next) {
    const tenantId = getOptionalTenantId();
    if (!tenantId) {
      if (isStrictPluginMode()) {
        next(new Error("No tenant context for aggregate"));
        return;
      }
      next();
      return;
    }
    this.pipeline().unshift({ $match: buildTenantQueryFilter(tenantId) });
    next();
  });
}
