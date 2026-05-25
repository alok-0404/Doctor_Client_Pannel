import mongoose, { Document, Schema } from "mongoose";

export type TenantType = "CLINIC" | "PHARMACY" | "LAB";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "TRIAL";

export interface ITenant extends Omit<Document, "_id"> {
  _id: string;
  tenantType: TenantType;
  name: string;
  slug: string;
  ownerUserId?: string;
  phone?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  whatsappNumber?: string;
  subscription: {
    plan: string;
    status: string;
    trialEndsAt?: Date;
  };
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    _id: { type: String, required: true },
    tenantType: {
      type: String,
      enum: ["CLINIC", "PHARMACY", "LAB"],
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    ownerUserId: { type: String, index: true },
    phone: { type: String },
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },
    whatsappNumber: { type: String },
    subscription: {
      plan: { type: String, default: "FREE" },
      status: { type: String, default: "ACTIVE" },
      trialEndsAt: { type: Date },
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "TRIAL"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true, _id: false }
);

export const Tenant = mongoose.model<ITenant>("Tenant", TenantSchema);
