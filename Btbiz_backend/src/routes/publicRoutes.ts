import { Router } from "express";
import mongoose from "mongoose";

import { Doctor } from "../models/Doctor";
import { DoctorNotification } from "../models/DoctorNotification";
import {
  createPatient as createPatientService,
  createVisit as createVisitService,
  findPatientByMobile,
  updatePatient as updatePatientService
} from "../services/patientService";
import { getIo } from "../socket";

const router = Router();

/** Combine appointmentDate (YYYY-MM-DD) and preferredSlot text into a Date with time.
 *  If preferredSlot can't be parsed, falls back to midnight (original behaviour).
 */
function buildVisitDate(appointmentDate: string, preferredSlot?: string): Date {
  const visitDate = new Date(appointmentDate);
  if (!preferredSlot) {
    return visitDate;
  }

  const lower = preferredSlot.toLowerCase();
  // Try to extract first time like "10", "10:30", "10am", "10:30 pm" from the slot string
  const match = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) {
    return visitDate;
  }

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = match[3];

  if (suffix === "pm" && hour < 12) {
    hour += 12;
  } else if (suffix === "am" && hour === 12) {
    hour = 0;
  }

  visitDate.setHours(hour, minute, 0, 0);
  return visitDate;
}

// GET /public/doctors - list consultants for appointment dropdown (with clinic location for distance)
router.get("/doctors", async (_req, res) => {
  try {
    const doctors = await Doctor.find({ role: "DOCTOR" })
      .select("_id name clinicLatitude clinicLongitude clinicAddress")
      .sort({ name: 1 })
      .lean();
    res.status(200).json({
      doctors: doctors.map((d) => ({
        id: (d as any)._id.toString(),
        name: (d as any).name,
        clinicLatitude: (d as any).clinicLatitude,
        clinicLongitude: (d as any).clinicLongitude,
        clinicAddress: (d as any).clinicAddress
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /doctors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /public/patient-by-mobile?mobile=...
router.get("/patient-by-mobile", async (req, res) => {
  try {
    const mobile = req.query.mobile as string | undefined;
    if (!mobile) {
      res.status(400).json({ message: "Query parameter 'mobile' is required" });
      return;
    }
    const patient = await findPatientByMobile(mobile);
    if (!patient) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }
    res.status(200).json({
      patient: {
        id: (patient as any)._id.toString(),
        firstName: patient.firstName,
        lastName: patient.lastName,
        mobileNumber: patient.mobileNumber,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        address: patient.address
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /patient-by-mobile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/appointments/old
router.post("/appointments/old", async (req, res) => {
  try {
    const body = req.body as {
      mobileNumber?: string;
      consultationType?: string;
      consultantId?: string;
      opdNumber?: string;
      appointmentDate?: string;
      preferredSlot?: string;
      patientName?: string;
      gender?: string;
      address?: string;
      patientLatitude?: number;
      patientLongitude?: number;
    };

    if (!body.mobileNumber || !body.consultationType || !body.consultantId || !body.opdNumber || !body.appointmentDate) {
      res.status(400).json({ message: "Missing required fields for old patient appointment" });
      return;
    }

    const patient = await findPatientByMobile(body.mobileNumber);
    if (!patient) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    const updatePayload: any = {};
    if (body.patientName) {
      updatePayload.firstName = body.patientName;
    }
    if (body.gender) {
      updatePayload.gender = body.gender;
    }
    if (body.address) {
      updatePayload.address = body.address;
    }
    if (Object.keys(updatePayload).length > 0) {
      await updatePatientService((patient as any)._id.toString(), updatePayload);
    }

    const visitDate = buildVisitDate(body.appointmentDate, body.preferredSlot);
    const notesParts = [`OPD No: ${body.opdNumber}`];
    if (body.preferredSlot) notesParts.push(`Preferred time: ${body.preferredSlot}`);

    const visit = await createVisitService({
      patientId: (patient as any)._id.toString(),
      doctorId: body.consultantId,
      visitDate,
      reason: body.consultationType,
      notes: notesParts.join(". "),
      patientLatitude: body.patientLatitude,
      patientLongitude: body.patientLongitude
    });

    res.status(201).json({
      appointmentId: (visit as any)._id.toString(),
      patientId: (patient as any)._id.toString()
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /appointments/old error:", error);
    if (error instanceof Error) {
      if (error.message === "DOCTOR_NOT_FOUND" || error.message === "INVALID_DOCTOR_ID") {
        res.status(400).json({ message: "Selected consultant is invalid. Please try again." });
        return;
      }
      if (error.message === "PATIENT_NOT_FOUND" || error.message === "INVALID_PATIENT_ID") {
        res.status(404).json({ message: "Patient not found. Please check the mobile number." });
        return;
      }
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/appointments/new
router.post("/appointments/new", async (req, res) => {
  try {
    const body = req.body as {
      consultantId?: string;
      patientName?: string;
      age?: number;
      gender?: string;
      mobileNumber?: string;
      city?: string;
      address?: string;
      appointmentDate?: string;
      preferredSlot?: string;
      patientLatitude?: number;
      patientLongitude?: number;
    };

    if (!body.consultantId || !body.patientName || !body.mobileNumber || !body.gender || !body.appointmentDate) {
      res.status(400).json({ message: "Missing required fields for new patient appointment" });
      return;
    }

    let patient: any;
    try {
      patient = await createPatientService({
        firstName: body.patientName,
        mobileNumber: body.mobileNumber,
        address: body.address,
        gender: body.gender as "MALE" | "FEMALE" | "OTHER" | undefined
      });
    } catch (createErr) {
      if (createErr instanceof Error && createErr.message === "MOBILE_ALREADY_EXISTS") {
        patient = await findPatientByMobile(body.mobileNumber!);
        if (!patient) {
          res.status(409).json({
            message: "This mobile number is already registered. Please use Old Patient and enter this number to book."
          });
          return;
        }
      } else {
        throw createErr;
      }
    }

    const visitDate = buildVisitDate(body.appointmentDate, body.preferredSlot);
    const notesParts = [`City: ${body.city || ""}`];
    if (body.preferredSlot) notesParts.push(`Preferred time: ${body.preferredSlot}`);

    const visit = await createVisitService({
      patientId: (patient as any)._id.toString(),
      doctorId: body.consultantId,
      visitDate,
      reason: "New appointment",
      notes: notesParts.join(". "),
      patientLatitude: body.patientLatitude,
      patientLongitude: body.patientLongitude
    });

    res.status(201).json({
      appointmentId: (visit as any)._id.toString(),
      patientId: (patient as any)._id.toString()
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /appointments/new error:", error);
    if (error instanceof Error) {
      if (error.message === "DOCTOR_NOT_FOUND" || error.message === "INVALID_DOCTOR_ID") {
        res.status(400).json({ message: "Selected consultant is invalid. Please try again." });
        return;
      }
      if (error.message === "PATIENT_NOT_FOUND" || error.message === "INVALID_PATIENT_ID") {
        res.status(400).json({ message: "Could not create or find patient. Please try again." });
        return;
      }
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

