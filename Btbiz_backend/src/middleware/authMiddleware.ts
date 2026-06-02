import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import { Doctor, type DoctorRole } from "../models/Doctor";
import { Patient } from "../models/Patient";
import { env } from "../config/env";

interface DoctorJwtPayload extends JwtPayload {
  doctorId: string;
  role: DoctorRole;
  tenantId?: string;
  tenantType?: string;
}

interface PatientJwtPayload extends JwtPayload {
  patientId: string;
  type: "patient";
  tenantId?: string;
}

export const authenticatePatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authorization header missing or malformed" });
      return;
    }
    const token = authHeader.split(" ")[1];
    let decoded: PatientJwtPayload;
    try {
      decoded = jwt.verify(token, env.jwt.secret) as PatientJwtPayload;
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
    if (decoded.type !== "patient" || !decoded.patientId) {
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }
    const patient = await Patient.findById(decoded.patientId)
      .select("_id firstName lastName mobileNumber")
      .lean();
    if (!patient) {
      res.status(401).json({ message: "Patient not found for token" });
      return;
    }
    req.patient = {
      _id: (patient as any)._id,
      firstName: (patient as any).firstName,
      lastName: (patient as any).lastName,
      mobileNumber: (patient as any).mobileNumber,
      ...(decoded.tenantId ? { tenantId: decoded.tenantId } : {}),
    };
    if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
    }
    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Patient auth middleware error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const authenticateDoctor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authorization header missing or malformed" });
      return;
    }

    const token = authHeader.split(" ")[1];

    let decoded: DoctorJwtPayload;
    try {
      decoded = jwt.verify(token, env.jwt.secret) as DoctorJwtPayload;
    } catch (err) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    if (!decoded.doctorId) {
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }

    const doctor = await Doctor.findById(decoded.doctorId).select(
      "_id name email role tenantId tenantType"
    );
    if (!doctor) {
      res.status(401).json({ message: "Doctor not found for token" });
      return;
    }

    const doctorTenantId = doctor.tenantId?.trim() || undefined;
    if (
      decoded.tenantId &&
      doctorTenantId &&
      decoded.tenantId !== doctorTenantId
    ) {
      res.status(403).json({ message: "Invalid tenant context" });
      return;
    }

    req.doctor = {
      _id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      role: doctor.role,
      ...(doctorTenantId ? { tenantId: doctorTenantId } : {}),
      ...(doctor.tenantType ? { tenantType: doctor.tenantType } : {}),
    };

    if (doctorTenantId) {
      req.tenantId = doctorTenantId;
    } else if (decoded.tenantId) {
      req.tenantId = decoded.tenantId;
    }

    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

