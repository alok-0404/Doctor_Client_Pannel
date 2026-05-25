import bcrypt from "bcrypt";

import { Doctor, type DoctorRole } from "../models/Doctor";
import { Tenant, type TenantType } from "../models/Tenant";

export interface CreatePartnerTenantPayload {
  tenantType: "PHARMACY" | "LAB";
  name: string;
  slug?: string;
  email: string;
  password: string;
  phone: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

const normalizeIndianPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+91${digits.slice(-10)}`;
};

export const slugifyTenantName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "tenant";

const roleForTenantType = (tenantType: "PHARMACY" | "LAB"): DoctorRole =>
  tenantType === "PHARMACY" ? "PHARMACY" : "LAB_MANAGER";

const buildTenantId = (tenantType: TenantType, slug: string): string => {
  const prefix =
    tenantType === "PHARMACY" ? "pharmacy" : tenantType === "LAB" ? "lab" : "clinic";
  return `${prefix}_${slug}_${Date.now().toString(36)}`;
};

export const createPartnerTenant = async (
  payload: CreatePartnerTenantPayload
): Promise<{ tenant: ITenantResponse; owner: { id: string; email: string; role: DoctorRole } }> => {
  const { tenantType, name, email, password, phone, address } = payload;
  const slug = (payload.slug?.trim() || slugifyTenantName(name)).toLowerCase();
  const normalizedPhone = normalizeIndianPhone(phone);

  const slugTaken = await Tenant.findOne({ slug }).lean();
  if (slugTaken) {
    throw new Error("SLUG_ALREADY_EXISTS");
  }

  const existingUser = await Doctor.findOne({
    $or: [{ email: email.trim().toLowerCase() }, { phone: normalizedPhone }],
  });
  if (existingUser) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const tenantId = buildTenantId(tenantType, slug);
  const passwordHash = await bcrypt.hash(password, 10);
  const role = roleForTenantType(tenantType);

  let ownerId: string | null = null;
  try {
    const owner = await Doctor.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: normalizedPhone,
      passwordHash,
      role,
      status: true,
      tenantId,
      tenantType,
    });
    ownerId = owner._id.toString();

    const tenant = await Tenant.create({
      _id: tenantId,
      tenantType,
      name: name.trim(),
      slug,
      ownerUserId: ownerId,
      phone: normalizedPhone,
      address,
      subscription: { plan: "FREE", status: "ACTIVE" },
      status: "ACTIVE",
    });

    return {
      tenant: toTenantResponse(tenant),
      owner: { id: ownerId, email: owner.email, role: owner.role },
    };
  } catch (err) {
    if (ownerId) {
      await Doctor.findByIdAndDelete(ownerId).catch(() => undefined);
    }
    throw err;
  }
};

export interface ITenantResponse {
  id: string;
  tenantType: TenantType;
  name: string;
  slug: string;
  status: string;
  phone?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
  createdAt: string;
}

const toTenantResponse = (t: {
  _id: string;
  tenantType: TenantType;
  name: string;
  slug: string;
  status: string;
  phone?: string;
  ownerUserId?: string;
  createdAt?: Date;
}): ITenantResponse => ({
  id: t._id,
  tenantType: t.tenantType,
  name: t.name,
  slug: t.slug,
  status: t.status,
  phone: t.phone,
  ownerUserId: t.ownerUserId,
  createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
});

export interface UpdatePartnerTenantPayload {
  name?: string;
  slug?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: "ACTIVE" | "SUSPENDED" | "TRIAL";
}

export const updatePartnerTenant = async (
  tenantId: string,
  payload: UpdatePartnerTenantPayload
): Promise<ITenantResponse> => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const updates: Record<string, unknown> = {};
  if (payload.name?.trim()) {
    updates.name = payload.name.trim();
  }
  if (payload.slug?.trim()) {
    const slug = payload.slug.trim().toLowerCase();
    const slugTaken = await Tenant.findOne({ slug, _id: { $ne: tenantId } }).lean();
    if (slugTaken) {
      throw new Error("SLUG_ALREADY_EXISTS");
    }
    updates.slug = slug;
  }
  if (payload.status) {
    updates.status = payload.status;
  }

  let normalizedPhone: string | undefined;
  if (payload.phone?.trim()) {
    normalizedPhone = normalizeIndianPhone(payload.phone);
    updates.phone = normalizedPhone;
  }

  if (tenant.ownerUserId) {
    const ownerUpdates: Record<string, unknown> = {};
    if (updates.name) {
      ownerUpdates.name = updates.name;
    }
    if (normalizedPhone) {
      ownerUpdates.phone = normalizedPhone;
    }
    if (payload.email?.trim()) {
      const email = payload.email.trim().toLowerCase();
      const emailTaken = await Doctor.findOne({
        email,
        _id: { $ne: tenant.ownerUserId },
      }).lean();
      if (emailTaken) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }
      ownerUpdates.email = email;
    }
    if (payload.password?.trim()) {
      ownerUpdates.passwordHash = await bcrypt.hash(payload.password, 10);
    }
    if (payload.status) {
      ownerUpdates.status = payload.status === "ACTIVE";
    }
    if (Object.keys(ownerUpdates).length > 0) {
      await Doctor.findByIdAndUpdate(tenant.ownerUserId, ownerUpdates);
    }
  }

  const updated = await Tenant.findByIdAndUpdate(tenantId, updates, { new: true }).lean();
  if (!updated) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const listed = await listTenants(updated.tenantType);
  const match = listed.find((t) => t.id === tenantId);
  if (!match) {
    return toTenantResponse(updated as Parameters<typeof toTenantResponse>[0]);
  }
  return match;
};

export const deletePartnerTenant = async (tenantId: string): Promise<void> => {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }
  if (tenant.ownerUserId) {
    await Doctor.findByIdAndDelete(tenant.ownerUserId);
  }
  await Tenant.findByIdAndDelete(tenantId);
};

export interface UpdateLegacyPartnerPayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: boolean;
}

export const updateLegacyPartner = async (
  doctorId: string,
  payload: UpdateLegacyPartnerPayload
): Promise<void> => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new Error("PARTNER_NOT_FOUND");
  }
  if (doctor.role !== "PHARMACY" && doctor.role !== "LAB_MANAGER") {
    throw new Error("INVALID_PARTNER_ROLE");
  }
  if (doctor.tenantId) {
    throw new Error("USE_TENANT_ENDPOINT");
  }

  const updates: Record<string, unknown> = {};
  if (payload.name?.trim()) {
    updates.name = payload.name.trim();
  }
  if (payload.phone?.trim()) {
    updates.phone = normalizeIndianPhone(payload.phone);
  }
  if (payload.email?.trim()) {
    const email = payload.email.trim().toLowerCase();
    const emailTaken = await Doctor.findOne({ email, _id: { $ne: doctorId } }).lean();
    if (emailTaken) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
    updates.email = email;
  }
  if (payload.password?.trim()) {
    updates.passwordHash = await bcrypt.hash(payload.password, 10);
  }
  if (typeof payload.status === "boolean") {
    updates.status = payload.status;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await Doctor.findByIdAndUpdate(doctorId, updates);
};

export const deleteLegacyPartner = async (doctorId: string): Promise<void> => {
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new Error("PARTNER_NOT_FOUND");
  }
  if (doctor.role !== "PHARMACY" && doctor.role !== "LAB_MANAGER") {
    throw new Error("INVALID_PARTNER_ROLE");
  }
  if (doctor.tenantId) {
    throw new Error("USE_TENANT_ENDPOINT");
  }
  await Doctor.findByIdAndDelete(doctorId);
};

export const listTenants = async (
  tenantType?: TenantType
): Promise<ITenantResponse[]> => {
  const filter = tenantType ? { tenantType } : {};
  const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();

  const ownerIds = tenants
    .map((t) => t.ownerUserId)
    .filter((id): id is string => !!id);

  const owners =
    ownerIds.length > 0
      ? await Doctor.find({ _id: { $in: ownerIds } })
          .select("name email")
          .lean()
      : [];

  const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

  return tenants.map((t) => {
    const owner = t.ownerUserId ? ownerMap.get(t.ownerUserId) : undefined;
    return {
      ...toTenantResponse(t as Parameters<typeof toTenantResponse>[0]),
      ownerEmail: owner?.email,
      ownerName: owner?.name,
    };
  });
};
