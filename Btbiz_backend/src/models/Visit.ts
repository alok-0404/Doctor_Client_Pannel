import mongoose, { Document, Schema, Types } from "mongoose";

import { PatientId } from "./Patient";

export interface IVisit extends Document {
  patient: PatientId;
  doctor: Types.ObjectId;
  recordedBy?: Types.ObjectId; // assistant who did check-in
  visitDate: Date;
  reason?: string;
  notes?: string;
  // Mandatory vitals (assistant fills before referring to doctor)
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodSugarFasting?: number; // mg/dL
  weightKg?: number;
  temperature?: number; // Celsius
  otherVitalsNotes?: string;
  /** Patient's location at time of booking (with consent) – so doctor can see */
  patientLatitude?: number;
  patientLongitude?: number;
  /** Optional accuracy (meters) for last known patient location. */
  patientLocationAccuracyMeters?: number;
  createdAt: Date;
  updatedAt: Date;
}

const VisitSchema = new Schema<IVisit>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      index: true
    },
    visitDate: {
      type: Date,
      required: true,
      default: () => new Date()
    },
    reason: { type: String },
    notes: { type: String },
    bloodPressureSystolic: { type: Number },
    bloodPressureDiastolic: { type: Number },
    bloodSugarFasting: { type: Number },
    weightKg: { type: Number },
    temperature: { type: Number },
    otherVitalsNotes: { type: String },
    patientLatitude: { type: Number },
    patientLongitude: { type: Number },
    patientLocationAccuracyMeters: { type: Number }
  },
  { timestamps: true }
);

export const Visit = mongoose.model<IVisit>("Visit", VisitSchema);

