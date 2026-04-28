import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";

import { Doctor } from "../models/Doctor";
import { DoctorNotification } from "../models/DoctorNotification";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { Patient } from "../models/Patient";
import { PatientDocument } from "../models/PatientDocument";
import ocrService from "../ocrService";
import { getIo } from "../socket";
import { Visit } from "../models/Visit";
import { env } from "../config/env";
import {
  findExistingUploadFilePath,
  toStoredUploadPath,
  uploadFileExists,
} from "../utils/uploadPath";
import { sendEmailWithAttachment } from "../services/emailService";
import { sendWhatsAppMessage } from "../services/whatsappService";
import {
  addDiagnosticTestsToVisit,
  createPatient as createPatientService,
  createVisit as createVisitService,
  findPatientByMobile,
  findPatientsByMobile,
  getFullPatientHistory,
  updatePatient as updatePatientService,
  updateVisitVitals
} from "../services/patientService";

const patientToJson = (p: {
  _id: unknown;
  firstName: string;
  lastName?: string;
  mobileNumber: string;
  gender?: string;
  dateOfBirth?: Date;
  address?: string;
  bloodGroup?: string;
  previousHealthHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}) => ({
  id: (p as any)._id.toString(),
  firstName: p.firstName,
  lastName: p.lastName,
  mobileNumber: p.mobileNumber,
  gender: p.gender,
  dateOfBirth: p.dateOfBirth,
  address: p.address,
  bloodGroup: p.bloodGroup,
  previousHealthHistory: p.previousHealthHistory,
  emergencyContactName: p.emergencyContactName,
  emergencyContactPhone: p.emergencyContactPhone
});

function resolveDiagnosticReportPath(storedPath: unknown): string | null {
  const raw = String(storedPath ?? "").trim();
  if (!raw) return null;
  return findExistingUploadFilePath(raw) || null;
}

type ConfidenceTag = "HIGH" | "MEDIUM" | "LOW";

const TEST_KEYWORDS = [
  "cbc",
  "hba1c",
  "lipid",
  "thyroid",
  "tsh",
  "lft",
  "kft",
  "sugar",
  "xray",
  "x-ray",
  "ecg",
  "ultrasound",
  "urine",
  "blood test",
  "test",
  "lab",
];

const MEDICINE_HINTS = [
  "tab",
  "tablet",
  "cap",
  "capsule",
  "syp",
  "syrup",
  "inj",
  "injection",
  "mg",
  "ml",
  "od",
  "bd",
  "tds",
  "hs",
  "after food",
  "before food",
];

function detectLineType(line: string): "MEDICINE" | "TEST" | "UNKNOWN" {
  const lower = line.toLowerCase();
  if (TEST_KEYWORDS.some((k) => lower.includes(k))) return "TEST";
  if (MEDICINE_HINTS.some((k) => lower.includes(k))) return "MEDICINE";
  return "UNKNOWN";
}

function computeLineConfidence(
  line: string,
  lineType: "MEDICINE" | "TEST" | "UNKNOWN",
  ocrConfidence?: number
): ConfidenceTag {
  const norm = line.trim();
  if (!norm) return "LOW";

  let score = typeof ocrConfidence === "number" ? Math.max(0, Math.min(100, ocrConfidence)) : 55;
  if (lineType !== "UNKNOWN") score += 20;
  if (/\d/.test(norm)) score += 8;
  if (norm.length >= 12) score += 5;
  if (/[^a-zA-Z0-9\s.,:+\-()/]/.test(norm)) score -= 12;
  if (norm.length <= 4) score -= 15;

  if (score >= 78) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function parsePrescriptionOcr(
  rawOcrText: string,
  ocrConfidence?: number
): {
  medicines: Array<{ text: string; confidence: ConfidenceTag }>;
  tests: Array<{ text: string; confidence: ConfidenceTag }>;
  unknown: Array<{ text: string; confidence: ConfidenceTag }>;
  lowConfidenceLines: string[];
} {
  const lines = rawOcrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 250);

  const medicines: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const tests: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const unknown: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const lowConfidenceLines: string[] = [];

  for (const line of lines) {
    const lineType = detectLineType(line);
    const confidence = computeLineConfidence(line, lineType, ocrConfidence);
    if (confidence === "LOW") lowConfidenceLines.push(line);

    if (lineType === "MEDICINE") medicines.push({ text: line, confidence });
    else if (lineType === "TEST") tests.push({ text: line, confidence });
    else unknown.push({ text: line, confidence });
  }

  return { medicines, tests, unknown, lowConfidenceLines };
}

