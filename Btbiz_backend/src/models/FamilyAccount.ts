import mongoose, { Document, Schema, Types } from "mongoose";

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

export const FamilyAccount = mongoose.model<IFamilyAccount>(
  "FamilyAccount",
  FamilyAccountSchema
);

export type FamilyAccountId = Types.ObjectId;

