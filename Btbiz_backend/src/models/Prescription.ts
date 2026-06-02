import mongoose, { Document, Schema } from "mongoose";

import { tenantPlugin } from "../tenant/tenantPlugin";

export interface IPrescription extends Document {
  visit: mongoose.Types.ObjectId;
  medicines: mongoose.Types.ObjectId[];
  notes?: string;
  createdAt: Date;
}

const PrescriptionSchema = new Schema<IPrescription>(
  {
    visit: {
      type: Schema.Types.ObjectId,
      ref: "Visit",
      required: true,
      index: true
    },
    medicines: [
      {
        type: Schema.Types.ObjectId,
        ref: "Medicine",
        required: true
      }
    ],
    notes: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PrescriptionSchema.plugin(tenantPlugin);
PrescriptionSchema.index({ tenantId: 1, visit: 1 });

export const Prescription = mongoose.model<IPrescription>(
  "Prescription",
  PrescriptionSchema
);

