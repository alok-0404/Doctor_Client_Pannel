import { Request, Response } from "express";

import { getIo } from "../socket";
import { Doctor } from "../models/Doctor";
import {
  completeDoctorPasswordReset,
  createAssistant,
  createLabAssistant,
  listLabAssistants as listLabAssistantsService,
  loginDoctor,
  registerDoctor,
  registerLabManager,
  registerPharmacy,
  startDoctorPasswordReset
} from "../services/authService";

export const doctorRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!name || !email || !password || !phone) {
      res.status(400).json({ message: "Name, email, phone and password are required" });
      return;
    }

    const authResponse = await registerDoctor({ name, email, password, phone });

    res.status(201).json({
      message: "Registration successful",
      accessToken: authResponse.accessToken,
      doctor: authResponse.doctor
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }

    if (error instanceof Error && error.message === "INVALID_PHONE") {
      res.status(400).json({ message: "Invalid phone format" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("doctorRegister error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const labManagerRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!name || !email || !password || !phone) {
      res.status(400).json({ message: "Name, email, phone and password are required" });
      return;
    }

    const authResponse = await registerLabManager({ name, email, password, phone });

    res.status(201).json({
      message: "Lab manager registration successful",
      accessToken: authResponse.accessToken,
      doctor: authResponse.doctor
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }

    if (error instanceof Error && error.message === "INVALID_PHONE") {
      res.status(400).json({ message: "Invalid phone format" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("labManagerRegister error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const pharmacyRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!name || !email || !password || !phone) {
      res.status(400).json({ message: "Name, email, phone and password are required" });
      return;
    }

    const authResponse = await registerPharmacy({ name, email, password, phone });

    res.status(201).json({
      message: "Medicine / Pharmacy registration successful",
      accessToken: authResponse.accessToken,
      doctor: authResponse.doctor
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }

    if (error instanceof Error && error.message === "INVALID_PHONE") {
      res.status(400).json({ message: "Invalid phone format" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("pharmacyRegister error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const doctorLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const authResponse = await loginDoctor({ email, password });

    res.status(200).json({
      message: "Login successful",
      accessToken: authResponse.accessToken,
      doctor: authResponse.doctor
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("doctorLogin error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const doctorLogout = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.doctor?._id) {
      await Doctor.findByIdAndUpdate(req.doctor._id, { status: false });
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("doctorLogout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const startDoctorForgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phone } = req.body as { phone?: string };

    if (!phone) {
      res.status(400).json({ message: "Phone is required" });
      return;
    }

    await startDoctorPasswordReset({ phone });

    res.status(200).json({ message: "If the number exists, an OTP has been sent." });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("startDoctorForgotPassword error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const completeDoctorForgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phone, otp, newPassword } = req.body as {
      phone?: string;
      otp?: string;
      newPassword?: string;
    };

    if (!phone || !otp || !newPassword) {
      res
        .status(400)
        .json({ message: "Phone, OTP and new password are required" });
      return;
    }

    await completeDoctorPasswordReset({ phone, otp, newPassword });

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_OR_EXPIRED_OTP") {
      res.status(400).json({ message: "Invalid or expired OTP" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("completeDoctorForgotPassword error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getDoctorProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.doctor) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const payload: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdByDoctorId?: string;
    referredToDoctorName?: string;
    availabilityStatus?: string;
    unavailableReason?: string;
    unavailableUntil?: string;
    clinicLatitude?: number;
    clinicLongitude?: number;
    clinicAddress?: string;
  } = {
    id: req.doctor._id.toString(),
    name: req.doctor.name,
    email: req.doctor.email,
    role: req.doctor.role
  };

  if (req.doctor.role === "ASSISTANT" || req.doctor.role === "LAB_ASSISTANT") {
    const assistant = await Doctor.findById(req.doctor._id)
      .select("createdByDoctorId")
      .populate("createdByDoctorId", "name availabilityStatus unavailableReason unavailableUntil")
      .lean();
    if (assistant?.createdByDoctorId) {
      const doc = assistant.createdByDoctorId as any;
      payload.createdByDoctorId = doc._id.toString();
      payload.referredToDoctorName = doc.name;
      payload.availabilityStatus = doc.availabilityStatus ?? "available";
      payload.unavailableReason = doc.unavailableReason;
      payload.unavailableUntil = doc.unavailableUntil ? new Date(doc.unavailableUntil).toISOString() : undefined;
    }
  } else if (req.doctor.role === "DOCTOR") {
    const doc = await Doctor.findById(req.doctor._id)
      .select("availabilityStatus unavailableReason unavailableUntil clinicLatitude clinicLongitude clinicAddress")
      .lean();
    if (doc) {
      payload.availabilityStatus = doc.availabilityStatus ?? "available";
      payload.unavailableReason = doc.unavailableReason;
      payload.unavailableUntil = doc.unavailableUntil ? new Date(doc.unavailableUntil).toISOString() : undefined;
      payload.clinicLatitude = (doc as any).clinicLatitude;
      payload.clinicLongitude = (doc as any).clinicLongitude;
      payload.clinicAddress = (doc as any).clinicAddress;
    }
  }

  res.status(200).json({
    doctor: payload
  });
};

export const updateDoctorClinic = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.doctor || req.doctor.role !== "DOCTOR") {
    res.status(403).json({ message: "Only doctors can update clinic location" });
    return;
  }
  const body = req.body as { clinicLatitude?: number; clinicLongitude?: number; clinicAddress?: string };
  await Doctor.findByIdAndUpdate(req.doctor._id, {
    ...(typeof body.clinicLatitude === "number" && { clinicLatitude: body.clinicLatitude }),
    ...(typeof body.clinicLongitude === "number" && { clinicLongitude: body.clinicLongitude }),
    ...(body.clinicAddress !== undefined && { clinicAddress: body.clinicAddress })
  });
  res.status(200).json({ message: "Clinic location updated" });
};

export const createAssistantAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, email, phone, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    if (!name || !email || !phone || !password) {
      res
        .status(400)
        .json({ message: "Name, email, phone and password are required" });
      return;
    }

    await createAssistant({
      name,
      email,
      phone,
      password,
      createdByDoctorId: req.doctor?._id?.toString()
    });

    res.status(201).json({ message: "Assistant created successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }

    if (error instanceof Error && error.message === "INVALID_PHONE") {
      res.status(400).json({ message: "Invalid phone format" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("createAssistantAccount error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listAssistants = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const assistants = await Doctor.find({ role: "ASSISTANT" })
      .select("name email phone createdAt createdByDoctorId")
      .populate("createdByDoctorId", "name email");

    res.status(200).json({
      assistants: assistants.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        createdBy: c.createdByDoctorId
          ? {
              id: (c.createdByDoctorId as any)._id.toString(),
              name: (c.createdByDoctorId as any).name,
              email: (c.createdByDoctorId as any).email
            }
          : null
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("listAssistants error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createLabAssistantAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, email, phone, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    if (!name || !email || !phone || !password) {
      res
        .status(400)
        .json({ message: "Name, email, phone and password are required" });
      return;
    }

    if (req.doctor?.role !== "DOCTOR" && req.doctor?.role !== "LAB_MANAGER") {
      res.status(403).json({ message: "Only doctors or lab managers can create lab assistants" });
      return;
    }

    const creatorId = req.doctor?._id?.toString();
    if (!creatorId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    await createLabAssistant({
      name,
      email,
      phone,
      password,
      createdByDoctorId: creatorId
    });

    res.status(201).json({ message: "Lab assistant created successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }

    if (error instanceof Error && error.message === "INVALID_PHONE") {
      res.status(400).json({ message: "Invalid phone format" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("createLabAssistantAccount error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listLabAssistants = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (req.doctor?.role !== "DOCTOR" && req.doctor?.role !== "LAB_MANAGER") {
      res.status(403).json({ message: "Only doctors or lab managers can list lab assistants" });
      return;
    }

    const creatorId = req.doctor?._id?.toString();
    if (!creatorId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const assistants = await listLabAssistantsService(creatorId);
    res.status(200).json({ labAssistants: assistants });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("listLabAssistants error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// --- Doctor availability (for "mark unavailable/busy") ---

export const updateDoctorAvailability = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.doctor) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (req.doctor.role !== "DOCTOR") {
    res.status(403).json({ message: "Only doctors can update availability" });
    return;
  }

  const doctorId = req.doctor._id?.toString();
  if (!doctorId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { availabilityStatus, unavailableReason, unavailableUntil } = req.body as {
    availabilityStatus?: "available" | "unavailable" | "busy";
    unavailableReason?: string;
    unavailableUntil?: string;
  };

  if (!availabilityStatus || !["available", "unavailable", "busy"].includes(availabilityStatus)) {
    res.status(400).json({ message: "availabilityStatus must be one of: available, unavailable, busy" });
    return;
  }

  try {
    const update: Record<string, unknown> = {
      availabilityStatus,
      unavailableReason: unavailableReason ?? null,
      unavailableUntil: unavailableUntil ? new Date(unavailableUntil) : null
    };
    const doc = await Doctor.findByIdAndUpdate(
      doctorId,
      { $set: update },
      { new: true }
    ).select("name availabilityStatus unavailableReason unavailableUntil").lean();

    if (!doc) {
      res.status(404).json({ message: "Doctor not found" });
      return;
    }

    const io = getIo();
    if (io) {
      io.to(`assistants-of-doctor:${doctorId}`).emit("doctorAvailabilityChanged", {
        doctorId,
        doctorName: doc.name,
        availabilityStatus: doc.availabilityStatus,
        unavailableReason: doc.unavailableReason ?? undefined,
        unavailableUntil: doc.unavailableUntil ? new Date(doc.unavailableUntil).toISOString() : undefined
      });
    }

    res.status(200).json({
      availabilityStatus: doc.availabilityStatus,
      unavailableReason: doc.unavailableReason ?? undefined,
      unavailableUntil: doc.unavailableUntil ? new Date(doc.unavailableUntil).toISOString() : undefined
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("updateDoctorAvailability error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

