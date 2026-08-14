import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsEventType =
  | "user.login"
  | "appointment.created"
  | "lab.order.created"
  | "pharmacy.order.created"
  | "payment.marked_paid"
  | "api.error";

export interface IAnalyticsEvent extends Document {
  eventType: AnalyticsEventType;
  success: boolean;
  actorRole?: string;
  userId?: string;
  tenantId?: string;
  route?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
      enum: [
        "user.login",
        "appointment.created",
        "lab.order.created",
        "pharmacy.order.created",
        "payment.marked_paid",
        "api.error",
      ],
    },
    success: { type: Boolean, default: true, index: true },
    actorRole: { type: String, index: true },
    userId: { type: String, index: true },
    tenantId: { type: String, index: true },
    route: { type: String },
    durationMs: { type: Number },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnalyticsEventSchema.index({ eventType: 1, createdAt: -1 });
AnalyticsEventSchema.index({ createdAt: -1 });

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>(
  "AnalyticsEvent",
  AnalyticsEventSchema
);
