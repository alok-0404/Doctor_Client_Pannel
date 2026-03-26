import mongoose from "mongoose";

export interface IPatientOtpSession {
  mobile: string;
  otpHash: string;
  expiresAt: Date;
}

const PatientOtpSessionSchema = new mongoose.Schema<IPatientOtpSession>(
  {
    mobile: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index to auto-delete expired sessions
PatientOtpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PatientOtpSession = mongoose.model<IPatientOtpSession>(
  "PatientOtpSession",
  PatientOtpSessionSchema
);
