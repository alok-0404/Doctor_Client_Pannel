import { Doctor } from "../models/Doctor";
import { Tenant, type TenantType } from "../models/Tenant";
import { buildProviderLocationQuery } from "./geocodeService";

export type PatientProviderKind = "pharmacy" | "lab";

const kindToTenantType = (kind: PatientProviderKind): TenantType =>
  kind === "pharmacy" ? "PHARMACY" : "LAB";

const kindToRole = (kind: PatientProviderKind): "PHARMACY" | "LAB_MANAGER" =>
  kind === "pharmacy" ? "PHARMACY" : "LAB_MANAGER";

export interface PatientSelectableProvider {
  _id: string;
  name: string;
  role: string;
  tenantId?: string;
  clinicLatitude?: number;
  clinicLongitude?: number;
  clinicAddress?: string;
  /** Used to geocode when lat/lng are missing (tenant address, shop name, etc.). */
  locationQuery?: string;
}

/** All pharmacies/labs patients can pick: Super Admin tenants (ACTIVE) + active self-signup accounts. */
export async function listPatientSelectableProviders(
  kind: PatientProviderKind
): Promise<PatientSelectableProvider[]> {
  const tenantType = kindToTenantType(kind);
  const role = kindToRole(kind);
  const byId = new Map<string, PatientSelectableProvider>();

  const activeTenants = await Tenant.find({
    tenantType,
    status: "ACTIVE",
  })
    .select("_id name ownerUserId phone address")
    .lean();

  const ownerIds = activeTenants
    .map((t) => t.ownerUserId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const owners =
    ownerIds.length > 0
      ? await Doctor.find({ _id: { $in: ownerIds }, role })
          .select("_id name role tenantId clinicLatitude clinicLongitude clinicAddress status")
          .lean()
      : [];

  const ownerById = new Map(owners.map((o) => [o._id.toString(), o]));

  for (const tenant of activeTenants) {
    if (!tenant.ownerUserId) continue;
    const owner = ownerById.get(tenant.ownerUserId);
    if (!owner) continue;
    const id = owner._id.toString();
    const displayName = tenant.name?.trim() || owner.name;
    byId.set(id, {
      _id: id,
      name: displayName,
      role: owner.role,
      tenantId: tenant._id,
      clinicLatitude: owner.clinicLatitude,
      clinicLongitude: owner.clinicLongitude,
      clinicAddress: owner.clinicAddress,
      locationQuery: buildProviderLocationQuery(
        tenant.address,
        owner.clinicAddress,
        displayName
      ),
    });
  }

  const legacyDoctors = await Doctor.find({
    role,
    status: true,
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: "" }],
  })
    .select("_id name role tenantId clinicLatitude clinicLongitude clinicAddress")
    .lean();

  for (const doc of legacyDoctors) {
    const id = doc._id.toString();
    if (byId.has(id)) continue;
    byId.set(id, {
      _id: id,
      name: doc.name,
      role: doc.role,
      tenantId: doc.tenantId,
      clinicLatitude: doc.clinicLatitude,
      clinicLongitude: doc.clinicLongitude,
      clinicAddress: doc.clinicAddress,
      locationQuery: buildProviderLocationQuery(undefined, doc.clinicAddress, doc.name),
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function isProviderSelectableForPatient(
  providerId: string,
  kind: PatientProviderKind
): Promise<boolean> {
  const expectedRole = kindToRole(kind);
  const provider = await Doctor.findById(providerId)
    .select("role status tenantId")
    .lean();
  if (!provider || provider.role !== expectedRole) {
    return false;
  }

  if (provider.tenantId) {
    const tenant = await Tenant.findById(provider.tenantId).select("status tenantType").lean();
    if (!tenant || tenant.status !== "ACTIVE") {
      return false;
    }
    const expectedType = kindToTenantType(kind);
    return tenant.tenantType === expectedType;
  }

  return provider.status === true;
}
