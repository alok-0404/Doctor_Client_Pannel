import { Router } from "express";
import mongoose from "mongoose";

import { authenticateDoctor } from "../middleware/authMiddleware";
import { Visit } from "../models/Visit";
import { Patient } from "../models/Patient";

const router = Router();

router.use(authenticateDoctor);

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
      .populate("patient", "firstName lastName")
      .lean();

    res.status(200).json({
      appointments: visits.map((v) => ({
        id: (v._id as mongoose.Types.ObjectId).toString(),
        patientId: (v.patient as mongoose.Types.ObjectId | any)._id
          ? ((v.patient as any)._id as mongoose.Types.ObjectId).toString()
          : (v.patient as mongoose.Types.ObjectId).toString(),
        patientName:
          (v as any).patient && (v as any).patient.firstName
            ? [`${(v as any).patient.firstName}`, (v as any).patient.lastName || ""].join(" ").trim()
            : "Patient",
        visitDate: (v.visitDate as Date),
        reason: v.reason,
        notes: v.notes
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("appointments/doctor/today error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

