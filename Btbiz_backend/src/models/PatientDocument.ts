import mongoose, { Document, Schema, Types } from "mongoose";

import { PatientId } from "./Patient";

export interface IPatientDocument extends Document {
  patient: PatientId;
  uploadedBy?: Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  /**
   * Optional OCR text extracted from the document (if OCR runs).
   */
  ocrText?: string;
  /**
   * Optional confidence score (0-1) from OCR engine.
   */
  ocrConfidence?: number;
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
    ocrText: { type: String },
    ocrConfidence: { type: Number }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PatientDocument = mongoose.model<IPatientDocument>(
  "PatientDocument",
  PatientDocumentSchema
);

