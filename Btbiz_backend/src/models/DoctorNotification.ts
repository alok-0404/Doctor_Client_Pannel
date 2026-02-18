import mongoose, { Document, Schema, Types } from "mongoose";

export type NotificationStatus = "unread" | "dismissed" | "read";

export interface IDoctorNotification extends Document {
  doctor: Types.ObjectId;
  patient: Types.ObjectId;
  patientName: string;
  visit: Types.ObjectId;
  status: NotificationStatus;
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
    }
  },
  { timestamps: true }
);

export const DoctorNotification = mongoose.model<IDoctorNotification>(
  "DoctorNotification",
  DoctorNotificationSchema
);
