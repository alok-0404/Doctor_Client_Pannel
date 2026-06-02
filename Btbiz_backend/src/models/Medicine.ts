import mongoose, { Document, Schema } from "mongoose";

import { tenantPlugin } from "../tenant/tenantPlugin";

export interface IMedicine extends Document {
  name: string;
  dosage?: string;
  frequency?: string;
  route?: string;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    name: { type: String, required: true },
    dosage: { type: String },
    frequency: { type: String },
    route: { type: String }
  },
  { timestamps: false }
);

MedicineSchema.plugin(tenantPlugin);
MedicineSchema.index({ tenantId: 1, name: 1 });

export const Medicine = mongoose.model<IMedicine>("Medicine", MedicineSchema);

