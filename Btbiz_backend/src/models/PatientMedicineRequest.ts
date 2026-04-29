import mongoose, { Schema, Types } from "mongoose";

export interface IPatientMedicineRequest {
  patient: Types.ObjectId;
  /** Preferred pharmacy chosen by patient (optional). */
  preferredProvider?: Types.ObjectId;
  medicineName: string;
  dosage?: string;
  quantity?: number;
  notes?: string;
  source: "patient" | "assistant";
  serviceType: "PICKUP" | "HOME_DELIVERY";
  paymentMode: "ONLINE" | "OFFLINE";
  paymentStatus: "PENDING" | "PAID";
  status: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  expectedFulfillmentMinutes?: number;
  fulfilledAt?: Date;
  /** Set when pharmacy marks payment as PAID */
  receiptNumber?: string;
  paidAt?: Date;
  /** Optional bill totals from pharmacy billing flow */
  subtotal?: number;
  totalDiscount?: number;
  totalAmount?: number;
  paidAmount?: number;
  createdAt: Date;
}

const PatientMedicineRequestSchema = new Schema<IPatientMedicineRequest>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    preferredProvider: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      index: true,
    },
    medicineName: { type: String, required: true },
    dosage: { type: String },
    quantity: { type: Number },
    notes: { type: String },
    source: {
      type: String,
      enum: ["patient", "assistant"],
      default: "patient",
    },
    serviceType: {
      type: String,
      enum: ["PICKUP", "HOME_DELIVERY"],
      default: "PICKUP",
    },
    paymentMode: {
      type: String,
      enum: ["ONLINE", "OFFLINE"],
      default: "OFFLINE",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },
    expectedFulfillmentMinutes: { type: Number },
    fulfilledAt: { type: Date },
    receiptNumber: { type: String },
    paidAt: { type: Date },
    subtotal: { type: Number },
    totalDiscount: { type: Number },
    totalAmount: { type: Number },
    paidAmount: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PatientMedicineRequest = mongoose.model<IPatientMedicineRequest>(
  "PatientMedicineRequest",
  PatientMedicineRequestSchema
);
