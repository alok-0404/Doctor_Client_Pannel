import mongoose, { Document, Schema, Types } from "mongoose";

import { tenantPlugin } from "../tenant/tenantPlugin";
import { FamilyAccountId } from "./FamilyAccount";
import { PatientId } from "./Patient";

export type FamilyRelation =
  | "SELF"
  | "SPOUSE"
  | "SON"
  | "DAUGHTER"
  | "FATHER"
  | "MOTHER"
  | "BROTHER"
  | "SISTER"
  | "OTHER";

export interface IFamilyMember extends Document {
  account: FamilyAccountId;
  patient: PatientId;
  fullName: string;
  relation: FamilyRelation;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FamilyMemberSchema = new Schema<IFamilyMember>(
  {
    account: {
      type: Schema.Types.ObjectId,
      ref: "FamilyAccount",
      required: true,
      index: true
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    fullName: {
      type: String,
      required: true
    },
    relation: {
      type: String,
      required: true,
      enum: [
        "SELF",
        "SPOUSE",
        "SON",
        "DAUGHTER",
        "FATHER",
        "MOTHER",
        "BROTHER",
        "SISTER",
        "OTHER"
      ]
    },
    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER"]
    },
    dateOfBirth: {
      type: Date
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

FamilyMemberSchema.plugin(tenantPlugin);
FamilyMemberSchema.index({ tenantId: 1, account: 1 });

export const FamilyMember = mongoose.model<IFamilyMember>(
  "FamilyMember",
  FamilyMemberSchema
);

export type FamilyMemberId = Types.ObjectId;

