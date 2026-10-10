import mongoose, { Document, Schema, Types } from "mongoose";

import { tenantPlugin } from "../tenant/tenantPlugin";

export type DoctorRole = "DOCTOR" | "ASSISTANT" | "LAB_ASSISTANT" | "LAB_MANAGER" | "PHARMACY";
export type AvailabilityStatus = "available" | "unavailable" | "busy";

export type TenantType = "CLINIC" | "PHARMACY" | "LAB";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IDoctor extends Document {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: DoctorRole;
  status: boolean;
  /** Platform tenant this user belongs to (clinic / pharmacy / lab) */
  tenantId?: string;
  tenantType?: TenantType;
  /** Clinic/hospital location for distance calculation on booking */
  clinicLatitude?: number;
  clinicLongitude?: number;
  clinicAddress?: string;
  createdByDoctorId?: Types.ObjectId;
  availabilityStatus?: AvailabilityStatus;
  unavailableReason?: string;
  unavailableUntil?: Date;
  resetOtpHash?: string;
  resetOtpExpiresAt?: Date;
  approvalStatus?: ApprovalStatus;
  /** Max portal/online bookings per calendar day (IST); unset or ≤0 = unlimited */
  dailyOnlineAppointmentLimit?: number;
  /** Max walk-in / clinic-registered visits per calendar day (IST); unset or ≤0 = unlimited */
  dailyWalkInAppointmentLimit?: number;
  /** Public profile (landing page, bot). Department id from constants/departments. */
  department?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  previousHospital?: string;
  bio?: string;
  /** Shown first on the landing page when true; then displayOrder, then experience. */
  isFeatured?: boolean;
  displayOrder?: number;
  /** Compressed profile photo; excluded from queries unless selected with +profilePhoto. */
  profilePhoto?: { data: Buffer; contentType: string };
  photoUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["DOCTOR", "ASSISTANT", "LAB_ASSISTANT", "LAB_MANAGER", "PHARMACY"],
      default: "DOCTOR",
      required: true
    },
    status: {
      type: Boolean,
      default: false,
      required: true
    },
    tenantId: { type: String, index: true },
    tenantType: {
      type: String,
      enum: ["CLINIC", "PHARMACY", "LAB"],
    },
    clinicLatitude: { type: Number },
    clinicLongitude: { type: Number },
    clinicAddress: { type: String },
    createdByDoctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor"
    },
    availabilityStatus: {
      type: String,
      enum: ["available", "unavailable", "busy"],
      default: "available"
    },
    unavailableReason: { type: String },
    unavailableUntil: { type: Date },
    resetOtpHash: {
      type: String
    },
    resetOtpExpiresAt: {
      type: Date
    },
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
      required: true
    },
    dailyOnlineAppointmentLimit: { type: Number, min: 0 },
    dailyWalkInAppointmentLimit: { type: Number, min: 0 },
    department: { type: String, trim: true },
    specialization: { type: String, trim: true },
    qualification: { type: String, trim: true },
    experienceYears: { type: Number, min: 0, max: 80 },
    previousHospital: { type: String, trim: true },
    bio: { type: String, trim: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number },
    profilePhoto: {
      type: new Schema(
        {
          data: { type: Buffer, required: true },
          contentType: { type: String, required: true }
        },
        { _id: false }
      ),
      select: false
    },
    photoUpdatedAt: { type: Date }
  },
  { timestamps: true }
);

DoctorSchema.plugin(tenantPlugin);
DoctorSchema.index({ tenantId: 1, role: 1 });
DoctorSchema.index({ tenantId: 1, email: 1 });

export const Doctor = mongoose.model<IDoctor>("Doctor", DoctorSchema);

