import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { Patient } from "../models/Patient";
import { PatientOtpSession } from "../models/PatientOtpSession";
import { findPatientsByMobile } from "./patientService";
import { sendOtpToWhatsapp } from "./whatsappService";
import { env } from "../config/env";

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const SELECTION_TOKEN_EXPIRY = "5m";

function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length !== 10) {
    throw new Error("INVALID_MOBILE");
  }
  return `+91${last10}`;
}

export async function sendPatientOtp(mobile: string): Promise<void> {
  const normalized = normalizeMobile(mobile);
  const patients = await findPatientsByMobile(normalized);
  if (!patients || patients.length === 0) {
    throw new Error("NO_PROFILE_FOUND");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await PatientOtpSession.deleteMany({ mobile: normalized });
  await PatientOtpSession.create({ mobile: normalized, otpHash, expiresAt });
  await sendOtpToWhatsapp(normalized, otp);
}

export interface VerifyPatientOtpResult {
  token?: string;
  patient?: { id: string; firstName: string; lastName?: string };
  selectionToken?: string;
  patients?: Array<{ id: string; firstName: string; lastName?: string }>;
}

export async function verifyPatientOtp(
  mobile: string,
  otp: string
): Promise<VerifyPatientOtpResult> {
  const normalized = normalizeMobile(mobile);
  // TODO: Remove in production – testing bypass for OTP
  const TEST_OTP = "123456";
  const isTestOtp = otp.trim() === TEST_OTP;

  if (!isTestOtp) {
    const session = await PatientOtpSession.findOne({
      mobile: normalized,
      expiresAt: { $gt: new Date() },
    });

    if (
      !session ||
      !session.otpHash ||
      !(await bcrypt.compare(otp, session.otpHash))
    ) {
      throw new Error("INVALID_OR_EXPIRED_OTP");
    }
    await PatientOtpSession.deleteOne({ _id: session._id });
  }

  const patients = await findPatientsByMobile(normalized);
  if (!patients || patients.length === 0) {
    throw new Error("NO_PROFILE_FOUND");
  }

  const patientList = patients.map((p: any) => ({
    id: p._id.toString(),
    firstName: p.firstName,
    lastName: p.lastName,
  }));

  if (patientList.length === 1) {
    const patient = patientList[0];
    const token = jwt.sign(
      { patientId: patient.id, type: "patient" },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn } as any
    );
    return { token, patient };
  }

  const selectionToken = jwt.sign(
    {
      purpose: "patient_select",
      mobile: normalized,
      patientIds: patientList.map((p) => p.id),
      type: "patient_select",
    },
    env.jwt.secret,
    { expiresIn: SELECTION_TOKEN_EXPIRY } as any
  );
  return { selectionToken, patients: patientList };
}

export async function selectPatientProfile(
  selectionToken: string,
  patientId: string
): Promise<{ token: string; patient: { id: string; firstName: string; lastName?: string } }> {
  let decoded: any;
  try {
    decoded = jwt.verify(selectionToken, env.jwt.secret);
  } catch {
    throw new Error("INVALID_OR_EXPIRED_SELECTION");
  }
  if (decoded.type !== "patient_select" || !decoded.patientIds?.includes(patientId)) {
    throw new Error("INVALID_SELECTION");
  }

  const patient = await Patient.findById(patientId)
    .select("_id firstName lastName")
    .lean();
  if (!patient) {
    throw new Error("PATIENT_NOT_FOUND");
  }

  const token = jwt.sign(
    { patientId, type: "patient" },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn } as jwt.SignOptions
  );
  return {
    token,
    patient: {
      id: (patient as any)._id.toString(),
      firstName: (patient as any).firstName,
      lastName: (patient as any).lastName,
    },
  };
}
