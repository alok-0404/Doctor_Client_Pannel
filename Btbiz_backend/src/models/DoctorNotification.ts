import mongoose, { Document, Schema, Types } from "mongoose";

export type NotificationStatus = "unread" | "dismissed" | "read";
export type NotificationSource = "ASSISTANT_REFERRAL" | "ONLINE_APPOINTMENT";

export interface IDoctorNotification extends Document {
  doctor: Types.ObjectId;
  patient: Types.ObjectId;
  patientName: string;
  visit: Types.ObjectId;
  status: NotificationStatus;
  source: NotificationSource;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorNotificationSchema = new Schema<IDoctorNotification>(
  {
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    patientName: { type: String, required: true },
    visit: {
      type: Schema.Types.ObjectId,
      ref: "Visit",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["unread", "dismissed", "read"],
      default: "unread",
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: ["ASSISTANT_REFERRAL", "ONLINE_APPOINTMENT"],
      default: "ASSISTANT_REFERRAL",
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

export const DoctorNotification = mongoose.model<IDoctorNotification>(
  "DoctorNotification",
  DoctorNotificationSchema
);
