import { Router } from "express";
import mongoose from "mongoose";

import { authenticateDoctor } from "../middleware/authMiddleware";
import { Doctor } from "../models/Doctor";
import { Visit } from "../models/Visit";

const router = Router();

router.use(authenticateDoctor);

function mapVisitToAppointment(v: any): Record<string, unknown> {
  const patient = v.patient;
  const patientId = patient?._id ? patient._id.toString() : (v.patient as mongoose.Types.ObjectId).toString();
  const patientName =
    patient?.firstName != null
      ? [patient.firstName, patient.lastName || ""].join(" ").trim()
      : "Patient";
  return {
    id: (v._id as mongoose.Types.ObjectId).toString(),
    patientId,
    patientName,
    patientMobile: patient?.mobileNumber ?? undefined,
    visitDate: v.visitDate,
    reason: v.reason,
    notes: v.notes
  };
}

// GET /appointments/doctor/today - today's appointments for logged-in doctor
router.get("/doctor/today", async (req, res) => {
  try {
    const doctorId = req.doctor?._id?.toString();
    if (!doctorId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.doctor?.role !== "DOCTOR") {
      res.status(403).json({ message: "Only doctors can view their appointments" });
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const visits = await Visit.find({
      doctor: new mongoose.Types.ObjectId(doctorId),
      visitDate: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ visitDate: 1 })
      .populate("patient", "firstName lastName mobileNumber")
      .lean();

    res.status(200).json({
      appointments: visits.map(mapVisitToAppointment)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("appointments/doctor/today error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /appointments/assistant/doctor-today - for assistant: linked doctor's today appointments (with patient mobile for calling/messaging)
router.get("/assistant/doctor-today", async (req, res) => {
  try {
    if (req.doctor?.role !== "ASSISTANT") {
      res.status(403).json({ message: "Only assistants can use this endpoint" });
      return;
    }

    const assistantDoc = await Doctor.findById(req.doctor._id).select("createdByDoctorId").lean();
    const doctorId = (assistantDoc as any)?.createdByDoctorId?.toString();
    if (!doctorId) {
      res.status(400).json({ message: "Assistant is not linked to a doctor" });
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const visits = await Visit.find({
      doctor: new mongoose.Types.ObjectId(doctorId),
      visitDate: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ visitDate: 1 })
      .populate("patient", "firstName lastName mobileNumber")
      .lean();

    res.status(200).json({
      doctorId,
      appointments: visits.map(mapVisitToAppointment)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("appointments/assistant/doctor-today error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

