import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { Doctor, type DoctorRole, type IDoctor } from "../models/Doctor";
import { env } from "../config/env";
import { sendOtpToWhatsapp } from "./whatsappService";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterDoctorPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export interface StartResetPayload {
  phone: string;
}

export interface CompleteResetPayload {
  phone: string;
  otp: string;
  newPassword: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  doctor: {
    id: string;
    name: string;
    email: string;
    role: DoctorRole;
  };
}

const normalizeIndianPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10 && !(digits.startsWith("91") && digits.length === 12)) {
    throw new Error("INVALID_PHONE");
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }
  if (raw.startsWith("+")) {
    return raw;
  }
  return raw;
};

export const registerDoctor = async (
  payload: RegisterDoctorPayload
): Promise<AuthTokenResponse> => {
  const { name, email, password, phone } = payload;

  // Ensure name is stored with "Dr" prefix
  const trimmedName = name.trim();
  const lower = trimmedName.toLowerCase();
  const hasPrefix = lower.startsWith("dr ") || lower.startsWith("dr.");
  const displayName = hasPrefix ? trimmedName : `Dr ${trimmedName}`;

  const normalizedPhone = normalizeIndianPhone(phone);

  const existing = await Doctor.findOne({
    $or: [{ email }, { phone: normalizedPhone }]
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const doctor = await Doctor.create({
    name: displayName,
    email,
    phone: normalizedPhone,
    passwordHash,
    role: "DOCTOR",
    status: false
  });

  const token = generateDoctorToken(doctor);

  return {
    accessToken: token,
    doctor: {
      id: doctor._id.toString(),
      name: doctor.name,
      email: doctor.email,
      role: doctor.role
    }
  };
};

export const loginDoctor = async (
  payload: LoginPayload
): Promise<AuthTokenResponse> => {
  const { email, password } = payload;

  const doctor = await Doctor.findOne({ email });
  if (!doctor) {
    // eslint-disable-next-line no-console
    console.error("loginDoctor: doctor not found for email", email);
    throw new Error("INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(password, doctor.passwordHash);
  if (!isPasswordValid) {
    // eslint-disable-next-line no-console
    console.error("loginDoctor: invalid password for email", email);
    throw new Error("INVALID_CREDENTIALS");
  }

  // Mark doctor as logged in
  if (!doctor.status) {
    doctor.status = true;
    await doctor.save();
  }

  const token = generateDoctorToken(doctor);

  return {
    accessToken: token,
    doctor: {
      id: doctor._id.toString(),
      name: doctor.name,
      email: doctor.email,
      role: doctor.role
    }
  };
};

export interface RegisterLabManagerPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export const registerLabManager = async (
  payload: RegisterLabManagerPayload
): Promise<AuthTokenResponse> => {
  const { name, email, password, phone } = payload;

  const trimmedName = name.trim();
  const normalizedPhone = normalizeIndianPhone(phone);

  const existing = await Doctor.findOne({
    $or: [{ email }, { phone: normalizedPhone }]
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const labManager = await Doctor.create({
    name: trimmedName,
    email,
    phone: normalizedPhone,
    passwordHash,
    role: "LAB_MANAGER",
    status: false
  });

  const token = generateDoctorToken(labManager);

  return {
    accessToken: token,
    doctor: {
      id: labManager._id.toString(),
      name: labManager.name,
      email: labManager.email,
      role: labManager.role
    }
  };
};

export interface RegisterPharmacyPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export const registerPharmacy = async (
  payload: RegisterPharmacyPayload
): Promise<AuthTokenResponse> => {
  const { name, email, password, phone } = payload;

  const trimmedName = name.trim();
  const normalizedPhone = normalizeIndianPhone(phone);

  const existing = await Doctor.findOne({
    $or: [{ email }, { phone: normalizedPhone }]
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const pharmacy = await Doctor.create({
    name: trimmedName,
    email,
    phone: normalizedPhone,
    passwordHash,
    role: "PHARMACY",
    status: false
  });

  const token = generateDoctorToken(pharmacy);

  return {
    accessToken: token,
    doctor: {
      id: pharmacy._id.toString(),
      name: pharmacy.name,
      email: pharmacy.email,
      role: pharmacy.role
    }
  };
};

export const generateDoctorToken = (doctor: IDoctor): string => {
  const payload = {
    doctorId: doctor._id.toString(),
    role: doctor.role as DoctorRole
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as "1h" | "7d" | "24h"
  });
};

export const startDoctorPasswordReset = async (
  payload: StartResetPayload
): Promise<void> => {
  const normalizedPhone = normalizeIndianPhone(payload.phone);

  const doctor = await Doctor.findOne({ phone: normalizedPhone });
  if (!doctor) {
    // Do not reveal whether phone exists
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  doctor.resetOtpHash = otpHash;
  doctor.resetOtpExpiresAt = expires;
  await doctor.save();

  await sendOtpToWhatsapp(normalizedPhone, otp);
};

export const completeDoctorPasswordReset = async (
  payload: CompleteResetPayload
): Promise<void> => {
  const { otp, newPassword } = payload;
  const normalizedPhone = normalizeIndianPhone(payload.phone);

  const doctor = await Doctor.findOne({ phone: normalizedPhone });
  if (
    !doctor ||
    !doctor.resetOtpHash ||
    !doctor.resetOtpExpiresAt ||
    doctor.resetOtpExpiresAt.getTime() < Date.now()
  ) {
    throw new Error("INVALID_OR_EXPIRED_OTP");
  }

  const matches = await bcrypt.compare(otp, doctor.resetOtpHash);
  if (!matches) {
    throw new Error("INVALID_OR_EXPIRED_OTP");
  }

  const saltRounds = 10;
  doctor.passwordHash = await bcrypt.hash(newPassword, saltRounds);
  doctor.resetOtpHash = undefined;
  doctor.resetOtpExpiresAt = undefined;
  await doctor.save();
};

export interface CreateAssistantPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  createdByDoctorId?: string;
}

export const createAssistant = async (
  payload: CreateAssistantPayload
): Promise<void> => {
  const { name, email, phone, password, createdByDoctorId } = payload;

  const trimmedName = name.trim();
  const normalizedPhone = normalizeIndianPhone(phone);

  const existing = await Doctor.findOne({
    $or: [{ email }, { phone: normalizedPhone }]
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await Doctor.create({
    name: trimmedName,
    email,
    phone: normalizedPhone,
    passwordHash,
    role: "ASSISTANT",
    status: false,
    createdByDoctorId: createdByDoctorId
      ? new mongoose.Types.ObjectId(createdByDoctorId)
      : undefined
  });
};

export interface CreateLabAssistantPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  createdByDoctorId: string;
}

export const createLabAssistant = async (
  payload: CreateLabAssistantPayload
): Promise<void> => {
  const { name, email, phone, password, createdByDoctorId } = payload;

  const trimmedName = name.trim();
  const normalizedPhone = normalizeIndianPhone(phone);

  const existing = await Doctor.findOne({
    $or: [{ email }, { phone: normalizedPhone }]
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await Doctor.create({
    name: trimmedName,
    email,
    phone: normalizedPhone,
    passwordHash,
    role: "LAB_ASSISTANT",
    status: false,
    createdByDoctorId: new mongoose.Types.ObjectId(createdByDoctorId)
  });
};

export const listLabAssistants = async (
  doctorId: string
): Promise<Array<{ id: string; name: string; email: string; phone: string; createdAt: string; createdBy: { id: string; name: string; email: string } | null }>> => {
  const assistants = await Doctor.find({
    role: "LAB_ASSISTANT",
    createdByDoctorId: new mongoose.Types.ObjectId(doctorId)
  })
    .sort({ createdAt: -1 })
    .lean();

  const withCreator = await Promise.all(
    assistants.map(async (a) => {
      const createdBy =
        a.createdByDoctorId != null
          ? await Doctor.findById(a.createdByDoctorId)
              .select("_id name email")
              .lean()
          : null;
      return {
        id: (a._id as mongoose.Types.ObjectId).toString(),
        name: a.name,
        email: a.email,
        phone: a.phone ?? "",
        createdAt: (a as { createdAt?: Date }).createdAt
          ? new Date((a as { createdAt?: Date }).createdAt as Date).toISOString()
          : new Date().toISOString(),
        createdBy: createdBy
          ? {
              id: (createdBy._id as mongoose.Types.ObjectId).toString(),
              name: createdBy.name,
              email: createdBy.email
            }
          : null
      };
    })
  );
  return withCreator;
};

