import mongoose, { Document, Schema, Types } from "mongoose";

import { tenantPlugin } from "../tenant/tenantPlugin";

export interface IFamilyAccount extends Document {
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

const FamilyAccountSchema = new Schema<IFamilyAccount>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true
    }
  },
  { timestamps: true }
);

FamilyAccountSchema.plugin(tenantPlugin);
FamilyAccountSchema.index({ tenantId: 1, phone: 1 });

export const FamilyAccount = mongoose.model<IFamilyAccount>(
  "FamilyAccount",
  FamilyAccountSchema
);

export type FamilyAccountId = Types.ObjectId;

