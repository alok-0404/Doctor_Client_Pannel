import { Request, Response } from "express";
import mongoose from "mongoose";

import { PharmacyDispensation } from "../models/PharmacyDispensation";
import { Patient } from "../models/Patient";

function generateReceiptNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 1000);
  return `RCP-${t}-${r}`;
}

export const createDispensation = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.doctor?.role !== "PHARMACY") {
      res.status(403).json({ message: "Only pharmacy can create dispensation" });
      return;
    }

    const pharmacyId = req.doctor._id?.toString();
    if (!pharmacyId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const body = req.body as {
      patientId?: string;
      items?: Array<{ medicineName: string; mrp: number; discount?: number; quantity?: number }>;
    };

    if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
      res.status(400).json({ message: "Valid patientId is required" });
      return;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      res.status(400).json({ message: "At least one medicine item is required" });
      return;
    }

    const patient = await Patient.findById(body.patientId);
    if (!patient) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    let subtotal = 0;
    const dispensationItems = items.map((it) => {
      const mrp = typeof it.mrp === "number" ? it.mrp : 0;
      const discount = typeof it.discount === "number" && it.discount >= 0 ? it.discount : 0;
      const quantity = typeof it.quantity === "number" && it.quantity >= 1 ? it.quantity : 1;
      const amount = Math.max(0, mrp * quantity - discount);
      subtotal += mrp * quantity;
      return {
        medicineName: typeof it.medicineName === "string" ? it.medicineName.trim() : "Medicine",
        mrp,
        discount,
        quantity,
        amount
      };
    });

    const totalDiscount = dispensationItems.reduce((s, it) => s + it.discount, 0);
    const totalAmount = Math.max(0, subtotal - totalDiscount);

    const doc = await PharmacyDispensation.create({
      patient: patient._id,
      dispensedBy: new mongoose.Types.ObjectId(pharmacyId),
      items: dispensationItems,
      subtotal,
      totalDiscount,
      totalAmount,
      paidAmount: 0,
      paymentStatus: "UNPAID",
      receiptNumber: generateReceiptNumber()
    });

    res.status(201).json({
      id: (doc as any)._id.toString(),
      receiptNumber: doc.receiptNumber,
      subtotal: doc.subtotal,
      totalDiscount: doc.totalDiscount,
      totalAmount: doc.totalAmount,
      message: "Dispensation created. Record payment to complete."
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("createDispensation error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const recordPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.doctor?.role !== "PHARMACY") {
      res.status(403).json({ message: "Only pharmacy can record payment" });
      return;
    }

    const { id } = req.params;
    const body = req.body as { paidAmount?: number };

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: "Valid dispensation id is required" });
      return;
    }

    const doc = await PharmacyDispensation.findById(id).lean();
    if (!doc) {
      res.status(404).json({ message: "Dispensation not found" });
      return;
    }

    const totalAmount = (doc as any).totalAmount as number;
    const raw = body.paidAmount;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
        ? parseFloat(raw)
        : NaN;
    // If UI sends 0, omits amount, or invalid — treat as full bill (typical "Mark as paid").
    let paidAmount: number;
    if (!Number.isNaN(parsed) && parsed > 0) {
      paidAmount = parsed;
    } else {
      paidAmount = totalAmount;
    }

    let paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    if (totalAmount <= 0) {
      paymentStatus = "PAID";
      paidAmount = 0;
    } else if (paidAmount >= totalAmount) {
      paymentStatus = "PAID";
    } else if (paidAmount <= 0) {
      paymentStatus = "UNPAID";
    } else {
      paymentStatus = "PARTIAL";
    }

    await PharmacyDispensation.findByIdAndUpdate(id, {
      paidAmount,
      paymentStatus,
      paidAt: new Date()
    });

    res.status(200).json({
      paidAmount,
      paymentStatus,
      message: "Payment recorded"
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("recordPayment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getReceipt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: "Valid dispensation id is required" });
      return;
    }

    const doc = await PharmacyDispensation.findById(id)
      .populate("patient", "firstName lastName mobileNumber")
      .populate("dispensedBy", "name")
      .lean();

    if (!doc) {
      res.status(404).json({ message: "Dispensation not found" });
      return;
    }

    const patient = doc.patient as any;
    const dispensedBy = doc.dispensedBy as any;

    res.status(200).json({
      id: (doc as any)._id.toString(),
      receiptNumber: (doc as any).receiptNumber,
      patient: {
        id: patient?._id?.toString(),
        name: [patient?.firstName, patient?.lastName || ""].join(" ").trim(),
        mobile: patient?.mobileNumber ?? ""
      },
      dispensedBy: dispensedBy?.name ?? "Pharmacy",
      items: (doc as any).items ?? [],
      subtotal: (doc as any).subtotal ?? 0,
      totalDiscount: (doc as any).totalDiscount ?? 0,
      totalAmount: (doc as any).totalAmount ?? 0,
      paidAmount: (doc as any).paidAmount ?? 0,
      paymentStatus: (doc as any).paymentStatus ?? "UNPAID",
      paidAt: (doc as any).paidAt,
      createdAt: (doc as any).createdAt
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getReceipt error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
