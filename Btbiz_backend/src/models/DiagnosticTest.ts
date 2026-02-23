import mongoose, { Document, Schema } from "mongoose";

export interface IDiagnosticTest extends Document {
  visit: mongoose.Types.ObjectId;
  testName: string;
  /** Rate/price in INR for billing and receipt */
  price?: number;
  result?: string;
  notes?: string;
  reportPath?: string;
  reportFileName?: string;
  reportMimeType?: string;
  reportUploadedAt?: Date;
  createdAt: Date;
}

const DiagnosticTestSchema = new Schema<IDiagnosticTest>(
  {
    visit: {
      type: Schema.Types.ObjectId,
      ref: "Visit",
      required: true,
      index: true
    },
    testName: { type: String, required: true },
    price: { type: Number },
    result: { type: String },
    notes: { type: String },
    reportPath: { type: String },
    reportFileName: { type: String },
    reportMimeType: { type: String },
    reportUploadedAt: { type: Date }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const DiagnosticTest = mongoose.model<IDiagnosticTest>(
  "DiagnosticTest",
  DiagnosticTestSchema
);

