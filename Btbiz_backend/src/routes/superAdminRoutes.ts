import { Router } from "express";

import { Doctor } from "../models/Doctor";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { authenticateSuperAdmin } from "../middleware/superAdminMiddleware";

const router = Router();

router.use(authenticateSuperAdmin);

// GET /super-admin/overview
router.get("/overview", async (_req, res) => {
  try {
    const users = await Doctor.find({})
      .select("name email phone role status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const doctors = users.filter((u: any) => u.role === "DOCTOR");
    const assistants = users.filter((u: any) => u.role === "ASSISTANT");
    const labAssistants = users.filter((u: any) => u.role === "LAB_ASSISTANT");
    const pharmacies = users.filter((u: any) => u.role === "PHARMACY");
    const labs = users.filter((u: any) => u.role === "LAB_MANAGER");
    const diagnosticsCount = await DiagnosticTest.countDocuments();

    const toListItem = (u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: Boolean(u.status),
      createdAt: u.createdAt
    });

    res.status(200).json({
      summary: {
        doctors: doctors.length,
        assistants: assistants.length,
        labAssistants: labAssistants.length,
        pharmacies: pharmacies.length,
        labs: labs.length,
        diagnostics: diagnosticsCount
      },
      lists: {
        doctors: doctors.map(toListItem),
        assistants: assistants.map(toListItem),
        labAssistants: labAssistants.map(toListItem),
        pharmacies: pharmacies.map(toListItem),
        labs: labs.map(toListItem)
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/overview error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

