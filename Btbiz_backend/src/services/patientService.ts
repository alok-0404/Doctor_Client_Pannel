import mongoose from "mongoose";

import { Patient } from "../models/Patient";
import { PatientDocument } from "../models/PatientDocument";
import { Visit } from "../models/Visit";
import { Prescription } from "../models/Prescription";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { Doctor } from "../models/Doctor";
import { PharmacyDispensation } from "../models/PharmacyDispensation";

export const findPatientByMobile = async (mobile: string) => {
  // Allow matching both raw 10-digit numbers and normalized forms like +91xxxxxxxxxx
  const digits = mobile.replace(/\D/g, "");
  const last10 = digits.slice(-10);

  const candidates = new Set<string>();
  if (mobile) candidates.add(mobile);
  if (last10) {
    candidates.add(last10);
    candidates.add(`+91${last10}`);
  }

  return Patient.findOne({ mobileNumber: { $in: Array.from(candidates) } });
};

export interface CreatePatientPayload {
  firstName: string;
  lastName?: string;
  mobileNumber: string;
  dateOfBirth?: Date;
  gender?: "MALE" | "FEMALE" | "OTHER";
  address?: string;
  bloodGroup?: string;
  previousHealthHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export const createPatient = async (payload: CreatePatientPayload) => {
  const existing = await Patient.findOne({ mobileNumber: payload.mobileNumber });
  if (existing) {
    throw new Error("MOBILE_ALREADY_EXISTS");
  }
  return Patient.create(payload);
};

export const updatePatient = async (
  patientId: string,
  payload: Partial<CreatePatientPayload>
) => {
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    throw new Error("INVALID_PATIENT_ID");
  }
  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error("PATIENT_NOT_FOUND");
  }
  if (payload.mobileNumber && payload.mobileNumber !== patient.mobileNumber) {
    const existing = await Patient.findOne({ mobileNumber: payload.mobileNumber });
    if (existing) {
      throw new Error("MOBILE_ALREADY_EXISTS");
    }
  }
  Object.assign(patient, payload);
  await patient.save();
  return patient;
};

export interface CreateVisitPayload {
  patientId: string;
  doctorId: string;
  recordedById?: string;
  visitDate?: Date;
  reason?: string;
  notes?: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodSugarFasting?: number;
  weightKg?: number;
  temperature?: number;
  otherVitalsNotes?: string;
  patientLatitude?: number;
  patientLongitude?: number;
}

export const createVisit = async (payload: CreateVisitPayload) => {
  if (!mongoose.Types.ObjectId.isValid(payload.patientId)) {
    throw new Error("INVALID_PATIENT_ID");
  }
  if (!mongoose.Types.ObjectId.isValid(payload.doctorId)) {
    throw new Error("INVALID_DOCTOR_ID");
  }
  const [patient, doctor] = await Promise.all([
    Patient.findById(payload.patientId),
    Doctor.findById(payload.doctorId)
  ]);
  if (!patient) throw new Error("PATIENT_NOT_FOUND");
  if (!doctor) throw new Error("DOCTOR_NOT_FOUND");
  return Visit.create({
    patient: patient._id,
    doctor: doctor._id,
    recordedBy: payload.recordedById
      ? new mongoose.Types.ObjectId(payload.recordedById)
      : undefined,
    visitDate: payload.visitDate ? new Date(payload.visitDate) : new Date(),
    reason: payload.reason,
    notes: payload.notes,
    bloodPressureSystolic: payload.bloodPressureSystolic,
    bloodPressureDiastolic: payload.bloodPressureDiastolic,
    bloodSugarFasting: payload.bloodSugarFasting,
    weightKg: payload.weightKg,
    temperature: payload.temperature,
    otherVitalsNotes: payload.otherVitalsNotes,
    patientLatitude: payload.patientLatitude,
    patientLongitude: payload.patientLongitude
  });
};

export interface UpdateVisitVitalsPayload {
  reason?: string;
  notes?: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodSugarFasting?: number;
  weightKg?: number;
  temperature?: number;
  otherVitalsNotes?: string;
}

export const updateVisitVitals = async (
  visitId: string,
  payload: UpdateVisitVitalsPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(visitId)) {
    throw new Error("INVALID_VISIT_ID");
  }
  const visit = await Visit.findByIdAndUpdate(
    visitId,
    {
      $set: {
        ...(payload.reason !== undefined && { reason: payload.reason }),
        ...(payload.notes !== undefined && { notes: payload.notes }),
        ...(payload.bloodPressureSystolic !== undefined && { bloodPressureSystolic: payload.bloodPressureSystolic }),
        ...(payload.bloodPressureDiastolic !== undefined && { bloodPressureDiastolic: payload.bloodPressureDiastolic }),
        ...(payload.bloodSugarFasting !== undefined && { bloodSugarFasting: payload.bloodSugarFasting }),
        ...(payload.weightKg !== undefined && { weightKg: payload.weightKg }),
        ...(payload.temperature !== undefined && { temperature: payload.temperature }),
        ...(payload.otherVitalsNotes !== undefined && { otherVitalsNotes: payload.otherVitalsNotes })
      }
    },
    { new: true }
  );
  if (!visit) throw new Error("VISIT_NOT_FOUND");
  return visit;
};

