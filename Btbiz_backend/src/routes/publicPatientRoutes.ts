import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer") as any;

import { env } from "../config/env";
import { PatientDocument } from "../models/PatientDocument";
import { PatientMedicineRequest } from "../models/PatientMedicineRequest";
import { PatientTestRequest } from "../models/PatientTestRequest";
import { Patient } from "../models/Patient";
import { Doctor } from "../models/Doctor";
import { authenticatePatient } from "../middleware/authMiddleware";
import ocrService from "../ocrService";
import { getFullPatientHistory } from "../services/patientService";
import {
  sendPatientOtp,
  verifyPatientOtp,
  selectPatientProfile,
} from "../services/patientAuthService";
import { resolveUploadFilePath, uploadFileExists } from "../utils/uploadPath";

const router = Router();
const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

/** e.g. patient request "CBC" vs visit test "Complete Blood Count (CBC)" */
function patientTestNamesMatchForPaymentGate(requestName: string, diagnosticName: string): boolean {
  const a = requestName.toLowerCase().replace(/\s+/g, " ").trim();
  const b = diagnosticName.toLowerCase().replace(/\s+/g, " ").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const paren = /\(([^)]+)\)/.exec(diagnosticName)?.[1]?.trim().toLowerCase();
  if (paren && (a === paren || a.includes(paren) || paren.includes(a))) return true;
  return false;
}

function pickPaidRequestForDiagnosticAccess(
  paidRequests: Array<{ testName?: string; paidAt?: Date; createdAt?: Date }>,
  diagnosticName: string,
  visitDate: Date
): { testName?: string; paidAt?: Date; createdAt?: Date } | null {
  const testName = String(diagnosticName ?? "").trim();
  if (!testName) return null;
  const byName = paidRequests.filter((r) =>
    patientTestNamesMatchForPaymentGate(String(r.testName ?? ""), testName)
  );
  if (!byName.length) return null;
  const visitDayKey = new Date(visitDate).toISOString().slice(0, 10);
  const sameDay = byName.filter((r) => {
    const paidAtKey = r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : null;
    const createdAtKey = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null;
    return (paidAtKey && paidAtKey === visitDayKey) || createdAtKey === visitDayKey;
  });
  if (sameDay.length > 0) return sameDay[0];
  if (byName.length === 1) return byName[0];
  return byName
    .slice()
    .sort((a, b) => {
      const at = new Date(a.paidAt ?? a.createdAt ?? 0).getTime();
      const bt = new Date(b.paidAt ?? b.createdAt ?? 0).getTime();
      return bt - at;
    })[0];
}

