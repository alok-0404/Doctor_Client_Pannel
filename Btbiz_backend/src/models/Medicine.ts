import mongoose, { Document, Schema } from "mongoose";

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

export const Medicine = mongoose.model<IMedicine>("Medicine", MedicineSchema);

