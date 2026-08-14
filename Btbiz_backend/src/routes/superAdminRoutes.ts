import { Router } from "express";
import mongoose from "mongoose";

import { Doctor } from "../models/Doctor";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { Tenant } from "../models/Tenant";
import { authenticateSuperAdmin } from "../middleware/superAdminMiddleware";
import {
  createPartnerTenant,
  deleteLegacyPartner,
  deletePartnerTenant,
  listTenants,
  updateLegacyPartner,
  updatePartnerTenant,
} from "../services/tenantService";
import { geocodeAllPartnersMissingCoords } from "../services/providerLocationService";
import {
  getIntelligenceSummary,
  IntelligencePeriod,
} from "../services/analyticsService";

const router = Router();

router.use(authenticateSuperAdmin);

const INTELLIGENCE_PERIODS = new Set<IntelligencePeriod>(["today", "7d", "30d"]);

// GET /super-admin/intelligence/summary?period=today|7d|30d
router.get("/intelligence/summary", async (req, res) => {
  try {
    const raw = String(req.query.period ?? "7d").trim() as IntelligencePeriod;
    const period = INTELLIGENCE_PERIODS.has(raw) ? raw : "7d";
    const summary = await getIntelligenceSummary(period);
    res.status(200).json(summary);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/intelligence/summary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /super-admin/overview
router.get("/overview", async (_req, res) => {
  try {
    const users = await Doctor.find({})
      .select("name email phone role status approvalStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const doctors = users.filter((u: any) => u.role === "DOCTOR");
    const assistants = users.filter((u: any) => u.role === "ASSISTANT");
    const labAssistants = users.filter((u: any) => u.role === "LAB_ASSISTANT");
    const pharmacies = users.filter((u: any) => u.role === "PHARMACY");
    const labs = users.filter((u: any) => u.role === "LAB_MANAGER");
    const pendingDoctorApprovals = doctors.filter((u: any) => (u.approvalStatus ?? "APPROVED") === "PENDING");
    const diagnosticsCount = await DiagnosticTest.countDocuments();

    const toListItem = (u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: Boolean(u.status),
      approvalStatus: u.approvalStatus ?? "APPROVED",
      createdAt: u.createdAt
    });

    res.status(200).json({
      summary: {
        doctors: doctors.length,
        assistants: assistants.length,
        labAssistants: labAssistants.length,
        pharmacies: pharmacies.length,
        labs: labs.length,
        diagnostics: diagnosticsCount,
        pendingDoctorApprovals: pendingDoctorApprovals.length
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

// PATCH /super-admin/doctors/:doctorId/approval
router.patch("/doctors/:doctorId/approval", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.doctorId)) {
      res.status(400).json({ message: "Invalid doctor id" });
      return;
    }

    const { approvalStatus } = req.body ?? {};
    if (approvalStatus !== "APPROVED" && approvalStatus !== "REJECTED") {
      res.status(400).json({ message: "approvalStatus must be APPROVED or REJECTED" });
      return;
    }

    const doctor = await Doctor.findById(req.params.doctorId).select("_id role").lean();
    if (!doctor || doctor.role !== "DOCTOR") {
      res.status(404).json({ message: "Doctor not found" });
      return;
    }

    await Doctor.findByIdAndUpdate(req.params.doctorId, {
      approvalStatus
    });
    res.status(200).json({ message: `Doctor ${approvalStatus.toLowerCase()} successfully` });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/doctors approval PATCH error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /super-admin/geocode-partners?kind=pharmacy|lab|all — fill missing map pins for km distance
router.post("/geocode-partners", async (req, res) => {
  try {
    const raw = String(req.query.kind ?? "all").toLowerCase();
    const results: Array<{ kind: string; updated: number; failed: number }> = [];
    if (raw === "pharmacy" || raw === "all") {
      results.push({ kind: "pharmacy", ...(await geocodeAllPartnersMissingCoords("pharmacy")) });
    }
    if (raw === "lab" || raw === "all") {
      results.push({ kind: "lab", ...(await geocodeAllPartnersMissingCoords("lab")) });
    }
    if (results.length === 0) {
      res.status(400).json({ message: "kind must be pharmacy, lab, or all" });
      return;
    }
    res.status(200).json({ results });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/geocode-partners error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /super-admin/tenants?type=PHARMACY|LAB|CLINIC
router.get("/tenants", async (req, res) => {
  try {
    const raw = String(req.query.type || "").toUpperCase();
    const type =
      raw === "PHARMACY" || raw === "LAB" || raw === "CLINIC" ? raw : undefined;
    const tenants = await listTenants(type as "PHARMACY" | "LAB" | "CLINIC" | undefined);
    res.status(200).json({ tenants });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/tenants GET error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /super-admin/tenants — create pharmacy or lab tenant + owner login
router.post("/tenants", async (req, res) => {
  try {
    const { tenantType, name, slug, email, password, phone, address } = req.body ?? {};
    if (tenantType !== "PHARMACY" && tenantType !== "LAB") {
      res.status(400).json({ message: "tenantType must be PHARMACY or LAB" });
      return;
    }
    if (!name?.trim() || !email?.trim() || !password || !phone?.trim()) {
      res.status(400).json({ message: "name, email, password, and phone are required" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const result = await createPartnerTenant({
      tenantType,
      name: String(name),
      slug: slug ? String(slug) : undefined,
      email: String(email),
      password: String(password),
      phone: String(phone),
      address,
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error?.message === "SLUG_ALREADY_EXISTS") {
      res.status(409).json({ message: "Slug already in use. Pick another name or slug." });
      return;
    }
    if (error?.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("super-admin/tenants POST error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /super-admin/tenants/:id — update tenant + owner
router.patch("/tenants/:id", async (req, res) => {
  try {
    const { name, slug, email, password, phone, status, address } = req.body ?? {};
    if (
      status &&
      status !== "ACTIVE" &&
      status !== "SUSPENDED" &&
      status !== "TRIAL"
    ) {
      res.status(400).json({ message: "status must be ACTIVE, SUSPENDED, or TRIAL" });
      return;
    }
    if (password && String(password).length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const tenant = await updatePartnerTenant(req.params.id, {
      name: name ? String(name) : undefined,
      slug: slug ? String(slug) : undefined,
      email: email ? String(email) : undefined,
      password: password ? String(password) : undefined,
      phone: phone ? String(phone) : undefined,
      status,
      address,
    });

    res.status(200).json({ tenant });
  } catch (error: any) {
    if (error?.message === "TENANT_NOT_FOUND") {
      res.status(404).json({ message: "Tenant not found" });
      return;
    }
    if (error?.message === "SLUG_ALREADY_EXISTS") {
      res.status(409).json({ message: "Slug already in use" });
      return;
    }
    if (error?.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("super-admin/tenants PATCH error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /super-admin/tenants/:id
router.delete("/tenants/:id", async (req, res) => {
  try {
    await deletePartnerTenant(req.params.id);
    res.status(200).json({ message: "Tenant deleted" });
  } catch (error: any) {
    if (error?.message === "TENANT_NOT_FOUND") {
      res.status(404).json({ message: "Tenant not found" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("super-admin/tenants DELETE error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /super-admin/partners/:doctorId — legacy self-signup (no tenant row)
router.patch("/partners/:doctorId", async (req, res) => {
  try {
    const { name, email, password, phone, status } = req.body ?? {};
    if (password && String(password).length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }
    await updateLegacyPartner(req.params.doctorId, {
      name: name ? String(name) : undefined,
      email: email ? String(email) : undefined,
      password: password ? String(password) : undefined,
      phone: phone ? String(phone) : undefined,
      status: typeof status === "boolean" ? status : undefined,
    });
    res.status(200).json({ message: "Partner updated" });
  } catch (error: any) {
    if (error?.message === "PARTNER_NOT_FOUND") {
      res.status(404).json({ message: "Partner not found" });
      return;
    }
    if (error?.message === "USE_TENANT_ENDPOINT") {
      res.status(400).json({ message: "This partner uses tenant management. Edit from tenant list." });
      return;
    }
    if (error?.message === "EMAIL_ALREADY_EXISTS") {
      res.status(409).json({ message: "Email or phone already registered" });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("super-admin/partners PATCH error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /super-admin/partners/:doctorId
router.delete("/partners/:doctorId", async (req, res) => {
  try {
    await deleteLegacyPartner(req.params.doctorId);
    res.status(200).json({ message: "Partner deleted" });
  } catch (error: any) {
    if (error?.message === "PARTNER_NOT_FOUND") {
      res.status(404).json({ message: "Partner not found" });
      return;
    }
    if (error?.message === "USE_TENANT_ENDPOINT") {
      res.status(400).json({ message: "This partner uses tenant management. Delete from tenant list." });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("super-admin/partners DELETE error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /super-admin/tenants/:id/status
router.patch("/tenants/:id/status", async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "TRIAL") {
      res.status(400).json({ message: "status must be ACTIVE, SUSPENDED, or TRIAL" });
      return;
    }
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();
    if (!tenant) {
      res.status(404).json({ message: "Tenant not found" });
      return;
    }
    if (tenant.ownerUserId) {
      await Doctor.findByIdAndUpdate(tenant.ownerUserId, {
        status: status === "ACTIVE",
      });
    }
    res.status(200).json({ tenant });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("super-admin/tenants PATCH error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