function resolveDiagnosticReportPath(storedPath: unknown): string | null {
  const raw = String(storedPath ?? "").trim();
  if (!raw) return null;
  const baseName = path.basename(raw);
  const normalizedRaw = raw.replace(/\\/g, "/");
  const uploadsSuffix = normalizedRaw.includes("/uploads/")
    ? normalizedRaw.slice(normalizedRaw.lastIndexOf("/uploads/") + 1)
    : "";
  const relativeFromUploads = uploadsSuffix.startsWith("uploads/")
    ? uploadsSuffix.replace(/^uploads\//, "")
    : "";
  const candidates = [
    resolveUploadFilePath(raw),
    baseName ? path.resolve(process.cwd(), "uploads", baseName) : "",
    baseName ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", baseName) : "",
    baseName ? path.resolve(__dirname, "../../uploads", baseName) : "",
    uploadsSuffix ? path.resolve(process.cwd(), uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(process.cwd(), "Btbiz_backend", uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(__dirname, "../../", uploadsSuffix) : "",
    relativeFromUploads ? path.resolve(process.cwd(), "uploads", relativeFromUploads) : "",
    relativeFromUploads
      ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", relativeFromUploads)
      : "",
    relativeFromUploads ? path.resolve(__dirname, "../../uploads", relativeFromUploads) : "",
  ].filter(Boolean);
  return candidates.find((p) => uploadFileExists(p)) ?? null;
}

function resolveDocumentFilePath(storedPath: unknown): string | null {
  const raw = String(storedPath ?? "").trim();
  if (!raw) return null;
  const baseName = path.basename(raw);
  const normalizedRaw = raw.replace(/\\/g, "/");
  const uploadsSuffix = normalizedRaw.includes("/uploads/")
    ? normalizedRaw.slice(normalizedRaw.lastIndexOf("/uploads/") + 1)
    : "";
  const relativeFromUploads = uploadsSuffix.startsWith("uploads/")
    ? uploadsSuffix.replace(/^uploads\//, "")
    : "";
  const candidates = [
    resolveUploadFilePath(raw),
    baseName ? path.resolve(process.cwd(), "uploads", baseName) : "",
    baseName ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", baseName) : "",
    baseName ? path.resolve(__dirname, "../../uploads", baseName) : "",
    uploadsSuffix ? path.resolve(process.cwd(), uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(process.cwd(), "Btbiz_backend", uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(__dirname, "../../", uploadsSuffix) : "",
    relativeFromUploads ? path.resolve(process.cwd(), "uploads", relativeFromUploads) : "",
    relativeFromUploads
      ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", relativeFromUploads)
      : "",
    relativeFromUploads ? path.resolve(__dirname, "../../uploads", relativeFromUploads) : "",
  ].filter(Boolean);
  return candidates.find((p) => uploadFileExists(p)) ?? null;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// POST /public/patient/send-otp - send OTP to mobile (patient must exist)
router.post("/send-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile } = req.body as { mobile?: string };
    if (!mobile || typeof mobile !== "string") {
      res.status(400).json({ message: "mobile is required" });
      return;
    }
    await sendPatientOtp(mobile.trim());
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error: any) {
    if (error.message === "NO_PROFILE_FOUND") {
      res.status(404).json({
        message: "No profile found for this mobile. Book an appointment first to create your profile.",
      });
      return;
    }
    if (error.message === "INVALID_MOBILE") {
      res.status(400).json({ message: "Invalid mobile number" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("send-otp error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/patient/verify - verify OTP, return token or selection list
router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile, otp } = req.body as { mobile?: string; otp?: string };
    if (!mobile || !otp) {
      res.status(400).json({ message: "mobile and otp are required" });
      return;
    }
    const result = await verifyPatientOtp(mobile.trim(), otp.trim());
    res.status(200).json(result);
  } catch (error: any) {
    if (error.message === "INVALID_OR_EXPIRED_OTP") {
      res.status(400).json({ message: "Invalid or expired OTP" });
      return;
    }
    if (error.message === "NO_PROFILE_FOUND") {
      res.status(404).json({ message: "No profile found" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("verify error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/patient/select-profile - when multiple patients, select one
router.post("/select-profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const { selectionToken, patientId } = req.body as {
      selectionToken?: string;
      patientId?: string;
    };
    if (!selectionToken || !patientId) {
      res.status(400).json({ message: "selectionToken and patientId are required" });
      return;
    }
    const result = await selectPatientProfile(selectionToken, patientId);
    res.status(200).json(result);
  } catch (error: any) {
    if (
      error.message === "INVALID_OR_EXPIRED_SELECTION" ||
      error.message === "INVALID_SELECTION" ||
      error.message === "PATIENT_NOT_FOUND"
    ) {
      res.status(400).json({ message: "Invalid or expired selection" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("select-profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /public/patient/profile - patient's full profile (auth required)
router.get("/profile", authenticatePatient, async (req: Request, res: Response): Promise<void> => {
  try {
    const patientId = String(req.patient!._id);
    const data = await getFullPatientHistory(patientId);
    res.status(200).json(data);
  } catch (error: any) {
    if (error.message === "PATIENT_NOT_FOUND") {
      res.status(404).json({ message: "Patient not found" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /public/patient/providers?kind=pharmacy|lab&lat=&lng=
// Returns available tied-up providers for patient selection.
router.get(
  "/providers",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const kind = String(req.query.kind ?? "").toLowerCase();
      if (kind !== "pharmacy" && kind !== "lab") {
        res.status(400).json({ message: "kind must be pharmacy or lab" });
        return;
      }

      const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
      const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
      const hasUserCoords =
        typeof lat === "number" &&
        typeof lng === "number" &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng);

      const roles = kind === "pharmacy" ? ["PHARMACY"] : ["LAB_MANAGER"];

      const providers = await Doctor.find({
        role: { $in: roles },
        status: true,
        createdByDoctorId: { $exists: true, $ne: null },
      })
        .select("_id name role clinicLatitude clinicLongitude clinicAddress")
        .lean();

      const mapped = providers.map((p: any) => {
        const providerLat =
          typeof p.clinicLatitude === "number" ? p.clinicLatitude : undefined;
        const providerLng =
          typeof p.clinicLongitude === "number" ? p.clinicLongitude : undefined;
        const distanceKm =
          hasUserCoords &&
          providerLat != null &&
          providerLng != null
            ? haversineKm(lat!, lng!, providerLat, providerLng)
            : undefined;
        return {
          id: p._id.toString(),
          name: p.name,
          role: p.role,
          clinicAddress: p.clinicAddress,
          clinicLatitude: providerLat,
          clinicLongitude: providerLng,
          distanceKm,
        };
      });

      mapped.sort((a, b) => {
        const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      });

      res.status(200).json({ providers: mapped });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("list providers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /public/patient/documents - patient uploads own document
router.post(
  "/documents",
  authenticatePatient,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }
      const patientId = req.patient!._id;

      const doc = await PatientDocument.create({
        patient: patientId,
        uploadedBy: undefined,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
      });

      try {
        const fileMimetype: string | undefined = typeof file.mimetype === "string" ? file.mimetype : undefined;
        const shouldRunOcr = !!fileMimetype && fileMimetype.startsWith("image/");

        if (shouldRunOcr) {
          const ocrResult = await ocrService.extractTextFromImage(file.path);
          if (ocrResult.success && ocrResult.text) {
            doc.ocrText = ocrResult.text;
            doc.ocrConfidence = ocrResult.confidence;
            await doc.save();
          }
        }
      } catch {
        // ignore OCR errors
      }

      res.status(201).json({
        document: {
          id: doc._id.toString(),
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          uploadedAt: doc.createdAt,
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("patient upload document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /public/patient/medicines - patient adds medicine request
// Bot compatibility: when no patient JWT is sent, accept patientId payload.
router.post(
  "/medicines",
  async (req: Request, res: Response, next): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      next("route");
      return;
    }
    try {
      const body = req.body as {
        patientId?: string;
        familyMemberId?: string;
        medicineName?: string;
        quantity?: number | string;
        dosage?: string;
        notes?: string;
        medicines?: Array<{ medicineName?: string; quantity?: number | string; dosage?: string; notes?: string }>;
        serviceType?: "PICKUP" | "HOME_DELIVERY";
      };
      const patientId = body.patientId ?? body.familyMemberId;
      if (!patientId || !mongoose.isValidObjectId(patientId)) {
        res.status(400).json({ message: "Valid patientId is required" });
        return;
      }
      const patient = await Patient.findById(patientId).select("_id").lean();
      if (!patient) {
        res.status(404).json({ message: "Patient not found for provided patientId/familyMemberId" });
        return;
      }
      const fromArray = Array.isArray(body.medicines) ? body.medicines : [];
      const single = body.medicineName
        ? [{ medicineName: body.medicineName, quantity: body.quantity, dosage: body.dosage, notes: body.notes }]
        : [];
      const rows = [...fromArray, ...single]
        .map((m) => ({
          medicineName: String(m.medicineName ?? "").trim(),
          quantity:
            typeof m.quantity === "number"
              ? m.quantity
              : typeof m.quantity === "string" && m.quantity.trim()
                ? Number(m.quantity)
                : undefined,
          dosage: m.dosage?.trim?.() || undefined,
          notes: m.notes?.trim?.() || undefined,
        }))
        .filter((m) => m.medicineName.length > 0);
      if (!rows.length) {
        res.status(400).json({ message: "At least one medicineName is required" });
        return;
      }
      const requestGroupId = new mongoose.Types.ObjectId().toString();
      const docs = rows.map((m) => ({
        patient: patient._id,
        requestGroupId,
        medicineName: m.medicineName,
        quantity: typeof m.quantity === "number" && Number.isFinite(m.quantity) ? m.quantity : undefined,
        dosage: m.dosage,
        notes: m.notes,
        source: "patient" as const,
        serviceType: body.serviceType === "HOME_DELIVERY" ? "HOME_DELIVERY" : "PICKUP",
        paymentMode: body.serviceType === "HOME_DELIVERY" ? "ONLINE" : "OFFLINE",
      }));
      const created = await PatientMedicineRequest.insertMany(docs);
      res.status(201).json({
        requestId: created[0]?._id?.toString(),
        requestIds: created.map((d) => d._id.toString()),
        medicine: { id: created[0]?._id?.toString(), medicineName: created[0]?.medicineName },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("patient add medicine (bot-compatible) error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/medicines",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        medicineName,
        dosage,
        quantity,
        notes,
        serviceType,
        paymentMode,
        expectedFulfillmentMinutes: rawEta,
        preferredProviderId,
      } = req.body as {
        medicineName?: string;
        dosage?: string;
        quantity?: number;
        notes?: string;
        serviceType?: "PICKUP" | "HOME_DELIVERY";
        paymentMode?: "ONLINE" | "OFFLINE";
        expectedFulfillmentMinutes?: number | string;
        preferredProviderId?: string;
      };
      let expectedFulfillmentMinutes: number | undefined;
      if (typeof rawEta === "number" && !Number.isNaN(rawEta)) {
        expectedFulfillmentMinutes = rawEta;
      } else if (typeof rawEta === "string" && rawEta.trim()) {
        const n = parseInt(rawEta.trim(), 10);
        if (!Number.isNaN(n)) expectedFulfillmentMinutes = n;
      }
      if (!medicineName || typeof medicineName !== "string" || !medicineName.trim()) {
        res.status(400).json({ message: "medicineName is required" });
        return;
      }
      const patientId = req.patient!._id;
      let preferredProvider:
        | mongoose.Types.ObjectId
        | undefined;
      if (preferredProviderId) {
        if (!mongoose.isValidObjectId(preferredProviderId)) {
          res.status(400).json({ message: "Invalid preferredProviderId" });
          return;
        }
        const provider = await Doctor.findById(preferredProviderId)
          .select("role status createdByDoctorId")
          .lean();
        const isTieUp = !!(provider as any)?.createdByDoctorId;
        if (!provider || provider.role !== "PHARMACY" || provider.status !== true || !isTieUp) {
          res.status(400).json({ message: "Selected pharmacy is not available" });
          return;
        }
        preferredProvider = new mongoose.Types.ObjectId(preferredProviderId);
      }

      const createPayload: Record<string, unknown> = {
        patient: patientId,
        medicineName: medicineName.trim(),
        dosage: dosage?.trim?.() || undefined,
        quantity: typeof quantity === "number" ? quantity : undefined,
        notes: notes?.trim?.() || undefined,
        source: "patient",
        serviceType: serviceType === "HOME_DELIVERY" ? "HOME_DELIVERY" : "PICKUP",
        // Rule: Home delivery always takes "Pay online" in this app.
        paymentMode: serviceType === "HOME_DELIVERY" ? "ONLINE" : paymentMode === "ONLINE" ? "ONLINE" : "OFFLINE",
        expectedFulfillmentMinutes:
          typeof expectedFulfillmentMinutes === "number" && expectedFulfillmentMinutes > 0
            ? Math.round(expectedFulfillmentMinutes)
            : undefined,
      };
      if (preferredProvider) {
        createPayload.preferredProvider = preferredProvider;
      }
      const entry = await PatientMedicineRequest.create(createPayload);

      res.status(201).json({
        medicine: {
          id: entry._id.toString(),
          medicineName: entry.medicineName,
          dosage: entry.dosage,
          quantity: entry.quantity,
          notes: entry.notes,
          serviceType: entry.serviceType,
          paymentMode: entry.paymentMode,
          paymentStatus: entry.paymentStatus,
          status: entry.status,
          expectedFulfillmentMinutes: entry.expectedFulfillmentMinutes,
          preferredProviderId: (entry as any).preferredProvider?.toString?.(),
          createdAt: entry.createdAt,
        },
      });
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error("patient add medicine error:", error);
      const err = error as { name?: string; errors?: Record<string, { message?: string }> };
      if (err?.name === "ValidationError" && err.errors) {
        const msg = Object.values(err.errors)
          .map((e) => e.message)
          .filter(Boolean)
          .join(" ");
        res.status(400).json({ message: msg || "Invalid medicine request" });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /public/patient/tests - patient adds test request
// Bot compatibility: when no patient JWT is sent, accept patientId payload.
router.post(
  "/tests",
  async (req: Request, res: Response, next): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      next("route");
      return;
    }
    try {
      const body = req.body as {
        patientId?: string;
        familyMemberId?: string;
        testName?: string;
        notes?: string;
        tests?: Array<{ testName?: string; notes?: string }>;
        serviceType?: "LAB_VISIT" | "HOME_SERVICE" | "HOME_COLLECTION";
        preferredDateTime?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      };
      const patientId = body.patientId ?? body.familyMemberId;
      if (!patientId || !mongoose.isValidObjectId(patientId)) {
        res.status(400).json({ message: "Valid patientId is required" });
        return;
      }
      const patient = await Patient.findById(patientId).select("_id").lean();
      if (!patient) {
        res.status(404).json({ message: "Patient not found for provided patientId/familyMemberId" });
        return;
      }
      const fromArray = Array.isArray(body.tests) ? body.tests : [];
      const single = body.testName ? [{ testName: body.testName, notes: body.notes }] : [];
      const rows = [...fromArray, ...single]
        .map((t) => ({ testName: String(t.testName ?? "").trim(), notes: t.notes?.trim?.() || undefined }))
        .filter((t) => t.testName.length > 0);
      if (!rows.length) {
        res.status(400).json({ message: "At least one testName is required" });
        return;
      }
      const preferredDateTime =
        body.preferredDateTime ||
        (body.scheduledDate && body.scheduledTime ? `${body.scheduledDate}T${body.scheduledTime}` : undefined);
      const requestGroupId = new mongoose.Types.ObjectId().toString();
      const docs = rows.map((t) => ({
        patient: patient._id,
        requestGroupId,
        testName: t.testName,
        notes: t.notes,
        source: "patient" as const,
        serviceType: body.serviceType === "HOME_SERVICE" || body.serviceType === "HOME_COLLECTION" ? "HOME_SERVICE" : "LAB_VISIT",
        paymentMode: "OFFLINE" as const,
        preferredDateTime: preferredDateTime ? new Date(preferredDateTime) : undefined,
      }));
      const created = await PatientTestRequest.insertMany(docs);
      res.status(201).json({
        requestId: created[0]?._id?.toString(),
        requestIds: created.map((d) => d._id.toString()),
        test: { id: created[0]?._id?.toString(), testName: created[0]?.testName },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("patient add test (bot-compatible) error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/tests",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        testName,
        notes,
        serviceType,
        paymentMode,
        preferredDateTime,
        expectedFulfillmentMinutes,
        preferredProviderId,
      } = req.body as {
        testName?: string;
        notes?: string;
        serviceType?: "LAB_VISIT" | "HOME_SERVICE";
        paymentMode?: "ONLINE" | "OFFLINE";
        preferredDateTime?: string;
        expectedFulfillmentMinutes?: number;
        preferredProviderId?: string;
      };
      if (!testName || typeof testName !== "string" || !testName.trim()) {
        res.status(400).json({ message: "testName is required" });
        return;
      }
      const patientId = req.patient!._id;
      let preferredProvider:
        | mongoose.Types.ObjectId
        | undefined;
      if (preferredProviderId) {
        if (!mongoose.isValidObjectId(preferredProviderId)) {
          res.status(400).json({ message: "Invalid preferredProviderId" });
          return;
        }
        const provider = await Doctor.findById(preferredProviderId)
          .select("role status createdByDoctorId")
          .lean();
        const isLabRole = provider?.role === "LAB_MANAGER";
        const isTieUp = !!(provider as any)?.createdByDoctorId;
        if (!provider || !isLabRole || provider.status !== true || !isTieUp) {
          res.status(400).json({ message: "Selected lab is not available" });
          return;
        }
        preferredProvider = new mongoose.Types.ObjectId(preferredProviderId);
      }

      const entry = await PatientTestRequest.create({
        patient: patientId,
        preferredProvider,
        testName: testName.trim(),
        notes: notes?.trim?.() || undefined,
        source: "patient",
        serviceType: serviceType === "HOME_SERVICE" ? "HOME_SERVICE" : "LAB_VISIT",
        paymentMode: paymentMode === "ONLINE" ? "ONLINE" : "OFFLINE",
        preferredDateTime: preferredDateTime ? new Date(preferredDateTime) : undefined,
        expectedFulfillmentMinutes:
          typeof expectedFulfillmentMinutes === "number" && expectedFulfillmentMinutes > 0
            ? Math.round(expectedFulfillmentMinutes)
            : undefined,
      });

      res.status(201).json({
        test: {
          id: entry._id.toString(),
          testName: entry.testName,
          notes: entry.notes,
          serviceType: entry.serviceType,
          paymentMode: entry.paymentMode,
          paymentStatus: entry.paymentStatus,
          status: entry.status,
          preferredDateTime: entry.preferredDateTime,
          expectedFulfillmentMinutes: entry.expectedFulfillmentMinutes,
          preferredProviderId: (entry as any).preferredProvider?.toString?.(),
          createdAt: entry.createdAt,
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("patient add test error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /public/patient/documents/:documentId/file - serve document (patient auth)
// NOTE: Keep this public tokenized route BEFORE the auth route below.
router.get(
  "/documents/:token/file",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      if (!token) {
        res.status(400).json({ message: "token is required" });
        return;
      }
      const decoded = jwt.verify(token, env.jwt.secret) as {
        type?: string;
        patientId?: string;
        documentId?: string;
      };
      if (decoded?.type !== "patient_document") {
        res.status(400).json({ message: "Invalid token type" });
        return;
      }
      const { patientId, documentId } = decoded;
      if (!patientId || !documentId) {
        res.status(400).json({ message: "Invalid token payload" });
        return;
      }
      const doc = await PatientDocument.findOne({
        _id: documentId,
        patient: patientId,
      }).lean();
      if (!doc) {
        res.status(404).json({ message: "Document not found" });
        return;
      }
      const storedPath = String((doc as any).path ?? "").trim();
      const fullPath = resolveDocumentFilePath(storedPath);
      if (!fullPath) {
        if (/^https?:\/\//i.test(storedPath)) {
          res.redirect(storedPath);
          return;
        }
        res.status(404).json({ message: "File not found on server" });
        return;
      }
      const forceDownload = ["1", "true", "yes"].includes(
        String((req.query.download ?? req.query.dl ?? "")).toLowerCase()
      );
      res.setHeader("Content-Type", (doc as any).mimeType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `${forceDownload ? "attachment" : "inline"}; filename="${((doc as any).originalName || "document").replace(/"/g, '\\"')}"`
      );
      res.sendFile(fullPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("public token getDocumentFile error:", error);
      res.status(401).json({ message: "Invalid or expired token" });
    }
  }
);

// GET /public/patient/documents/:documentId/file - serve document (patient auth)
router.get(
  "/documents/:documentId/file",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const patientId = req.patient!._id;

      const doc = await PatientDocument.findOne({
        _id: documentId,
        patient: patientId,
      }).lean();

      if (!doc) {
        res.status(404).json({ message: "Document not found" });
        return;
      }

      const storedPath = String((doc as any).path ?? "").trim();
      const fullPath = resolveDocumentFilePath(storedPath);
      if (!fullPath) {
        if (/^https?:\/\//i.test(storedPath)) {
          res.redirect(storedPath);
          return;
        }
        res.status(404).json({ message: "File not found on server" });
        return;
      }
      const forceDownload = ["1", "true", "yes"].includes(
        String((req.query.download ?? req.query.dl ?? "")).toLowerCase()
      );
      res.setHeader("Content-Type", (doc as any).mimeType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `${forceDownload ? "attachment" : "inline"}; filename="${((doc as any).originalName || "document").replace(/"/g, '\\"')}"`
      );
      res.sendFile(fullPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("getDocumentFile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /public/patient/diagnostic-tests/:token/report/file - public short-lived link
// Used so lab/assistant systems (email/WhatsApp bot) can share the report without patient JWT.
router.get(
  "/diagnostic-tests/:token/report/file",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      if (!token) {
        res.status(400).json({ message: "token is required" });
        return;
      }

      const decoded: any = jwt.verify(token, env.jwt.secret);
      if (decoded?.type !== "diagnostic_report") {
        res.status(400).json({ message: "Invalid token type" });
        return;
      }

      const { patientId, visitId, testId } = decoded as {
        patientId?: string;
        visitId?: string;
        testId?: string;
      };

      if (!patientId || !visitId || !testId) {
        res.status(400).json({ message: "Invalid token payload" });
        return;
      }

      const { DiagnosticTest } = await import("../models/DiagnosticTest");
      const { Visit } = await import("../models/Visit");

      const visit = await Visit.findOne({ _id: visitId, patient: patientId }).lean();
      if (!visit) {
        res.status(404).json({ message: "Visit not found" });
        return;
      }

      const test = await DiagnosticTest.findOne({ _id: testId, visit: visitId }).lean();
      if (!test || !(test as any).reportPath) {
        res.status(404).json({ message: "Report not found" });
        return;
      }

      // Security gate: patient should access report only after lab marks payment as PAID.
      // We match by patientId + testName and compare visit day with paid/created day.
      const testName = String((test as any).testName ?? "").trim();
      if (!testName) {
        res.status(403).json({ message: "Payment required to access report" });
        return;
      }
      const paidRequests = await PatientTestRequest.find({
        patient: patientId,
        paymentStatus: "PAID",
      })
        .lean();

      const paidMatch = pickPaidRequestForDiagnosticAccess(
        paidRequests as any[],
        testName,
        (visit as any).visitDate
      );
      if (!paidMatch) {
        res.status(403).json({ message: "Payment required to access report" });
        return;
      }

      const reportPath = (test as any).reportPath;
      const fullPath = resolveDiagnosticReportPath(reportPath);
      if (!fullPath) {
        if (/^https?:\/\//i.test(String(reportPath ?? ""))) {
          res.redirect(String(reportPath));
          return;
        }
        res.status(404).json({ message: "Report file not found on the server" });
        return;
      }
      res.setHeader("Content-Type", (test as any).reportMimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${((test as any).reportFileName || "report").replace(/"/g, '\\"')}"`
      );
      res.sendFile(fullPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("diagnostic report public link error:", error);
      res.status(401).json({ message: "Invalid or expired token" });
    }
  }
);

// GET /public/patient/visits/:visitId/diagnostic-tests/:testId/report/file - serve diagnostic report
router.get(
  "/visits/:visitId/diagnostic-tests/:testId/report/file",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { visitId, testId } = req.params;
      const patientId = req.patient!._id;

      const { DiagnosticTest } = await import("../models/DiagnosticTest");
      const { Visit } = await import("../models/Visit");

      const visit = await Visit.findOne({
        _id: visitId,
        patient: patientId,
      }).lean();
      if (!visit) {
        res.status(404).json({ message: "Visit not found" });
        return;
      }

      const test = await DiagnosticTest.findOne({
        _id: testId,
        visit: visitId,
      }).lean();
      if (!test || !(test as any).reportPath) {
        res.status(404).json({ message: "Report not found" });
        return;
      }

      // Security gate: patient should access report only after lab marks payment as PAID.
      const testName = String((test as any).testName ?? "").trim();
      if (!testName) {
        res.status(403).json({ message: "Payment required to access report" });
        return;
      }

      const paidRequests = await PatientTestRequest.find({
        patient: patientId,
        paymentStatus: "PAID",
      })
        .lean();

      const paidMatch = pickPaidRequestForDiagnosticAccess(
        paidRequests as any[],
        testName,
        (visit as any).visitDate
      );
      if (!paidMatch) {
        res.status(403).json({ message: "Payment required to access report" });
        return;
      }

      const reportPath = (test as any).reportPath;
      const fullPath = resolveDiagnosticReportPath(reportPath);
      if (!fullPath) {
        if (/^https?:\/\//i.test(String(reportPath ?? ""))) {
          res.redirect(String(reportPath));
          return;
        }
        res.status(404).json({ message: "Report file not found on the server" });
        return;
      }
      res.setHeader("Content-Type", (test as any).reportMimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${((test as any).reportFileName || "report").replace(/"/g, '\\"')}"`
      );
      res.sendFile(fullPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("getDiagnosticReportFile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