export const getFullPatientHistory = async (patientId: string) => {
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    throw new Error("INVALID_PATIENT_ID");
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error("PATIENT_NOT_FOUND");
  }

  const visits = await Visit.find({ patient: patient._id })
    .sort({ visitDate: -1 })
    .populate("doctor", "_id name email")
    .lean();

  const visitIds = visits.map((v) => v._id);

  const [prescriptions, diagnosticTests] = await Promise.all([
    Prescription.find({ visit: { $in: visitIds } })
      .populate("medicines")
      .lean(),
    DiagnosticTest.find({ visit: { $in: visitIds } }).lean()
  ]);

  const prescriptionsByVisit = new Map<string, unknown[]>();
  prescriptions.forEach((p) => {
    const key = p.visit.toString();
    const current = prescriptionsByVisit.get(key) ?? [];
    current.push(p);
    prescriptionsByVisit.set(key, current);
  });

  const testsByVisit = new Map<string, unknown[]>();
  diagnosticTests.forEach((t) => {
    const key = t.visit.toString();
    const current = testsByVisit.get(key) ?? [];
    current.push({
      ...t,
      price: (t as any).price,
      hasReport: !!(t as any).reportPath,
      reportFileName: (t as any).reportFileName,
      reportUploadedAt: (t as any).reportUploadedAt
    });
    testsByVisit.set(key, current);
  });

  const visitsWithDetails = visits.map((visit) => {
    const key = visit._id.toString();
    return {
      ...visit,
      prescriptions: prescriptionsByVisit.get(key) ?? [],
      diagnosticTests: testsByVisit.get(key) ?? []
    };
  });

  const [documents, pharmacyDispensations] = await Promise.all([
    PatientDocument.find({ patient: patient._id }).sort({ createdAt: -1 }).lean(),
    PharmacyDispensation.find({ patient: patient._id })
      .sort({ createdAt: -1 })
      .populate("dispensedBy", "name")
      .lean()
  ]);

  return {
    patient,
    visits: visitsWithDetails,
    pharmacyDispensations: pharmacyDispensations.map((d) => ({
      id: (d as any)._id.toString(),
      dispensedBy: (d as any).dispensedBy?.name ?? "Pharmacy",
      items: (d as any).items ?? [],
      subtotal: (d as any).subtotal ?? 0,
      totalDiscount: (d as any).totalDiscount ?? 0,
      totalAmount: (d as any).totalAmount ?? 0,
      paidAmount: (d as any).paidAmount ?? 0,
      paymentStatus: (d as any).paymentStatus ?? "UNPAID",
      paidAt: (d as any).paidAt,
      receiptNumber: (d as any).receiptNumber,
      createdAt: (d as any).createdAt
    })),
    documents: documents.map((d) => ({
      id: d._id.toString(),
      originalName: d.originalName,
      mimeType: d.mimeType,
      uploadedAt: d.createdAt,
      ocrText: (d as any).ocrText,
      ocrConfidence: (d as any).ocrConfidence
    }))
  };
};

export interface AddDiagnosticTestItem {
  testName: string;
  price?: number;
}

export const addDiagnosticTestsToVisit = async (
  patientId: string,
  visitId: string,
  tests: AddDiagnosticTestItem[]
): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    throw new Error("INVALID_PATIENT_ID");
  }
  if (!mongoose.Types.ObjectId.isValid(visitId)) {
    throw new Error("INVALID_VISIT_ID");
  }
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Error("TEST_NAMES_REQUIRED");
  }

  const visit = await Visit.findById(visitId).lean();
  if (!visit) {
    throw new Error("VISIT_NOT_FOUND");
  }
  if (visit.patient.toString() !== patientId) {
    throw new Error("VISIT_DOES_NOT_BELONG_TO_PATIENT");
  }

  const validTests = tests
    .filter((t) => t && typeof t.testName === "string" && t.testName.trim().length > 0)
    .map((t) => ({
      testName: t.testName.trim(),
      price: typeof t.price === "number" && t.price >= 0 ? t.price : undefined
    }));
  if (validTests.length === 0) {
    throw new Error("TEST_NAMES_REQUIRED");
  }

  await DiagnosticTest.insertMany(
    validTests.map(({ testName, price }) => ({
      visit: new mongoose.Types.ObjectId(visitId),
      testName,
      ...(price !== undefined && { price })
    }))
  );
};

