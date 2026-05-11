import mongoose, { Document, Schema, Types } from "mongoose";

import { PatientId } from "./Patient";

export interface IPatientDocument extends Document {
  patient: PatientId;
  uploadedBy?: Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  fileData?: Buffer;
  /**
   * Optional OCR text extracted from the document (if OCR runs).
   */
  ocrText?: string;
  /**
   * Optional confidence score (0-1) from OCR engine.
   */
  ocrConfidence?: number;
  /**
   * Staff uploads stay hidden from the patient app / lab-pharmacy secure preview
   * until clinic marks the document verified for release (`PUBLISHED`).
   */
  patientPublishStatus?: "PENDING_ASSISTANT" | "PUBLISHED";
  /** After assistant verification — drives lab/pharmacy secure preview when present */
  verifiedExtract?: {
    medicines: Array<{ medicineName: string; dosage?: string; quantity?: string; notes?: string }>;
    tests: Array<{ testName: string; notes?: string }>;
    clinicalNotes?: string;
    importantNotes?: string;
  };
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  createdAt: Date;
}

const PatientDocumentSchema = new Schema<IPatientDocument>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      index: true
    },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    fileData: { type: Buffer },
    ocrText: { type: String },
    ocrConfidence: { type: Number },
    patientPublishStatus: {
      type: String,
      enum: ["PENDING_ASSISTANT", "PUBLISHED"],
      default: "PUBLISHED"
    },
    verifiedExtract: { type: Schema.Types.Mixed },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "Doctor" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PatientDocument = mongoose.model<IPatientDocument>(
  "PatientDocument",
  PatientDocumentSchema
);

