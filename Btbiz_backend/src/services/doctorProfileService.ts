import { Doctor } from "../models/Doctor";
import {
  DEFAULT_DEPARTMENT_ID,
  getDepartmentLabel,
  isValidDepartmentId
} from "../constants/departments";

export const DOCTOR_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const DOCTOR_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Fields every public doctor listing needs (never includes the photo bytes). */
export const PUBLIC_DOCTOR_SELECT =
  "_id name clinicLatitude clinicLongitude clinicAddress availabilityStatus department specialization qualification experienceYears previousHospital bio isFeatured displayOrder photoUpdatedAt";

const TEXT_LIMITS = {
  specialization: 80,
  qualification: 120,
  previousHospital: 120,
  bio: 600
} as const;

export class DoctorProfileValidationError extends Error {}

export interface DoctorProfileUpdate {
  $set: Record<string, unknown>;
  $unset: Record<string, 1>;
}

/**
 * Validates optional public-profile fields from a request body.
 * Only keys present in the body are touched; empty string / null clears a field.
 * `allowAdminFields` enables isFeatured / displayOrder (super-admin only).
 */
export function buildDoctorProfileUpdate(
  body: Record<string, unknown>,
  options: { allowAdminFields?: boolean } = {}
): DoctorProfileUpdate {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (body.department !== undefined) {
    if (body.department === null || body.department === "") {
      $unset.department = 1;
    } else if (isValidDepartmentId(body.department)) {
      $set.department = body.department;
    } else {
      throw new DoctorProfileValidationError("Invalid department");
    }
  }

  for (const key of Object.keys(TEXT_LIMITS) as Array<keyof typeof TEXT_LIMITS>) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      $unset[key] = 1;
      continue;
    }
    if (typeof raw !== "string") {
      throw new DoctorProfileValidationError(`${key} must be text`);
    }
    const value = raw.trim();
    if (value.length > TEXT_LIMITS[key]) {
      throw new DoctorProfileValidationError(`${key} must be at most ${TEXT_LIMITS[key]} characters`);
    }
    $set[key] = value;
  }

  if (body.experienceYears !== undefined) {
    if (body.experienceYears === null || body.experienceYears === "") {
      $unset.experienceYears = 1;
    } else {
      const years = Number(body.experienceYears);
      if (!Number.isFinite(years) || years < 0 || years > 80) {
        throw new DoctorProfileValidationError("experienceYears must be between 0 and 80");
      }
      $set.experienceYears = Math.floor(years);
    }
  }

  if (options.allowAdminFields) {
    if (body.isFeatured !== undefined) {
      $set.isFeatured = body.isFeatured === true || body.isFeatured === "true";
    }
    if (body.displayOrder !== undefined) {
      if (body.displayOrder === null || body.displayOrder === "") {
        $unset.displayOrder = 1;
      } else {
        const order = Number(body.displayOrder);
        if (!Number.isFinite(order)) {
          throw new DoctorProfileValidationError("displayOrder must be a number");
        }
        $set.displayOrder = Math.floor(order);
      }
    }
  }

  return { $set, $unset };
}

export function hasDoctorProfileChanges(update: DoctorProfileUpdate): boolean {
  return Object.keys(update.$set).length > 0 || Object.keys(update.$unset).length > 0;
}

export async function applyDoctorProfileUpdate(doctorId: string, update: DoctorProfileUpdate): Promise<void> {
  if (!hasDoctorProfileChanges(update)) return;
  await Doctor.findByIdAndUpdate(doctorId, {
    ...(Object.keys(update.$set).length > 0 && { $set: update.$set }),
    ...(Object.keys(update.$unset).length > 0 && { $unset: update.$unset })
  });
}

export function doctorPhotoUrl(doctor: any, baseUrl: string): string | undefined {
  if (!doctor?.photoUpdatedAt) return undefined;
  const version = new Date(doctor.photoUpdatedAt).getTime();
  return `${baseUrl.replace(/\/+$/, "")}/public/doctors/${doctor._id.toString()}/photo?v=${version}`;
}

/** Public-safe doctor shape. Keeps the original keys (id, name, clinic*) used by the bot and booking page. */
export function toPublicDoctor(doctor: any, baseUrl: string) {
  const department = doctor.department || DEFAULT_DEPARTMENT_ID;
  return {
    id: doctor._id.toString(),
    name: doctor.name,
    clinicLatitude: doctor.clinicLatitude,
    clinicLongitude: doctor.clinicLongitude,
    clinicAddress: doctor.clinicAddress,
    department,
    departmentLabel: getDepartmentLabel(department),
    specialization: doctor.specialization,
    qualification: doctor.qualification,
    experienceYears: typeof doctor.experienceYears === "number" ? doctor.experienceYears : undefined,
    previousHospital: doctor.previousHospital,
    bio: doctor.bio,
    availabilityStatus: doctor.availabilityStatus ?? "available",
    isFeatured: Boolean(doctor.isFeatured),
    photoUrl: doctorPhotoUrl(doctor, baseUrl)
  };
}

/** Featured first, then admin display order, then most experienced, then name. */
export function compareDoctorsBySeniority(a: any, b: any): number {
  const featured = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
  if (featured !== 0) return featured;
  const orderA = typeof a.displayOrder === "number" ? a.displayOrder : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.displayOrder === "number" ? b.displayOrder : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  const expA = typeof a.experienceYears === "number" ? a.experienceYears : -1;
  const expB = typeof b.experienceYears === "number" ? b.experienceYears : -1;
  if (expA !== expB) return expB - expA;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

export async function saveDoctorPhoto(
  doctorId: string,
  file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined
): Promise<Date> {
  if (!file?.buffer || !file.size) {
    throw new DoctorProfileValidationError("Photo file is required");
  }
  if (!DOCTOR_PHOTO_MIME_TYPES.has(String(file.mimetype))) {
    throw new DoctorProfileValidationError("Photo must be JPG, PNG, or WEBP");
  }
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) {
    throw new DoctorProfileValidationError("Photo must be 2 MB or smaller");
  }
  const photoUpdatedAt = new Date();
  await Doctor.findByIdAndUpdate(doctorId, {
    $set: {
      profilePhoto: { data: file.buffer, contentType: file.mimetype },
      photoUpdatedAt
    }
  });
  return photoUpdatedAt;
}

export async function removeDoctorPhoto(doctorId: string): Promise<void> {
  await Doctor.findByIdAndUpdate(doctorId, { $unset: { profilePhoto: 1, photoUpdatedAt: 1 } });
}
