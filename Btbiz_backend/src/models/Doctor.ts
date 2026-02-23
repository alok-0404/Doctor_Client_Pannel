import mongoose, { Document, Schema, Types } from "mongoose";

export type DoctorRole = "DOCTOR" | "ASSISTANT" | "LAB_ASSISTANT" | "LAB_MANAGER" | "PHARMACY";
export type AvailabilityStatus = "available" | "unavailable" | "busy";

export interface IDoctor extends Document {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: DoctorRole;
  status: boolean;
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
    }
  },
  { timestamps: true }
);

export const Doctor = mongoose.model<IDoctor>("Doctor", DoctorSchema);

