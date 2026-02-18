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

// GET /public/doctors - list consultants for appointment dropdown
router.get("/doctors", async (_req, res) => {
  try {
    const doctors = await Doctor.find({ role: "DOCTOR" })
      .select("_id name")
      .sort({ name: 1 })
      .lean();
    res.status(200).json({
      doctors: doctors.map((d) => ({
        id: d._id.toString(),
        name: d.name
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

    const visitDate = new Date(body.appointmentDate);
    const notesParts = [`OPD No: ${body.opdNumber}`];
    if (body.preferredSlot) notesParts.push(`Preferred time: ${body.preferredSlot}`);

    const visit = await createVisitService({
      patientId: (patient as any)._id.toString(),
      doctorId: body.consultantId,
      visitDate,
      reason: body.consultationType,
      notes: notesParts.join(". ")
    });

    const patientName =
      [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient";
    const notification = await DoctorNotification.create({
      doctor: new mongoose.Types.ObjectId(body.consultantId),
      patient: visit.patient,
      patientName,
      visit: visit._id,
      status: "unread"
    });
    const io = getIo();
    if (io) {
      io.to(`doctor:${body.consultantId}`).emit("patientReferred", {
        notificationId: notification._id.toString(),
        patientId: visit.patient.toString(),
        patientName,
        visitId: visit._id.toString()
      });
    }

    res.status(201).json({
      appointmentId: (visit as any)._id.toString(),
      patientId: (patient as any)._id.toString()
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /appointments/old error:", error);
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
    };

    if (!body.consultantId || !body.patientName || !body.mobileNumber || !body.gender || !body.appointmentDate) {
      res.status(400).json({ message: "Missing required fields for new patient appointment" });
      return;
    }

    const patient = await createPatientService({
      firstName: body.patientName,
      mobileNumber: body.mobileNumber,
      address: body.address,
      gender: body.gender as "MALE" | "FEMALE" | "OTHER" | undefined
    });

    const visitDate = new Date(body.appointmentDate);
    const notesParts = [`City: ${body.city || ""}`];
    if (body.preferredSlot) notesParts.push(`Preferred time: ${body.preferredSlot}`);

    const visit = await createVisitService({
      patientId: (patient as any)._id.toString(),
      doctorId: body.consultantId,
      visitDate,
      reason: "New appointment",
      notes: notesParts.join(". ")
    });

    const patientName = body.patientName?.trim() || "Patient";
    const notification = await DoctorNotification.create({
      doctor: new mongoose.Types.ObjectId(body.consultantId),
      patient: visit.patient,
      patientName,
      visit: visit._id,
      status: "unread"
    });
    const io = getIo();
    if (io) {
      io.to(`doctor:${body.consultantId}`).emit("patientReferred", {
        notificationId: notification._id.toString(),
        patientId: visit.patient.toString(),
        patientName,
        visitId: visit._id.toString()
      });
    }

    res.status(201).json({
      appointmentId: (visit as any)._id.toString(),
      patientId: (patient as any)._id.toString()
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /appointments/new error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

