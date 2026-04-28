import { Router } from "express";
import mongoose from "mongoose";

import { authenticateDoctor } from "../middleware/authMiddleware";
import { Doctor } from "../models/Doctor";
import { PatientMedicineRequest } from "../models/PatientMedicineRequest";
import { PatientTestRequest } from "../models/PatientTestRequest";

const router = Router();

router.use(authenticateDoctor);

router.get("/medicine-requests", async (req, res) => {
  try {
    if (req.doctor?.role !== "PHARMACY") {
      res.status(403).json({ message: "Only pharmacy can view medicine requests" });
      return;
    }

    const requests = await PatientMedicineRequest.find({
      $or: [
        { preferredProvider: { $exists: false } },
        { preferredProvider: null },
        { preferredProvider: req.doctor._id },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("patient", "firstName lastName mobileNumber")
      .populate("preferredProvider", "name")
      .lean();

    res.status(200).json({
      requests: requests.map((r: any) => ({
        id: r._id.toString(),
        patientId: r.patient?._id?.toString(),
        patientName: [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(" ") || "Patient",
        patientMobile: r.patient?.mobileNumber ?? "",
        medicineName: r.medicineName,
        dosage: r.dosage,
        quantity: r.quantity,
        notes: r.notes,
        serviceType: r.serviceType,
        paymentMode: r.paymentMode,
        paymentStatus: r.paymentStatus,
        status: r.status,
        expectedFulfillmentMinutes: r.expectedFulfillmentMinutes,
        fulfilledAt: r.fulfilledAt,
        receiptNumber: r.receiptNumber,
        paidAt: r.paidAt,
        preferredProviderId: r.preferredProvider?._id?.toString?.(),
        preferredProviderName: r.preferredProvider?.name,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("get medicine requests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/medicine-requests/:requestId", async (req, res) => {
  try {
    if (req.doctor?.role !== "PHARMACY") {
      res.status(403).json({ message: "Only pharmacy can update medicine requests" });
      return;
    }
    const { requestId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      res.status(400).json({ message: "Invalid request id" });
      return;
    }
    const body = req.body as {
      status?: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
      paymentStatus?: "PENDING" | "PAID";
      expectedFulfillmentMinutes?: number;
    };

    const update: Record<string, unknown> = {};
    if (body.status) update.status = body.status;
    if (body.paymentStatus) update.paymentStatus = body.paymentStatus;
    if (typeof body.expectedFulfillmentMinutes === "number" && body.expectedFulfillmentMinutes > 0) {
      update.expectedFulfillmentMinutes = Math.round(body.expectedFulfillmentMinutes);
    }
    if (body.status === "COMPLETED") {
      update.fulfilledAt = new Date();
    }

    const existing = await PatientMedicineRequest.findById(requestId).lean();
    if (body.paymentStatus === "PAID" && existing && (existing as any).paymentStatus !== "PAID") {
      update.paidAt = new Date();
      if (!(existing as any).receiptNumber) {
        const suffix = requestId.toString().slice(-6).toUpperCase();
        update.receiptNumber = `MED-${suffix}-${Date.now().toString(36).toUpperCase()}`;
      }
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    await PatientMedicineRequest.findByIdAndUpdate(requestId, { $set: update });
    res.status(200).json({ message: "Medicine request updated" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("update medicine request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/test-requests", async (req, res) => {
  try {
    if (req.doctor?.role !== "LAB_ASSISTANT" && req.doctor?.role !== "LAB_MANAGER") {
      res.status(403).json({ message: "Only lab can view test requests" });
      return;
    }

    const providerIds = [req.doctor._id];
    if (req.doctor.role === "LAB_ASSISTANT") {
      const assistant = await Doctor.findById(req.doctor._id)
        .select("createdByDoctorId")
        .lean();
      const parentLabId = (assistant as any)?.createdByDoctorId?.toString?.();
      if (parentLabId) providerIds.push(parentLabId);
    }

    const requests = await PatientTestRequest.find({
      $or: [
        { preferredProvider: { $exists: false } },
        { preferredProvider: null },
        { preferredProvider: { $in: providerIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("patient", "firstName lastName mobileNumber")
      .populate("preferredProvider", "name")
      .lean();

    const grouped = new Map<string, any>();
    for (const r of requests as any[]) {
      const key = (r.requestGroupId && String(r.requestGroupId).trim()) || r._id.toString();
      const testName = String(r.testName || "").trim();
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          requestGroupId: r.requestGroupId ? String(r.requestGroupId) : undefined,
          patientId: r.patient?._id?.toString(),
          patientName: [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(" ") || "Patient",
          patientMobile: r.patient?.mobileNumber ?? "",
          testNames: testName ? [testName] : [],
          notes: r.notes,
          serviceType: r.serviceType,
          paymentMode: r.paymentMode,
          paymentStatus: r.paymentStatus,
          status: r.status,
          preferredDateTime: r.preferredDateTime,
          expectedFulfillmentMinutes: r.expectedFulfillmentMinutes,
          fulfilledAt: r.fulfilledAt,
          receiptNumber: r.receiptNumber,
          paidAt: r.paidAt,
          preferredProviderId: r.preferredProvider?._id?.toString?.(),
          preferredProviderName: r.preferredProvider?.name,
          createdAt: r.createdAt,
        });
      } else {
        const g = grouped.get(key);
        if (testName && !g.testNames.includes(testName)) g.testNames.push(testName);
      }
    }

    const mapped = Array.from(grouped.values()).map((g) => ({
      ...g,
      testName: g.testNames.join(", "),
    }));

    res.status(200).json({ requests: mapped });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("get test requests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/test-requests/:requestId", async (req, res) => {
  try {
    if (req.doctor?.role !== "LAB_ASSISTANT" && req.doctor?.role !== "LAB_MANAGER") {
      res.status(403).json({ message: "Only lab can update test requests" });
      return;
    }
    const { requestId } = req.params;
    const body = req.body as {
      status?: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
      paymentStatus?: "PENDING" | "PAID";
      expectedFulfillmentMinutes?: number;
    };

    const update: Record<string, unknown> = {};
    if (body.status) update.status = body.status;
    if (body.paymentStatus) update.paymentStatus = body.paymentStatus;
    if (typeof body.expectedFulfillmentMinutes === "number" && body.expectedFulfillmentMinutes > 0) {
      update.expectedFulfillmentMinutes = Math.round(body.expectedFulfillmentMinutes);
    }
    if (body.status === "COMPLETED") {
      update.fulfilledAt = new Date();
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    if (mongoose.Types.ObjectId.isValid(requestId)) {
      const existing = await PatientTestRequest.findById(requestId).lean();
      if (body.paymentStatus === "PAID" && existing && (existing as any).paymentStatus !== "PAID") {
        update.paidAt = new Date();
        if (!(existing as any).receiptNumber) {
          const suffix = requestId.toString().slice(-6).toUpperCase();
          update.receiptNumber = `LAB-${suffix}-${Date.now().toString(36).toUpperCase()}`;
        }
      }
      await PatientTestRequest.findByIdAndUpdate(requestId, { $set: update });
      res.status(200).json({ message: "Test request updated" });
      return;
    }

    // grouped request id (e.g. grp_xxx): update all test rows in that batch together
    const groupRows = await PatientTestRequest.find({ requestGroupId: requestId }).select("_id paymentStatus").lean();
    if (!groupRows.length) {
      res.status(404).json({ message: "Test request group not found" });
      return;
    }

    if (body.paymentStatus === "PAID") {
      const anyNotPaid = groupRows.some((r: any) => r.paymentStatus !== "PAID");
      if (anyNotPaid) {
        update.paidAt = new Date();
        const suffix = requestId.replace(/^grp_/, "").slice(-6).toUpperCase();
        update.receiptNumber = `LAB-${suffix}-${Date.now().toString(36).toUpperCase()}`;
      }
    }

    await PatientTestRequest.updateMany({ requestGroupId: requestId }, { $set: update });
    res.status(200).json({ message: "Test request group updated" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("update test request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
