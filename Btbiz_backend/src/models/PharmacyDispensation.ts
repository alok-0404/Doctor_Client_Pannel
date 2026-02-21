import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPharmacyDispensationItem {
  medicineName: string;
  mrp: number;
  discount: number;
  quantity: number;
  amount: number;
}

export interface IPharmacyDispensation extends Document {
  patient: Types.ObjectId;
  dispensedBy: Types.ObjectId;
  items: IPharmacyDispensationItem[];
  subtotal: number;
  totalDiscount: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt?: Date;
  receiptNumber?: string;
  createdAt: Date;
}

const PharmacyDispensationItemSchema = new Schema<IPharmacyDispensationItem>(
  {
    medicineName: { type: String, required: true },
    mrp: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    quantity: { type: Number, required: true, default: 1 },
    amount: { type: Number, required: true }
  },
  { _id: false }
);

const PharmacyDispensationSchema = new Schema<IPharmacyDispensation>(
  {
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    dispensedBy: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    items: { type: [PharmacyDispensationItemSchema], required: true, default: [] },
    subtotal: { type: Number, required: true, default: 0 },
    totalDiscount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID"
    },
    paidAt: { type: Date },
    receiptNumber: { type: String, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PharmacyDispensation = mongoose.model<IPharmacyDispensation>(
  "PharmacyDispensation",
  PharmacyDispensationSchema
);
