import { Router, Request, Response } from "express";
import path from "path";
import jwt from "jsonwebtoken";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer") as any;

import { env } from "../config/env";
import { PatientDocument } from "../models/PatientDocument";
import { PatientMedicineRequest } from "../models/PatientMedicineRequest";
import { PatientTestRequest } from "../models/PatientTestRequest";
import { authenticatePatient } from "../middleware/authMiddleware";
import ocrService from "../ocrService";
import { getFullPatientHistory } from "../services/patientService";
import {
  sendPatientOtp,
  verifyPatientOtp,
  selectPatientProfile,
} from "../services/patientAuthService";

const router = Router();
const upload = multer({ dest: "uploads/" });

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
        const ocrResult = await ocrService.extractTextFromImage(file.path);
        if (ocrResult.success && ocrResult.text) {
          doc.ocrText = ocrResult.text;
          doc.ocrConfidence = ocrResult.confidence;
          await doc.save();
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
router.post(
  "/medicines",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { medicineName, dosage, quantity, notes, serviceType, paymentMode, expectedFulfillmentMinutes } = req.body as {
        medicineName?: string;
        dosage?: string;
        quantity?: number;
        notes?: string;
        serviceType?: "PICKUP" | "HOME_DELIVERY";
        paymentMode?: "ONLINE" | "OFFLINE";
        expectedFulfillmentMinutes?: number;
      };
      if (!medicineName || typeof medicineName !== "string" || !medicineName.trim()) {
        res.status(400).json({ message: "medicineName is required" });
        return;
      }
      const patientId = req.patient!._id;

      const entry = await PatientMedicineRequest.create({
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
      });

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
          createdAt: entry.createdAt,
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("patient add medicine error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// POST /public/patient/tests - patient adds test request
router.post(
  "/tests",
  authenticatePatient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { testName, notes, serviceType, paymentMode, preferredDateTime, expectedFulfillmentMinutes } = req.body as {
        testName?: string;
        notes?: string;
        serviceType?: "LAB_VISIT" | "HOME_SERVICE";
        paymentMode?: "ONLINE" | "OFFLINE";
        preferredDateTime?: string;
        expectedFulfillmentMinutes?: number;
      };
      if (!testName || typeof testName !== "string" || !testName.trim()) {
        res.status(400).json({ message: "testName is required" });
        return;
      }
      const patientId = req.patient!._id;

      const entry = await PatientTestRequest.create({
        patient: patientId,
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

      const fullPath = path.resolve(process.cwd(), (doc as any).path);
      res.setHeader("Content-Type", (doc as any).mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${(doc as any).originalName.replace(/"/g, '\\"')}"`
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

      const fullPath = path.resolve(process.cwd(), (test as any).reportPath);
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

      const fullPath = path.resolve(process.cwd(), (test as any).reportPath);
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
