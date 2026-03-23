import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPatient extends Document {
  firstName: string;
  lastName?: string;
  mobileNumber: string;
  dateOfBirth?: Date;
  gender?: "MALE" | "FEMALE" | "OTHER";
  address?: string;
  bloodGroup?: string;
  previousHealthHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String },
    mobileNumber: {
      type: String,
      required: true,
      // Allow multiple patients to share the same mobile number so that
      // a single primary phone can be used for multiple family members.
      // We keep the index for faster lookups by mobile.
      index: true
    },
    dateOfBirth: { type: Date },
    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER"]
    },
    address: { type: String },
    bloodGroup: { type: String },
    previousHealthHistory: { type: String },
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String }
  },
  { timestamps: true }
);

export const Patient = mongoose.model<IPatient>("Patient", PatientSchema);

export type PatientId = Types.ObjectId;