export const searchPatientByMobile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const mobile = req.query.mobile as string | undefined;

    if (!mobile) {
      res.status(400).json({ message: "Query parameter 'mobile' is required" });
      return;
    }

    const patients = await findPatientsByMobile(mobile);
    if (!patients || patients.length === 0) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    res.status(200).json({
      patient: patientToJson(patients[0] as any),
      patients: patients.map((p: any) => patientToJson(p))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("searchPatientByMobile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createPatient = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const body = req.body as {
      firstName?: string;
      lastName?: string;
      mobileNumber?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      bloodGroup?: string;
      previousHealthHistory?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    };

    if (!body.firstName || !body.mobileNumber) {
      res.status(400).json({ message: "First name and mobile number are required" });
      return;
    }

    const patient = await createPatientService({
      firstName: body.firstName,
      lastName: body.lastName,
      mobileNumber: body.mobileNumber,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      gender: body.gender as "MALE" | "FEMALE" | "OTHER" | undefined,
      address: body.address,
      bloodGroup: body.bloodGroup,
      previousHealthHistory: body.previousHealthHistory,
      emergencyContactName: body.emergencyContactName,
      emergencyContactPhone: body.emergencyContactPhone
    });

    res.status(201).json({ patient: patientToJson(patient as any) });
  } catch (error) {
    if (error instanceof Error && error.message === "MOBILE_ALREADY_EXISTS") {
      res.status(409).json({ message: "A patient with this mobile number already exists" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("createPatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updatePatient = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId } = req.params;
    const body = req.body as Record<string, unknown>;

    const payload: Record<string, unknown> = {};
    if (body.firstName !== undefined) payload.firstName = body.firstName;
    if (body.lastName !== undefined) payload.lastName = body.lastName;
    if (body.mobileNumber !== undefined) payload.mobileNumber = body.mobileNumber;
    if (body.dateOfBirth !== undefined) payload.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth as string) : undefined;
    if (body.gender !== undefined) payload.gender = body.gender;
    if (body.address !== undefined) payload.address = body.address;
    if (body.bloodGroup !== undefined) payload.bloodGroup = body.bloodGroup;
    if (body.previousHealthHistory !== undefined) payload.previousHealthHistory = body.previousHealthHistory;
    if (body.emergencyContactName !== undefined) payload.emergencyContactName = body.emergencyContactName;
    if (body.emergencyContactPhone !== undefined) payload.emergencyContactPhone = body.emergencyContactPhone;

    const patient = await updatePatientService(patientId, payload as any);

    res.status(200).json({ patient: patientToJson(patient as any) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PATIENT_ID" || error.message === "PATIENT_NOT_FOUND") {
        res.status(404).json({ message: "Patient not found" });
        return;
      }
      if (error.message === "MOBILE_ALREADY_EXISTS") {
        res.status(409).json({ message: "A patient with this mobile number already exists" });
        return;
      }
    }
    // eslint-disable-next-line no-console
    console.error("updatePatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createVisit = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId } = req.params;
    const body = req.body as {
      doctorId?: string;
      reason?: string;
      notes?: string;
      bloodPressureSystolic?: number;
      bloodPressureDiastolic?: number;
      bloodSugarFasting?: number;
      weightKg?: number;
      temperature?: number;
      otherVitalsNotes?: string;
    };

    let doctorId = body.doctorId;
    if (req.doctor?.role === "ASSISTANT") {
      const assistant = await Doctor.findById(req.doctor._id).select("createdByDoctorId").lean();
      if (!assistant?.createdByDoctorId) {
        res.status(400).json({ message: "Assistant is not linked to a doctor. Cannot refer patient." });
        return;
      }
      doctorId = (assistant.createdByDoctorId as any).toString();
    } else if (!doctorId) {
      res.status(400).json({ message: "Doctor is required for the visit" });
      return;
    }

    const visit = await createVisitService({
      patientId,
      doctorId: doctorId!,
      recordedById: req.doctor?._id?.toString(),
      reason: body.reason,
      notes: body.notes,
      bloodPressureSystolic: body.bloodPressureSystolic,
      bloodPressureDiastolic: body.bloodPressureDiastolic,
      bloodSugarFasting: body.bloodSugarFasting,
      weightKg: body.weightKg,
      temperature: body.temperature,
      otherVitalsNotes: body.otherVitalsNotes,
      appointmentChannel: "WALK_IN"
    });

    const patient = await Patient.findById(visit.patient).select("firstName lastName").lean();
    const patientName = patient
      ? [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient"
      : "Patient";

    if (req.doctor?.role === "ASSISTANT") {
      const notification = await DoctorNotification.create({
        doctor: visit.doctor,
        patient: visit.patient,
        patientName,
        visit: visit._id,
        status: "unread",
        source: "ASSISTANT_REFERRAL"
      });

      const io = getIo();
      if (io) {
        io.to(`doctor:${doctorId}`).emit("patientReferred", {
          notificationId: notification._id.toString(),
          patientId: visit.patient.toString(),
          patientName,
          visitId: visit._id.toString()
        });
      }
    }

    res.status(201).json({
      visit: {
        id: visit._id,
        patientId: visit.patient.toString(),
        doctorId: visit.doctor.toString(),
        visitDate: visit.visitDate,
        reason: visit.reason,
        notes: visit.notes,
        bloodPressureSystolic: visit.bloodPressureSystolic,
        bloodPressureDiastolic: visit.bloodPressureDiastolic,
        bloodSugarFasting: visit.bloodSugarFasting,
        weightKg: visit.weightKg,
        temperature: visit.temperature,
        otherVitalsNotes: visit.otherVitalsNotes
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PATIENT_ID" || error.message === "PATIENT_NOT_FOUND") {
        res.status(404).json({ message: "Patient not found" });
        return;
      }
      if (error.message === "INVALID_DOCTOR_ID" || error.message === "DOCTOR_NOT_FOUND") {
        res.status(400).json({ message: "Invalid or missing doctor for visit" });
        return;
      }
      if (error.message === "DAILY_WALKIN_QUOTA_FULL") {
        res.status(409).json({
          message:
            "Walk-in slots for this doctor today are full. Try another day or ask the doctor to increase the daily walk-in limit."
        });
        return;
      }
    }
    // eslint-disable-next-line no-console
    console.error("createVisit error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const recordVitalsAndReferForExistingVisit = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId, visitId } = req.params;
    const body = req.body as {
      reason?: string;
      notes?: string;
      bloodPressureSystolic?: number;
      bloodPressureDiastolic?: number;
      bloodSugarFasting?: number;
      weightKg?: number;
      temperature?: number;
      otherVitalsNotes?: string;
    };

    if (req.doctor?.role !== "ASSISTANT") {
      res.status(403).json({ message: "Only assistants can refer for an existing visit." });
      return;
    }

    const assistant = await Doctor.findById(req.doctor._id).select("createdByDoctorId").lean();
    if (!assistant?.createdByDoctorId) {
      res.status(400).json({ message: "Assistant is not linked to a doctor. Cannot refer patient." });
      return;
    }
    const doctorId = (assistant.createdByDoctorId as any).toString();

    const visit = await Visit.findById(visitId).lean();
    if (!visit) {
      res.status(404).json({ message: "Visit not found." });
      return;
    }
    if (visit.patient.toString() !== patientId || visit.doctor.toString() !== doctorId) {
      res.status(403).json({ message: "This visit does not belong to this patient or your doctor." });
      return;
    }

    const sys = body.bloodPressureSystolic;
    const dia = body.bloodPressureDiastolic;
    if (sys === undefined || dia === undefined || Number.isNaN(sys) || Number.isNaN(dia)) {
      res.status(400).json({ message: "Blood pressure (systolic and diastolic) is mandatory." });
      return;
    }

    await updateVisitVitals(visitId, {
      reason: body.reason,
      notes: body.notes,
      bloodPressureSystolic: sys,
      bloodPressureDiastolic: dia,
      bloodSugarFasting: body.bloodSugarFasting,
      weightKg: body.weightKg,
      temperature: body.temperature,
      otherVitalsNotes: body.otherVitalsNotes
    });

    const patient = await Patient.findById(patientId).select("firstName lastName").lean();
    const patientName = patient
      ? [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient"
      : "Patient";

    const notification = await DoctorNotification.create({
      doctor: visit.doctor,
      patient: visit.patient,
      patientName,
      visit: visit._id,
      status: "unread",
      source: "ASSISTANT_REFERRAL"
    });

    const io = getIo();
    if (io) {
      io.to(`doctor:${doctorId}`).emit("patientReferred", {
        notificationId: notification._id.toString(),
        patientId: visit.patient.toString(),
        patientName,
        visitId: visit._id.toString()
      });
    }

    res.status(200).json({
      message: "Patient referred to doctor.",
      notificationId: notification._id.toString()
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "VISIT_NOT_FOUND" || error.message === "INVALID_VISIT_ID") {
        res.status(404).json({ message: "Visit not found." });
        return;
      }
    }
    // eslint-disable-next-line no-console
    console.error("recordVitalsAndReferForExistingVisit error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPatientFullHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId } = req.params;

    const history = await getFullPatientHistory(patientId);

    res.status(200).json(history);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PATIENT_ID") {
        res.status(400).json({ message: "Invalid patientId" });
        return;
      }
      if (error.message === "PATIENT_NOT_FOUND") {
        res.status(404).json({ message: "Patient not found" });
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.error("getPatientFullHistory error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const uploadPatientDocument = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId } = req.params;
    const file = (req as any).file as any;

    if (!file) {
      res.status(400).json({ message: "File is required" });
      return;
    }

    const fileMimetype: string | undefined = typeof file.mimetype === "string" ? file.mimetype : undefined;
    // OCR is only useful for images; PDFs/other docs can cause heavy processing/timeouts.
    const shouldRunOcr = !!fileMimetype && fileMimetype.startsWith("image/");
    // eslint-disable-next-line no-console
    console.log("uploadPatientDocument:", {
      patientId,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      shouldRunOcr,
    });

    const patient = await Patient.findById(patientId).select("_id");
    if (!patient) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    const doc = await PatientDocument.create({
      patient: patient._id,
      uploadedBy: req.doctor?._id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: toStoredUploadPath(file.path, file.filename),
      fileData: await fs.promises.readFile(file.path),
    });

    // Try to extract text using OCR in the background of this request.
    // Even if OCR fails, file upload should still succeed.
    let ocrPayload:
      | { success: true; text: string; confidence?: number }
      | { success: false; error?: string }
      | undefined;

    try {
      if (!shouldRunOcr) {
        ocrPayload = {
          success: false,
          error: "OCR skipped for non-image file",
        };
      } else {
        const ocrResult = await ocrService.extractTextFromImage(file.path);
        if (ocrResult.success && ocrResult.text) {
          doc.ocrText = ocrResult.text;
          doc.ocrConfidence = ocrResult.confidence;
          await doc.save();
          ocrPayload = {
            success: true,
            text: ocrResult.text,
            confidence: ocrResult.confidence,
          };
        } else {
          ocrPayload = {
            success: false,
            error: ocrResult.error,
          };
        }
      }
    } catch (ocrError: any) {
      // eslint-disable-next-line no-console
      console.error("uploadPatientDocument OCR error:", ocrError);
      ocrPayload = {
        success: false,
        error: ocrError?.message ?? "Failed to extract text"
      };
    }

    res.status(201).json({
      document: {
        id: doc._id.toString(),
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        uploadedAt: doc.createdAt
      },
      ocr: ocrPayload
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("uploadPatientDocument error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getDocumentFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId, documentId } = req.params;
    const role = req.doctor?.role;

    if (role === "LAB_ASSISTANT" || role === "LAB_MANAGER" || role === "PHARMACY") {
      res.status(403).json({
        message: "Direct prescription file access is blocked for this role",
        code: "PRESCRIPTION_FILE_ACCESS_BLOCKED"
      });
      return;
    }

    const doc = await PatientDocument.findOne({
      _id: documentId,
      patient: patientId
    }).lean();

    if (!doc) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    const fullPath = findExistingUploadFilePath(doc.path);
    if (!uploadFileExists(fullPath)) {
      if ((doc as any).fileData) {
        res.setHeader("Content-Type", doc.mimeType);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${doc.originalName.replace(/"/g, '\\"')}"`
        );
        res.send((doc as any).fileData);
        return;
      }
      res.status(404).json({ message: "File not found on server" });
      return;
    }

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.originalName.replace(/"/g, '\\"')}"`
    );
    res.sendFile(fullPath);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getDocumentFile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPrescriptionSecureLink = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId, documentId } = req.params;
    const role = req.doctor?.role;
    if (!role) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (role !== "LAB_ASSISTANT" && role !== "LAB_MANAGER" && role !== "PHARMACY") {
      res.status(403).json({
        message: "Secure prescription links are only for lab/pharmacy roles"
      });
      return;
    }

    const doc = await PatientDocument.findOne({
      _id: documentId,
      patient: patientId
    }).select("_id patient").lean();
    if (!doc) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    const token = jwt.sign(
      {
        type: "prescription_preview",
        patientId,
        documentId,
        role,
        scope: "OCR_ONLY"
      },
      env.jwt.secret,
      { expiresIn: "15m" }
    );

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    res.status(200).json({ token, expiresAt });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getPrescriptionSecureLink error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPrescriptionSecurePreview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.params;
    const role = req.doctor?.role;
    if (!role) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    if (!token) {
      res.status(400).json({ message: "token is required" });
      return;
    }

    const decoded = jwt.verify(token, env.jwt.secret) as {
      type?: string;
      patientId?: string;
      documentId?: string;
      role?: string;
      scope?: string;
      exp?: number;
    };

    if (decoded.type !== "prescription_preview") {
      res.status(400).json({ message: "Invalid token type" });
      return;
    }
    if (!decoded.patientId || !decoded.documentId || !decoded.role) {
      res.status(400).json({ message: "Invalid token payload" });
      return;
    }
    if (decoded.role !== role) {
      res.status(403).json({ message: "Role mismatch for this secure token" });
      return;
    }
    if (role !== "LAB_ASSISTANT" && role !== "LAB_MANAGER" && role !== "PHARMACY") {
      res.status(403).json({ message: "Only lab/pharmacy can access secure prescription preview" });
      return;
    }

    const doc = await PatientDocument.findOne({
      _id: decoded.documentId,
      patient: decoded.patientId
    })
      .select("_id originalName mimeType createdAt ocrText ocrConfidence")
      .lean();

    if (!doc) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    const rawText = ((doc as any).ocrText ?? "").toString().trim();
    const previewText = rawText
      ? rawText.slice(0, 6000)
      : "Prescription preview is not available yet. OCR text not found.";

    const parsed = parsePrescriptionOcr(previewText, (doc as any).ocrConfidence);
    const isPharmacy = role === "PHARMACY";
    const isLab = role === "LAB_ASSISTANT" || role === "LAB_MANAGER";

    // Role-based filtering for the "Raw OCR" section too:
    // - Lab roles: hide medicine-like lines
    // - Pharmacy role: hide test-like lines
    const roleFilteredPreviewText = previewText
      .split(/\r?\n/)
      .filter((line: string) => {
        const lineType = detectLineType(line);
        if (isLab && lineType === "MEDICINE") return false;
        if (isPharmacy && lineType === "TEST") return false;
        return true;
      })
      .join("\n")
      .trim();

    const roleFilteredParsed = {
      medicines: isPharmacy ? parsed.medicines : [],
      tests: isLab ? parsed.tests : [],
      unknown: parsed.unknown
    };

    // Role-based filtering for low-confidence lines too.
    // - Lab roles: hide medicine-like lines; keep tests + patient/doctor details (usually UNKNOWN)
    // - Pharmacy role: hide test-like lines; keep medicines + patient/doctor details (usually UNKNOWN)
    const roleFilteredLowConfidenceLines = parsed.lowConfidenceLines
      .filter((line) => {
        const lineType = detectLineType(line);
        if (isLab && lineType === "MEDICINE") return false;
        if (isPharmacy && lineType === "TEST") return false;
        return true;
      })
      .slice(0, 20);

    res.status(200).json({
      document: {
        id: (doc as any)._id.toString(),
        originalName: (doc as any).originalName,
        mimeType: (doc as any).mimeType,
        uploadedAt: (doc as any).createdAt,
        // UI uses previewText for both parsed preview and "Raw OCR" display.
        previewText: roleFilteredPreviewText,
        rawOcrText: previewText,
        parsed: roleFilteredParsed,
        lowConfidenceLines: roleFilteredLowConfidenceLines,
        ocrConfidence: (doc as any).ocrConfidence,
        limitedView: true,
        scope: decoded.scope ?? "OCR_ONLY",
        downloadable: false,
        roleView: isPharmacy ? "PHARMACY_MEDICINES_ONLY" : "LAB_TESTS_ONLY"
      }
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: "Secure link expired" });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: "Invalid secure link token" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("getPrescriptionSecurePreview error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const addDiagnosticTests = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const role = req.doctor?.role;
    if (role !== "DOCTOR" && role !== "LAB_ASSISTANT") {
      res.status(403).json({
        message: "Only doctor or lab assistant can add diagnostic tests"
      });
      return;
    }

    const { patientId, visitId } = req.params;
    const body = (req.body || {}) as { testNames?: string[]; tests?: Array<{ testName?: string; testname?: string; price?: number }> };

    if (!patientId || !visitId) {
      res.status(400).json({ message: "patientId and visitId are required" });
      return;
    }

    let tests: Array<{ testName: string; price?: number }>;
    if (Array.isArray(body.tests) && body.tests.length > 0) {
      tests = body.tests
        .map((t) => ({
          testName: typeof t === "string" ? t : String((t as any).testName ?? (t as any).testname ?? "").trim(),
          price: typeof (t as any).price === "number" && (t as any).price >= 0 ? (t as any).price : undefined
        }))
        .filter((t) => t.testName.length > 0);
    } else if (Array.isArray(body.testNames) && body.testNames.length > 0) {
      tests = body.testNames
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((name) => ({ testName: name.trim() }));
    } else {
      res.status(400).json({ message: "At least one test name is required." });
      return;
    }

    if (tests.length === 0) {
      res.status(400).json({ message: "At least one test name is required." });
      return;
    }

    const added = await addDiagnosticTestsToVisit(patientId, visitId, tests);

    res.status(201).json({
      message: "Diagnostic tests added",
      added
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_PATIENT_ID" || error.message === "INVALID_VISIT_ID") {
        res.status(400).json({ message: error.message });
        return;
      }
      if (error.message === "VISIT_NOT_FOUND") {
        res.status(404).json({ message: "Visit not found" });
        return;
      }
      if (error.message === "VISIT_DOES_NOT_BELONG_TO_PATIENT") {
        res.status(400).json({ message: "Visit does not belong to this patient" });
        return;
      }
      if (error.message === "TEST_NAMES_REQUIRED") {
        res.status(400).json({ message: "At least one valid test name is required" });
        return;
      }
      if (error.message === "ALL_TESTS_ALREADY_ON_VISIT") {
        res.status(400).json({
          message: "This test is already added for this visit. Remove the duplicate or use a different name."
        });
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.error("addDiagnosticTests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const uploadDiagnosticTestReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const role = req.doctor?.role;
    if (role !== "DOCTOR" && role !== "LAB_ASSISTANT") {
      res.status(403).json({
        message: "Only doctor or lab assistant can upload diagnostic test reports"
      });
      return;
    }

    const { patientId, visitId, testId } = req.params;
    const file = (req as any).file as any;

    if (!file) {
      res.status(400).json({ message: "File is required" });
      return;
    }

    const test = await DiagnosticTest.findById(testId).populate("visit").lean();
    if (!test) {
      res.status(404).json({ message: "Diagnostic test not found" });
      return;
    }

    const visit = test.visit as any;
    if (visit.patient.toString() !== patientId || visit._id.toString() !== visitId) {
      res.status(400).json({ message: "Test does not belong to this patient/visit" });
      return;
    }

    await DiagnosticTest.findByIdAndUpdate(testId, {
      reportPath: toStoredUploadPath(file.path, file.filename),
      reportFileName: file.originalname,
      reportMimeType: file.mimetype,
      reportUploadedAt: new Date()
    });

    // Notify patient on report upload (WhatsApp always via phone; Email only if patient.email is set).
    // This runs after DB update; failures should not break the upload flow.
    const patient = await Patient.findById(patientId)
      .select("firstName lastName mobileNumber email")
      .lean();

    const reportToken = jwt.sign(
      { type: "diagnostic_report", patientId, visitId, testId },
      env.jwt.secret,
      { expiresIn: "10m" }
    );

    const host = req.get("host");
    const protocol = req.protocol;
    const reportUrl = host
      ? `${protocol}://${host}/public/patient/diagnostic-tests/${reportToken}/report/file`
      : "";

    void Promise.allSettled([
      patient?.mobileNumber
        ? sendWhatsAppMessage(
            patient.mobileNumber,
            `Your lab report for "${test.testName}" is ready. ${
              reportUrl ? `Download: ${reportUrl}` : ""
            }`
          )
        : Promise.resolve(),
      patient?.email
        ? sendEmailWithAttachment({
            to: patient.email,
            subject: `Lab report ready - ${test.testName}`,
            text: `Hello ${patient.firstName ?? ""},\n\nYour lab report for "${test.testName}" is ready.\n${
              reportUrl ? `Download: ${reportUrl}\n` : ""
            }\n\nRegards,\nBTBiz Doctor`,
            attachment: {
              filename: file.originalname,
              path: findExistingUploadFilePath(file.path) || file.path,
              contentType: file.mimetype,
            },
          })
        : Promise.resolve(),
    ]);

    res.status(200).json({
      message: "Report uploaded successfully",
      testId,
      fileName: file.originalname
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("uploadDiagnosticTestReport error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getDiagnosticTestReportFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId, visitId, testId } = req.params;

    const test = await DiagnosticTest.findById(testId).populate("visit").lean();
    if (!test) {
      res.status(404).json({ message: "Diagnostic test not found" });
      return;
    }

    const visit = test.visit as any;
    if (visit.patient.toString() !== patientId || visit._id.toString() !== visitId) {
      res.status(400).json({ message: "Test does not belong to this patient/visit" });
      return;
    }

    if (!test.reportPath) {
      res.status(404).json({ message: "Report not found for this test" });
      return;
    }

    const fullPath = resolveDiagnosticReportPath(test.reportPath);
    if (!fullPath) {
      if (/^https?:\/\//i.test(String(test.reportPath ?? ""))) {
        res.redirect(String(test.reportPath));
        return;
      }
      res.status(404).json({ message: "Report file not found on the server" });
      return;
    }

    res.setHeader("Content-Type", test.reportMimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${(test.reportFileName || "report").replace(/"/g, '\\"')}"`
    );
    res.sendFile(fullPath);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getDiagnosticTestReportFile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


