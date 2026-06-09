import { Router } from "express";
import mongoose from "mongoose";

import { authenticateDoctor } from "../middleware/authMiddleware";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { Doctor } from "../models/Doctor";
import { PatientMedicineRequest } from "../models/PatientMedicineRequest";
import { PatientTestRequest } from "../models/PatientTestRequest";
import { Visit } from "../models/Visit";

type OrderRequestStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";

/** Lab/pharmacy list groups multiple DB rows; status must reflect the whole batch. */
function aggregateGroupedOrderStatus(statuses: OrderRequestStatus[]): OrderRequestStatus {
  if (!statuses.length) return "PENDING";
  if (statuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (statuses.every((s) => s === "COMPLETED")) return "COMPLETED";
  const active = statuses.filter((s) => s !== "CANCELLED" && s !== "COMPLETED");
  if (active.some((s) => s === "ACCEPTED")) return "ACCEPTED";
  if (active.some((s) => s === "PENDING")) return "PENDING";
  return active[0] ?? "PENDING";
}

function aggregateGroupedPaymentStatus(statuses: Array<"PENDING" | "PAID">): "PENDING" | "PAID" {
  if (statuses.length > 0 && statuses.every((s) => s === "PAID")) return "PAID";
  return "PENDING";
}

function normalizeLabTestName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function labTestNamesMatch(a: string, b: string): boolean {
  const na = normalizeLabTestName(a);
  const nb = normalizeLabTestName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

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

    const grouped = new Map<string, any>();
    for (const r of requests as any[]) {
      const key = (r.requestGroupId && String(r.requestGroupId).trim()) || r._id.toString();
      const medicineName = String(r.medicineName || "").trim();
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          requestGroupId: r.requestGroupId ? String(r.requestGroupId) : undefined,
          patientId: r.patient?._id?.toString(),
          patientName: [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(" ") || "Patient",
          patientMobile: r.patient?.mobileNumber ?? "",
          medicineNames: medicineName ? [medicineName] : [],
          medicines: medicineName
            ? [{ medicineName, dosage: r.dosage, quantity: r.quantity, notes: r.notes }]
            : [],
          notes: r.notes,
          serviceType: r.serviceType,
          paymentMode: r.paymentMode,
          paymentStatus: r.paymentStatus,
          status: r.status,
          rowStatuses: [r.status as OrderRequestStatus],
          rowPaymentStatuses: [r.paymentStatus as "PENDING" | "PAID"],
          expectedFulfillmentMinutes: r.expectedFulfillmentMinutes,
          fulfilledAt: r.fulfilledAt,
          receiptNumber: r.receiptNumber,
          paidAt: r.paidAt,
          preferredProviderId: r.preferredProvider?._id?.toString?.(),
          preferredProviderName: r.preferredProvider?.name,
          isSubstitute: !!r.isSubstitute,
          substituteMedicineName: r.substituteMedicineName,
          substituteNotes: r.substituteNotes,
          createdAt: r.createdAt,
        });
      } else {
        const g = grouped.get(key);
        if (medicineName && !g.medicineNames.includes(medicineName)) g.medicineNames.push(medicineName);
        if (medicineName) {
          g.medicines.push({
            medicineName,
            dosage: r.dosage,
            quantity: r.quantity,
            notes: r.notes,
          });
        }
        g.rowStatuses.push(r.status as OrderRequestStatus);
        g.rowPaymentStatuses.push(r.paymentStatus as "PENDING" | "PAID");
        g.status = aggregateGroupedOrderStatus(g.rowStatuses);
        g.paymentStatus = aggregateGroupedPaymentStatus(g.rowPaymentStatuses);
      }
    }

    const mapped = Array.from(grouped.values()).map((g) => {
      const { rowStatuses: _rs, rowPaymentStatuses: _rp, ...rest } = g;
      return {
        ...rest,
        medicineName: g.medicineNames.join(", "),
      };
    });

    res.status(200).json({ requests: mapped });
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
    const body = req.body as {
      status?: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
      paymentStatus?: "PENDING" | "PAID";
      expectedFulfillmentMinutes?: number;
      receiptNumber?: string;
      paidAt?: string;
      subtotal?: number;
      totalDiscount?: number;
      totalAmount?: number;
      paidAmount?: number;
      isSubstitute?: boolean;
      substituteMedicineName?: string;
      substituteNotes?: string;
    };

    const update: Record<string, unknown> = {};
    if (body.status) update.status = body.status;
    if (body.paymentStatus) update.paymentStatus = body.paymentStatus;
    if (typeof body.expectedFulfillmentMinutes === "number" && body.expectedFulfillmentMinutes > 0) {
      update.expectedFulfillmentMinutes = Math.round(body.expectedFulfillmentMinutes);
    }
    if (typeof body.receiptNumber === "string" && body.receiptNumber.trim()) {
      update.receiptNumber = body.receiptNumber.trim();
    }
    if (typeof body.paidAt === "string" && body.paidAt.trim()) {
      const dt = new Date(body.paidAt);
      if (!Number.isNaN(dt.getTime())) update.paidAt = dt;
    }
    if (typeof body.subtotal === "number" && body.subtotal >= 0) {
      update.subtotal = body.subtotal;
    }
    if (typeof body.totalDiscount === "number" && body.totalDiscount >= 0) {
      update.totalDiscount = body.totalDiscount;
    }
    if (typeof body.totalAmount === "number" && body.totalAmount >= 0) {
      update.totalAmount = body.totalAmount;
    }
    if (typeof body.paidAmount === "number" && body.paidAmount >= 0) {
      update.paidAmount = body.paidAmount;
    }
    if (typeof body.isSubstitute === "boolean") {
      update.isSubstitute = body.isSubstitute;
      if (!body.isSubstitute) {
        update.substituteMedicineName = undefined;
        update.substituteNotes = undefined;
      }
    }
    if (typeof body.substituteMedicineName === "string") {
      update.substituteMedicineName = body.substituteMedicineName.trim();
      update.isSubstitute = body.substituteMedicineName.trim().length > 0;
    }
    if (typeof body.substituteNotes === "string") {
      update.substituteNotes = body.substituteNotes.trim();
    }
    if (body.status === "COMPLETED") {
      update.fulfilledAt = new Date();
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    if (mongoose.Types.ObjectId.isValid(requestId)) {
      const existing = await PatientMedicineRequest.findById(requestId).lean();
      if (existing) {
        if (body.paymentStatus === "PAID" && (existing as any).paymentStatus !== "PAID") {
          update.paidAt = new Date();
          if (!(existing as any).receiptNumber) {
            const suffix = requestId.toString().slice(-6).toUpperCase();
            update.receiptNumber = `MED-${suffix}-${Date.now().toString(36).toUpperCase()}`;
          }
        }
        const groupId = (existing as any).requestGroupId
          ? String((existing as any).requestGroupId).trim()
          : "";
        if (groupId) {
          await PatientMedicineRequest.updateMany({ requestGroupId: groupId }, { $set: update });
        } else {
          await PatientMedicineRequest.findByIdAndUpdate(requestId, { $set: update });
        }
        res.status(200).json({ message: "Medicine request updated" });
        return;
      }
    }

    // grouped request id (requestGroupId): update all medicine rows in that batch together
    if (!String(requestId || "").trim()) {
      res.status(400).json({ message: "Invalid request id" });
      return;
    }
    const groupRows = await PatientMedicineRequest.find({ requestGroupId: requestId })
      .select("_id paymentStatus")
      .lean();
    if (!groupRows.length) {
      res.status(404).json({ message: "Medicine request group not found" });
      return;
    }

    if (body.paymentStatus === "PAID") {
      const anyNotPaid = groupRows.some((r: any) => r.paymentStatus !== "PAID");
      if (anyNotPaid) {
        update.paidAt = new Date();
        const suffix = requestId.slice(-6).toUpperCase();
        update.receiptNumber = `MED-${suffix}-${Date.now().toString(36).toUpperCase()}`;
      }
    }

    const medGroupResult = await PatientMedicineRequest.updateMany(
      { requestGroupId: requestId },
      { $set: update }
    );
    if (medGroupResult.matchedCount === 0) {
      res.status(404).json({ message: "Medicine request not found" });
      return;
    }
    res.status(200).json({ message: "Medicine request group updated" });
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
          rowStatuses: [r.status as OrderRequestStatus],
          rowPaymentStatuses: [r.paymentStatus as "PENDING" | "PAID"],
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
        g.rowStatuses.push(r.status as OrderRequestStatus);
        g.rowPaymentStatuses.push(r.paymentStatus as "PENDING" | "PAID");
        g.status = aggregateGroupedOrderStatus(g.rowStatuses);
        g.paymentStatus = aggregateGroupedPaymentStatus(g.rowPaymentStatuses);
      }
    }

    const mapped = Array.from(grouped.values()).map((g) => {
      const { rowStatuses: _rs, rowPaymentStatuses: _rp, ...rest } = g;
      return {
        ...rest,
        testName: g.testNames.join(", "),
      };
    });

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

    const applyPaidFieldsForLabGroup = (groupKey: string, rows: Array<{ paymentStatus?: string }>) => {
      if (body.paymentStatus !== "PAID") return;
      const anyNotPaid = rows.some((r) => r.paymentStatus !== "PAID");
      if (anyNotPaid) {
        update.paidAt = new Date();
        const suffix = groupKey.replace(/^grp_/, "").slice(-6).toUpperCase();
        update.receiptNumber = `LAB-${suffix}-${Date.now().toString(36).toUpperCase()}`;
      }
    };

    if (mongoose.Types.ObjectId.isValid(requestId)) {
      const existing = await PatientTestRequest.findById(requestId).lean();
      if (existing) {
        const groupId = (existing as any).requestGroupId
          ? String((existing as any).requestGroupId).trim()
          : "";
        if (groupId) {
          const groupRows = await PatientTestRequest.find({ requestGroupId: groupId })
            .select("_id paymentStatus")
            .lean();
          applyPaidFieldsForLabGroup(groupId, groupRows as any[]);
          const result = await PatientTestRequest.updateMany({ requestGroupId: groupId }, { $set: update });
          if (result.matchedCount === 0) {
            res.status(404).json({ message: "Test request group not found" });
            return;
          }
        } else {
          if (body.paymentStatus === "PAID" && (existing as any).paymentStatus !== "PAID") {
            update.paidAt = new Date();
            if (!(existing as any).receiptNumber) {
              const suffix = requestId.toString().slice(-6).toUpperCase();
              update.receiptNumber = `LAB-${suffix}-${Date.now().toString(36).toUpperCase()}`;
            }
          }
          await PatientTestRequest.findByIdAndUpdate(requestId, { $set: update });
        }
        res.status(200).json({ message: "Test request updated" });
        return;
      }
    }

    // Panel id is often requestGroupId (ObjectId string from bot/portal), not a document _id.
    const groupRows = await PatientTestRequest.find({ requestGroupId: requestId })
      .select("_id paymentStatus")
      .lean();
    if (!groupRows.length) {
      res.status(404).json({ message: "Test request not found" });
      return;
    }

    applyPaidFieldsForLabGroup(requestId, groupRows as any[]);
    await PatientTestRequest.updateMany({ requestGroupId: requestId }, { $set: update });
    res.status(200).json({ message: "Test request group updated" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("update test request error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** Mark payment for clinic-added diagnostic tests (manual lab workflow without an incoming app request). */
router.post("/mark-clinic-diagnostic-paid", async (req, res) => {
  try {
    if (req.doctor?.role !== "LAB_ASSISTANT" && req.doctor?.role !== "LAB_MANAGER") {
      res.status(403).json({ message: "Only lab can mark clinic tests as paid" });
      return;
    }

    const body = req.body as { patientId?: string; visitId?: string; testNames?: string[] };
    const { patientId, visitId, testNames } = body;

    if (!patientId || !visitId || !Array.isArray(testNames) || testNames.length === 0) {
      res.status(400).json({ message: "patientId, visitId, and testNames are required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(visitId)) {
      res.status(400).json({ message: "Invalid patientId or visitId" });
      return;
    }

    const visit = await Visit.findById(visitId).lean();
    if (!visit) {
      res.status(404).json({ message: "Visit not found" });
      return;
    }
    if (visit.patient.toString() !== patientId) {
      res.status(400).json({ message: "Visit does not belong to this patient" });
      return;
    }

    const diagnosticTests = await DiagnosticTest.find({ visit: visitId }).lean();
    const errors: string[] = [];
    const toProcess: Array<{ testName: string; price: number }> = [];

    for (const rawName of testNames) {
      const name = String(rawName ?? "").trim();
      if (!name) continue;
      const dt = diagnosticTests.find((t) => labTestNamesMatch(String((t as any).testName ?? ""), name));
      if (!dt) {
        errors.push(`"${name}" is not on this visit.`);
        continue;
      }
      const price = (dt as any).price;
      if (price == null || Number(price) <= 0) {
        errors.push(`Rate (₹) missing for "${(dt as any).testName}". Save rates first.`);
        continue;
      }
      if (!(dt as any).reportPath) {
        errors.push(`Report missing for "${(dt as any).testName}". Upload report first.`);
        continue;
      }
      toProcess.push({ testName: String((dt as any).testName), price: Number(price) });
    }

    if (errors.length > 0) {
      res.status(400).json({ message: errors.join(" ") });
      return;
    }
    if (toProcess.length === 0) {
      res.status(400).json({ message: "No valid tests to mark paid." });
      return;
    }

    const providerIds: mongoose.Types.ObjectId[] = [req.doctor._id];
    if (req.doctor.role === "LAB_ASSISTANT") {
      const assistant = await Doctor.findById(req.doctor._id).select("createdByDoctorId").lean();
      const parentLabId = (assistant as any)?.createdByDoctorId;
      if (parentLabId) providerIds.push(parentLabId);
    }
    const labProviderId = providerIds[providerIds.length - 1];

    const existingRequests = await PatientTestRequest.find({ patient: patientId })
      .select("testName paymentStatus status receiptNumber paidAt requestGroupId")
      .lean();

    const requestGroupId = `grp_clinic_${Date.now().toString(36).toUpperCase()}`;
    const paidAt = new Date();
    const suffix = requestGroupId.replace(/^grp_clinic_/, "").slice(-6).toUpperCase();
    const batchReceiptNumber = `LAB-${suffix}-${Date.now().toString(36).toUpperCase()}`;

    let marked = 0;
    let created = 0;

    for (const { testName } of toProcess) {
      const alreadyPaid = existingRequests.find(
        (r) => (r as any).paymentStatus === "PAID" && labTestNamesMatch(String((r as any).testName ?? ""), testName)
      );
      if (alreadyPaid) {
        marked += 1;
        continue;
      }

      const unpaid = existingRequests.find(
        (r) =>
          (r as any).paymentStatus !== "PAID" &&
          !["CANCELLED", "COMPLETED"].includes(String((r as any).status ?? "")) &&
          labTestNamesMatch(String((r as any).testName ?? ""), testName)
      );

      if (unpaid) {
        const update: Record<string, unknown> = {
          paymentStatus: "PAID",
          paidAt,
          preferredProvider: labProviderId,
        };
        if ((unpaid as any).status === "PENDING") {
          update.status = "ACCEPTED";
        }
        if (!(unpaid as any).receiptNumber) {
          update.receiptNumber = batchReceiptNumber;
        }
        await PatientTestRequest.findByIdAndUpdate((unpaid as any)._id, { $set: update });
        marked += 1;
      } else {
        await PatientTestRequest.create({
          patient: patientId,
          preferredProvider: labProviderId,
          requestGroupId,
          testName,
          source: "assistant",
          serviceType: "LAB_VISIT",
          paymentMode: "OFFLINE",
          paymentStatus: "PAID",
          status: "ACCEPTED",
          paidAt,
          receiptNumber: batchReceiptNumber,
        });
        created += 1;
      }
    }

    res.status(200).json({
      message: "Payment recorded",
      marked,
      created,
      receiptNumber: batchReceiptNumber,
      paidAt: paidAt.toISOString(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("mark clinic diagnostic paid error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
