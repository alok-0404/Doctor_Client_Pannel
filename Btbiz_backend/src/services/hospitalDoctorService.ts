import mongoose from "mongoose";

import { DEFAULT_DEPARTMENT_ID, getDepartmentLabel } from "../constants/departments";
import { Doctor } from "../models/Doctor";

export interface HospitalDoctor {
  id: string;
  name: string;
  department: string;
  departmentLabel: string;
  specialization?: string;
  clinicLatitude?: number;
  clinicLongitude?: number;
  availabilityStatus: "available" | "unavailable" | "busy";
  unavailableReason?: string;
  unavailableUntil?: string;
}

/**
 * Every bookable doctor in the current hospital. The tenant plugin scopes this to the
 * logged-in staff member's tenant, so other clinics' doctors never appear.
 */
export async function listHospitalDoctors(): Promise<HospitalDoctor[]> {
  const docs = await Doctor.find({
    role: "DOCTOR",
    approvalStatus: { $nin: ["PENDING", "REJECTED"] }
  })
    .select("name department specialization clinicLatitude clinicLongitude availabilityStatus unavailableReason unavailableUntil")
    .sort({ name: 1 })
    .lean();

  return (docs as any[]).map((d) => {
    const department = d.department || DEFAULT_DEPARTMENT_ID;
    return {
      id: String(d._id),
      name: String(d.name ?? "Doctor"),
      department,
      departmentLabel: getDepartmentLabel(department),
      specialization: d.specialization || undefined,
      clinicLatitude: typeof d.clinicLatitude === "number" ? d.clinicLatitude : undefined,
      clinicLongitude: typeof d.clinicLongitude === "number" ? d.clinicLongitude : undefined,
      availabilityStatus: d.availabilityStatus ?? "available",
      unavailableReason: d.unavailableReason || undefined,
      unavailableUntil: d.unavailableUntil ? new Date(d.unavailableUntil).toISOString() : undefined
    };
  });
}

export function hospitalDoctorObjectIds(doctors: HospitalDoctor[]): mongoose.Types.ObjectId[] {
  return doctors.map((d) => new mongoose.Types.ObjectId(d.id));
}

/** Returns the doctor when `doctorId` is a bookable doctor in the current hospital. */
export async function findHospitalDoctor(doctorId: string): Promise<HospitalDoctor | null> {
  if (!mongoose.isValidObjectId(doctorId)) return null;
  const doctors = await listHospitalDoctors();
  return doctors.find((d) => d.id === doctorId) ?? null;
}
