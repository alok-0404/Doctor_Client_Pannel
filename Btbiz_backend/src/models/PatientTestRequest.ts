import mongoose, { Schema, Types } from "mongoose";

export interface IPatientTestRequest {
  patient: Types.ObjectId;
  /** Preferred lab chosen by patient (optional). */
  preferredProvider?: Types.ObjectId;
  /** Optional batch id to group multiple tests from one request action */
  requestGroupId?: string;
  testName: string;
  notes?: string;
  source: "patient" | "assistant";
  serviceType: "LAB_VISIT" | "HOME_SERVICE";
  paymentMode: "ONLINE" | "OFFLINE";
  paymentStatus: "PENDING" | "PAID";
  status: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
  preferredDateTime?: Date;
  expectedFulfillmentMinutes?: number;
  fulfilledAt?: Date;
  /** Set when lab marks payment as PAID */
  receiptNumber?: string;
  paidAt?: Date;
  createdAt: Date;
}

const PatientTestRequestSchema = new Schema<IPatientTestRequest>(
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
    requestGroupId: { type: String, index: true },
    testName: { type: String, required: true },
    notes: { type: String },
    source: {
      type: String,
      enum: ["patient", "assistant"],
      default: "patient",
    },
    serviceType: {
      type: String,
      enum: ["LAB_VISIT", "HOME_SERVICE"],
      default: "LAB_VISIT",
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
    preferredDateTime: { type: Date },
    expectedFulfillmentMinutes: { type: Number },
    fulfilledAt: { type: Date },
    receiptNumber: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PatientTestRequest = mongoose.model<IPatientTestRequest>(
  "PatientTestRequest",
  PatientTestRequestSchema
);
