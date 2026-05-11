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
import {
  detectLineType,
  formatVerifiedMedicineLine,
  parsePrescriptionOcr,
  type VerifiedExtractPayload,
} from "../utils/prescriptionOcrParse";
import { sendEmailWithAttachment } from "../services/emailService";
import { sendWhatsAppMessage } from "../services/whatsappService";
import {
  addDiagnosticTestsToVisit,
  createPatient as createPatientService,
  createVisit as createVisitService,
  findPatientByMobile,
  findPatientsByMobile,
  getFullPatientHistory,
  updateDiagnosticTestPricesOnVisit,
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

function setBrowserCompatibleFileHeaders(
  res: Response,
  mimeType: string,
  originalName: string,
  asDownload = false
): void {
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `${asDownload ? "attachment" : "inline"}; filename="${originalName.replace(/"/g, '\\"')}"`
  );
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
}

function resolveDiagnosticReportPath(storedPath: unknown): string | null {
  const raw = String(storedPath ?? "").trim();
  if (!raw) return null;
  return findExistingUploadFilePath(raw) || null;
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
      // Clinic uploads require assistant/doctor verification before patient & lab/pharmacy preview.
      patientPublishStatus: req.doctor?._id ? "PENDING_ASSISTANT" : "PUBLISHED",
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

    let suggestedParse: ReturnType<typeof parsePrescriptionOcr> | undefined;
    const ocrForSuggest = ((doc as any).ocrText ?? "").toString().trim();
    if (ocrForSuggest) {
      suggestedParse = parsePrescriptionOcr(ocrForSuggest, (doc as any).ocrConfidence);
    }

    res.status(201).json({
      document: {
        id: doc._id.toString(),
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        uploadedAt: doc.createdAt,
        patientPublishStatus: (doc as any).patientPublishStatus ?? "PUBLISHED",
      },
      ocr: ocrPayload,
      suggestedParse,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("uploadPatientDocument error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

function sanitizeVerifiedPayload(body: unknown): VerifiedExtractPayload {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const clip = (s: unknown, max: number): string | undefined => {
    if (typeof s !== "string") return undefined;
    const t = s.trim().slice(0, max);
    return t || undefined;
  };

  const rawMeds = Array.isArray(b.medicines) ? b.medicines : [];
  const medicines = rawMeds.slice(0, 50).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const medicineName = clip(r.medicineName, 400) ?? "";
    if (!medicineName) return [];
    return [
      {
        medicineName,
        dosage: clip(r.dosage, 200),
        quantity: clip(r.quantity, 50),
        notes: clip(r.notes, 500),
      },
    ];
  });

  const rawTests = Array.isArray(b.tests) ? b.tests : [];
  const tests = rawTests.slice(0, 50).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const testName = clip(r.testName, 400) ?? "";
    if (!testName) return [];
    return [{ testName, notes: clip(r.notes, 500) }];
  });

  const clinicalNotes = clip(b.clinicalNotes, 4000);
  const importantNotes = clip(b.importantNotes, 4000);

  return { medicines, tests, clinicalNotes, importantNotes };
}

export const verifyPatientDocumentForPatientProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { patientId, documentId } = req.params;
    const role = req.doctor?.role;
    if (role !== "ASSISTANT" && role !== "DOCTOR") {
      res.status(403).json({
        message: "Only clinic staff can release a prescription to the patient profile",
      });
      return;
    }

    if (!documentId || !patientId) {
      res.status(400).json({ message: "patientId and documentId are required" });
      return;
    }

    const verified = sanitizeVerifiedPayload(req.body);

    const doc = await PatientDocument.findOne({
      _id: documentId,
      patient: patientId,
    });

    if (!doc) {
      res.status(404).json({ message: "Document not found for this patient" });
      return;
    }

    if (!(doc as any).uploadedBy) {
      res.status(400).json({
        message:
          "This document was uploaded by the patient and is already visible on their profile.",
      });
      return;
    }

    (doc as any).verifiedExtract = verified;
    (doc as any).verifiedAt = new Date();
    (doc as any).verifiedBy = req.doctor?._id;
    (doc as any).patientPublishStatus = "PUBLISHED";
    await doc.save();

    res.status(200).json({
      message:
        "Verified data saved. Patient can view the file; lab/pharmacy secure preview uses your verified medicines and tests.",
      document: {
        id: doc._id.toString(),
        patientPublishStatus: "PUBLISHED",
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("verifyPatientDocumentForPatientProfile error:", error);
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
      res.status(404).json({
        message: "Document record not found for this patient",
        code: "DOCUMENT_RECORD_NOT_FOUND",
      });
      return;
    }

    const fullPath = findExistingUploadFilePath(doc.path);
    if (!uploadFileExists(fullPath)) {
      if ((doc as any).fileData) {
        setBrowserCompatibleFileHeaders(
          res,
          doc.mimeType,
          doc.originalName || "document",
          false
        );
        res.send((doc as any).fileData);
        return;
      }
      res.status(404).json({
        message: "Document file missing on server storage",
        code: "DOCUMENT_FILE_MISSING",
      });
      return;
    }

    setBrowserCompatibleFileHeaders(
      res,
      doc.mimeType,
      doc.originalName || "document",
      false
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
    })
      .select("_id patient patientPublishStatus")
      .lean();
    if (!doc) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    if ((doc as any).patientPublishStatus === "PENDING_ASSISTANT") {
      res.status(403).json({
        message:
          "Assistant verification is still in progress. Secure preview is available after the document is released to the patient profile.",
        code: "ASSISTANT_VERIFICATION_PENDING",
      });
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
    const bodyToken =
      req.body && typeof (req.body as { token?: unknown }).token === "string"
        ? String((req.body as { token: string }).token).trim()
        : "";
    const queryToken =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    const pathToken = typeof req.params.token === "string" ? req.params.token.trim() : "";
    const token = bodyToken || queryToken || pathToken;
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
      .select(
        "_id originalName mimeType createdAt ocrText ocrConfidence patientPublishStatus verifiedExtract"
      )
      .lean();

    if (!doc) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    if ((doc as any).patientPublishStatus === "PENDING_ASSISTANT") {
      res.status(403).json({
        message:
          "Assistant verification is still in progress. This prescription is not available for secure preview yet.",
        code: "ASSISTANT_VERIFICATION_PENDING",
      });
      return;
    }

    const isPharmacy = role === "PHARMACY";
    const isLab = role === "LAB_ASSISTANT" || role === "LAB_MANAGER";

    const ve = (doc as any).verifiedExtract as VerifiedExtractPayload | undefined;
    const hasVerified =
      !!ve &&
      ((ve.medicines && ve.medicines.length > 0) ||
        (ve.tests && ve.tests.length > 0) ||
        !!(ve.clinicalNotes && ve.clinicalNotes.trim()) ||
        !!(ve.importantNotes && ve.importantNotes.trim()));

    let previewText: string;
    let rawOcrText: string;
    let roleFilteredPreviewText: string;
    let roleFilteredParsed: {
      medicines: Array<{ text: string; confidence: "HIGH" | "MEDIUM" | "LOW" }>;
      tests: Array<{ text: string; confidence: "HIGH" | "MEDIUM" | "LOW" }>;
      unknown: Array<{ text: string; confidence: "HIGH" | "MEDIUM" | "LOW" }>;
    };
    let roleFilteredLowConfidenceLines: string[];
    let ocrConfidenceOut: number | undefined;

    if (hasVerified && ve) {
      const medLines = (ve.medicines || [])
        .map((m) => formatVerifiedMedicineLine(m))
        .filter((l) => l.trim().length > 0);
      const testLines = (ve.tests || [])
        .map((t) =>
          [t.testName, t.notes].filter((x) => x && String(x).trim()).join(" · ")
        )
        .filter((l) => l.trim().length > 0);
      const noteLines: string[] = [];
      if (ve.clinicalNotes?.trim()) noteLines.push(`Clinical: ${ve.clinicalNotes.trim()}`);
      if (ve.importantNotes?.trim()) noteLines.push(`Important: ${ve.importantNotes.trim()}`);
      const joined = [...medLines, ...testLines, ...noteLines].join("\n").slice(0, 6000);
      const rawOcr = ((doc as any).ocrText ?? "").toString().trim().slice(0, 6000);
      previewText =
        joined ||
        rawOcr ||
        "Prescription preview is not available yet. OCR text not found.";
      rawOcrText = rawOcr || joined;
      roleFilteredPreviewText =
        (isLab
          ? testLines.join("\n")
          : isPharmacy
            ? medLines.join("\n")
            : joined) || previewText;
      roleFilteredParsed = {
        medicines: isPharmacy
          ? (ve.medicines || []).map((m) => ({
              text: formatVerifiedMedicineLine(m),
              confidence: "HIGH" as const,
            }))
          : [],
        tests: isLab
          ? (ve.tests || []).map((t) => ({
              text: [t.testName, t.notes].filter((x) => x && String(x).trim()).join(" · "),
              confidence: "HIGH" as const,
            }))
          : [],
        unknown: [],
      };
      roleFilteredLowConfidenceLines = [];
      ocrConfidenceOut = 0.95;
    } else {
      const rawText = ((doc as any).ocrText ?? "").toString().trim();
      previewText = rawText
        ? rawText.slice(0, 6000)
        : "Prescription preview is not available yet. OCR text not found.";
      const parsed = parsePrescriptionOcr(previewText, (doc as any).ocrConfidence);
      roleFilteredPreviewText = previewText
        .split(/\r?\n/)
        .filter((line: string) => {
          const lineType = detectLineType(line);
          if (isLab) return lineType === "TEST";
          if (isPharmacy) return lineType === "MEDICINE";
          return true;
        })
        .join("\n")
        .trim();

      roleFilteredParsed = {
        medicines: isPharmacy ? parsed.medicines : [],
        tests: isLab ? parsed.tests : [],
        unknown: [],
      };

      roleFilteredLowConfidenceLines = parsed.lowConfidenceLines
        .filter((line) => {
          const lineType = detectLineType(line);
          if (isLab) return lineType === "TEST";
          if (isPharmacy) return lineType === "MEDICINE";
          return true;
        })
        .slice(0, 20);
      rawOcrText = previewText;
      ocrConfidenceOut = (doc as any).ocrConfidence;
    }

    res.status(200).json({
      document: {
        id: (doc as any)._id.toString(),
        originalName: (doc as any).originalName,
        mimeType: (doc as any).mimeType,
        uploadedAt: (doc as any).createdAt,
        // UI uses previewText for both parsed preview and "Raw OCR" display.
        previewText: roleFilteredPreviewText,
        rawOcrText,
        parsed: roleFilteredParsed,
        lowConfidenceLines: roleFilteredLowConfidenceLines,
        ocrConfidence: ocrConfidenceOut,
        limitedView: true,
        scope: decoded.scope ?? "OCR_ONLY",
        downloadable: false,
        roleView: isPharmacy ? "PHARMACY_MEDICINES_ONLY" : "LAB_TESTS_ONLY",
        source: hasVerified ? "VERIFIED_ASSISTANT" : "OCR_AUTO",
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

export const updateDiagnosticTestPrices = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const role = req.doctor?.role;
    if (role !== "DOCTOR" && role !== "LAB_ASSISTANT") {
      res.status(403).json({
        message: "Only doctor or lab assistant can update diagnostic test prices"
      });
      return;
    }

    const { patientId, visitId } = req.params;
    const body = (req.body || {}) as { tests?: Array<{ testName?: string; price?: unknown }> };

    if (!patientId || !visitId) {
      res.status(400).json({ message: "patientId and visitId are required" });
      return;
    }

    const raw = body.tests;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({ message: "tests array with at least one entry is required" });
      return;
    }

    const tests = raw
      .map((t) => {
        const testName = String(t.testName ?? "").trim();
        const p =
          typeof t.price === "number" && !Number.isNaN(t.price)
            ? t.price
            : parseFloat(String(t.price ?? ""));
        return { testName, price: p };
      })
      .filter((t) => t.testName.length > 0 && !Number.isNaN(t.price) && t.price >= 0);

    if (tests.length === 0) {
      res.status(400).json({ message: "At least one valid test name and price is required" });
      return;
    }

    const updated = await updateDiagnosticTestPricesOnVisit(patientId, visitId, tests);
    res.status(200).json({ message: "Diagnostic test prices updated", updated });
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
      if (error.message === "TEST_PRICES_REQUIRED") {
        res.status(400).json({ message: "At least one price update is required" });
        return;
      }
      if (error.message === "NO_MATCHING_DIAGNOSTIC_TESTS") {
        res.status(400).json({
          message: "No matching tests on this visit — accept the lab request first or check test names."
        });
        return;
      }
    }
    // eslint-disable-next-line no-console
    console.error("updateDiagnosticTestPrices error:", error);
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

    setBrowserCompatibleFileHeaders(
      res,
      test.reportMimeType || "application/pdf",
      test.reportFileName || "report",
      false
    );
    res.sendFile(fullPath);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getDiagnosticTestReportFile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


