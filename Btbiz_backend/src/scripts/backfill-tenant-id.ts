/**
 * Step 8 — Assign tenantId to existing records (one-time / idempotent).
 *
 * Usage:
 *   npm run backfill:tenant:dry   # preview counts only
 *   npm run backfill:tenant       # apply updates
 *
 * Env:
 *   MONGODB_URI
 *   DEFAULT_CLINIC_TENANT_ID  (default: clinic_default_001)
 *   DEFAULT_CLINIC_NAME       (default: Default Clinic)
 *   DEFAULT_CLINIC_SLUG       (default: default-clinic)
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

import { env } from "../config/env";
import { Doctor, type DoctorRole } from "../models/Doctor";
import { Tenant } from "../models/Tenant";
import { Patient } from "../models/Patient";
import { Visit } from "../models/Visit";
import { Prescription } from "../models/Prescription";
import { PatientDocument } from "../models/PatientDocument";
import { FamilyAccount } from "../models/FamilyAccount";
import { FamilyMember } from "../models/FamilyMember";
import { DoctorNotification } from "../models/DoctorNotification";
import { Medicine } from "../models/Medicine";
import { DiagnosticTest } from "../models/DiagnosticTest";
import { PharmacyDispensation } from "../models/PharmacyDispensation";

const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_CLINIC_ID =
  (process.env.DEFAULT_CLINIC_TENANT_ID || "clinic_default_001").trim();
const DEFAULT_CLINIC_NAME =
  (process.env.DEFAULT_CLINIC_NAME || "Default Clinic").trim();
const DEFAULT_CLINIC_SLUG =
  (process.env.DEFAULT_CLINIC_SLUG || "default-clinic").trim().toLowerCase();

const CLINIC_STAFF_ROLES: DoctorRole[] = ["DOCTOR", "ASSISTANT", "LAB_ASSISTANT"];

const missingTenantFilter = {
  $or: [
    { tenantId: { $exists: false } },
    { tenantId: null },
    { tenantId: "" },
  ],
};

type Stats = Record<string, number>;

const stats: Stats = {};

function bump(key: string, n = 1): void {
  stats[key] = (stats[key] ?? 0) + n;
}

async function ensureDefaultClinicTenant(): Promise<string> {
  const existingById = await Tenant.findById(DEFAULT_CLINIC_ID).lean();
  if (existingById) {
    // eslint-disable-next-line no-console
    console.log(`Default clinic tenant exists: ${DEFAULT_CLINIC_ID}`);
    return DEFAULT_CLINIC_ID;
  }

  const slugTaken = await Tenant.findOne({ slug: DEFAULT_CLINIC_SLUG }).lean();
  if (slugTaken) {
    // eslint-disable-next-line no-console
    console.log(
      `Using existing tenant for slug "${DEFAULT_CLINIC_SLUG}": ${slugTaken._id}`
    );
    return slugTaken._id;
  }

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log(`[dry-run] Would create clinic tenant ${DEFAULT_CLINIC_ID}`);
    return DEFAULT_CLINIC_ID;
  }

  await Tenant.create({
    _id: DEFAULT_CLINIC_ID,
    tenantType: "CLINIC",
    name: DEFAULT_CLINIC_NAME,
    slug: DEFAULT_CLINIC_SLUG,
    status: "ACTIVE",
    subscription: { plan: "FREE", status: "ACTIVE" },
  });
  bump("tenant_created");
  // eslint-disable-next-line no-console
  console.log(`Created default clinic tenant: ${DEFAULT_CLINIC_ID}`);
  return DEFAULT_CLINIC_ID;
}

async function buildDoctorTenantMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const doctors = await Doctor.find({}).select("_id tenantId role").lean();
  for (const d of doctors) {
    const id = d._id.toString();
    if (typeof d.tenantId === "string" && d.tenantId.trim()) {
      map.set(id, d.tenantId.trim());
    }
  }
  return map;
}

async function backfillClinicStaffDoctors(defaultClinicId: string): Promise<void> {
  const filter = {
    role: { $in: CLINIC_STAFF_ROLES },
    ...missingTenantFilter,
  };
  const count = await Doctor.countDocuments(filter);
  bump("doctors_clinic_missing", count);
  if (count === 0 || DRY_RUN) return;

  const result = await Doctor.updateMany(filter, {
    $set: { tenantId: defaultClinicId, tenantType: "CLINIC" },
  });
  bump("doctors_clinic_updated", result.modifiedCount);
}

async function resolvePatientTenantId(
  patientId: mongoose.Types.ObjectId,
  doctorMap: Map<string, string>,
  defaultClinicId: string
): Promise<string> {
  const latestVisit = await Visit.findOne({ patient: patientId })
    .sort({ visitDate: -1 })
    .select("doctor")
    .lean();
  if (latestVisit?.doctor) {
    const fromDoctor = doctorMap.get(latestVisit.doctor.toString());
    if (fromDoctor) return fromDoctor;
  }
  return defaultClinicId;
}

async function backfillPatients(
  defaultClinicId: string,
  doctorMap: Map<string, string>
): Promise<void> {
  const cursor = Patient.find(missingTenantFilter).select("_id").cursor();
  const batch: mongoose.AnyBulkWriteOperation[] = [];

  for await (const doc of cursor) {
    const tenantId = await resolvePatientTenantId(doc._id, doctorMap, defaultClinicId);
    bump("patients_missing");
    if (DRY_RUN) continue;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { tenantId } },
      },
    });
    if (batch.length >= 500) {
      const res = await Patient.bulkWrite(batch);
      bump("patients_updated", res.modifiedCount);
      batch.length = 0;
    }
  }
  if (!DRY_RUN && batch.length > 0) {
    const res = await Patient.bulkWrite(batch);
    bump("patients_updated", res.modifiedCount);
  }
}

async function backfillFromDoctorField(
  model: mongoose.Model<unknown>,
  label: string,
  doctorField: "doctor" | "dispensedBy" | "uploadedBy",
  defaultClinicId: string,
  doctorMap: Map<string, string>
): Promise<void> {
  const missing = await model.countDocuments(missingTenantFilter);
  bump(`${label}_missing`, missing);
  if (missing === 0 || DRY_RUN) return;

  const docs = await model
    .find(missingTenantFilter)
    .select(`_id ${doctorField}`)
    .lean();

  const batch: mongoose.AnyBulkWriteOperation[] = [];
  for (const doc of docs as Array<{ _id: mongoose.Types.ObjectId; [key: string]: unknown }>) {
    const doctorId = doc[doctorField];
    let tenantId = defaultClinicId;
    if (doctorId) {
      const fromMap = doctorMap.get(String(doctorId));
      if (fromMap) tenantId = fromMap;
    }
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { tenantId } },
      },
    });
  }
  if (batch.length > 0) {
    const res = await model.bulkWrite(batch);
    bump(`${label}_updated`, res.modifiedCount);
  }
}

async function backfillFromVisitRef(
  model: mongoose.Model<unknown>,
  label: string,
  visitField: string,
  defaultClinicId: string
): Promise<void> {
  const missing = await model.countDocuments(missingTenantFilter);
  bump(`${label}_missing`, missing);
  if (missing === 0 || DRY_RUN) return;

  const docs = await model
    .find(missingTenantFilter)
    .select(`_id ${visitField}`)
    .lean();

  const visitIds = [
    ...new Set(
      (docs as Array<Record<string, unknown>>)
        .map((d) => d[visitField])
        .filter(Boolean)
        .map(String)
    ),
  ];
  const visits = await Visit.find({ _id: { $in: visitIds } })
    .select("_id tenantId")
    .lean();
  const visitTenant = new Map(
    visits.map((v) => [
      v._id.toString(),
      (v as { tenantId?: string }).tenantId || defaultClinicId,
    ])
  );

  const batch: mongoose.AnyBulkWriteOperation[] = [];
  for (const doc of docs as Array<{ _id: mongoose.Types.ObjectId; [key: string]: unknown }>) {
    const visitId = String(doc[visitField] ?? "");
    const tenantId = visitTenant.get(visitId) || defaultClinicId;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { tenantId } },
      },
    });
  }
  if (batch.length > 0) {
    const res = await model.bulkWrite(batch);
    bump(`${label}_updated`, res.modifiedCount);
  }
}

async function backfillFromPatientRef(
  model: mongoose.Model<unknown>,
  label: string,
  patientField: string,
  defaultClinicId: string
): Promise<void> {
  const missing = await model.countDocuments(missingTenantFilter);
  bump(`${label}_missing`, missing);
  if (missing === 0 || DRY_RUN) return;

  const docs = await model
    .find(missingTenantFilter)
    .select(`_id ${patientField}`)
    .lean();

  const patientIds = [
    ...new Set(
      (docs as Array<Record<string, unknown>>)
        .map((d) => d[patientField])
        .filter(Boolean)
        .map(String)
    ),
  ];
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select("_id tenantId")
    .lean();
  const patientTenant = new Map(
    patients.map((p) => [
      p._id.toString(),
      (p as { tenantId?: string }).tenantId || defaultClinicId,
    ])
  );

  const batch: mongoose.AnyBulkWriteOperation[] = [];
  for (const doc of docs as Array<{ _id: mongoose.Types.ObjectId; [key: string]: unknown }>) {
    const patientId = String(doc[patientField] ?? "");
    const tenantId = patientTenant.get(patientId) || defaultClinicId;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { tenantId } },
      },
    });
  }
  if (batch.length > 0) {
    const res = await model.bulkWrite(batch);
    bump(`${label}_updated`, res.modifiedCount);
  }
}

async function backfillVisits(
  defaultClinicId: string,
  doctorMap: Map<string, string>
): Promise<void> {
  await backfillFromDoctorField(
    Visit as mongoose.Model<unknown>,
    "visits",
    "doctor",
    defaultClinicId,
    doctorMap
  );
}

async function backfillFamilyFromPatients(defaultClinicId: string): Promise<void> {
  for (const label of ["family_accounts", "family_members"] as const) {
    const model =
      label === "family_accounts"
        ? (FamilyAccount as mongoose.Model<unknown>)
        : (FamilyMember as mongoose.Model<unknown>);
    const missing = await model.countDocuments(missingTenantFilter);
    bump(`${label}_missing`, missing);
    if (missing === 0 || DRY_RUN) continue;

    if (label === "family_accounts") {
      const accounts = await FamilyAccount.find(missingTenantFilter).select("_id phone").lean();
      const batch: mongoose.AnyBulkWriteOperation[] = [];
      for (const acc of accounts) {
        const member = await FamilyMember.findOne({ account: acc._id })
          .select("patient")
          .lean();
        let tenantId = defaultClinicId;
        if (member?.patient) {
          const patient = await Patient.findById(member.patient).select("tenantId").lean();
          const pt = (patient as { tenantId?: string } | null)?.tenantId;
          if (pt) tenantId = pt;
        }
        batch.push({
          updateOne: {
            filter: { _id: acc._id },
            update: { $set: { tenantId } },
          },
        });
      }
      if (batch.length > 0) {
        const res = await FamilyAccount.bulkWrite(batch);
        bump(`${label}_updated`, res.modifiedCount);
      }
      continue;
    }

    const members = await FamilyMember.find(missingTenantFilter).select("_id patient").lean();
    const batch: mongoose.AnyBulkWriteOperation[] = [];
    for (const m of members) {
      let tenantId = defaultClinicId;
      if (m.patient) {
        const patient = await Patient.findById(m.patient).select("tenantId").lean();
        const pt = (patient as { tenantId?: string } | null)?.tenantId;
        if (pt) tenantId = pt;
      }
      batch.push({
        updateOne: {
          filter: { _id: m._id },
          update: { $set: { tenantId } },
        },
      });
    }
    if (batch.length > 0) {
      const res = await FamilyMember.bulkWrite(batch);
      bump(`${label}_updated`, res.modifiedCount);
    }
  }
}

async function backfillBulkDefault(
  model: mongoose.Model<unknown>,
  label: string,
  defaultClinicId: string
): Promise<void> {
  const count = await model.countDocuments(missingTenantFilter);
  bump(`${label}_missing`, count);
  if (count === 0 || DRY_RUN) return;
  const result = await model.updateMany(missingTenantFilter, {
    $set: { tenantId: defaultClinicId },
  });
  bump(`${label}_updated`, result.modifiedCount);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(DRY_RUN ? "=== DRY RUN (no writes) ===" : "=== TENANT BACKFILL ===");
  // eslint-disable-next-line no-console
  console.log(`MongoDB: ${env.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@")}`);

  await mongoose.connect(env.mongoUri);

  const defaultClinicId = await ensureDefaultClinicTenant();
  await backfillClinicStaffDoctors(defaultClinicId);

  const doctorMap = await buildDoctorTenantMap();
  // Refresh map after doctor updates
  if (!DRY_RUN) {
    const refreshed = await buildDoctorTenantMap();
    refreshed.forEach((v, k) => doctorMap.set(k, v));
  }

  await backfillPatients(defaultClinicId, doctorMap);
  await backfillVisits(defaultClinicId, doctorMap);
  await backfillFromVisitRef(
    Prescription as mongoose.Model<unknown>,
    "prescriptions",
    "visit",
    defaultClinicId
  );
  await backfillFromPatientRef(
    PatientDocument as mongoose.Model<unknown>,
    "patient_documents",
    "patient",
    defaultClinicId
  );
  await backfillFromVisitRef(
    DiagnosticTest as mongoose.Model<unknown>,
    "diagnostic_tests",
    "visit",
    defaultClinicId
  );
  await backfillFromDoctorField(
    DoctorNotification as mongoose.Model<unknown>,
    "doctor_notifications",
    "doctor",
    defaultClinicId,
    doctorMap
  );
  await backfillFromDoctorField(
    PharmacyDispensation as mongoose.Model<unknown>,
    "pharmacy_dispensations",
    "dispensedBy",
    defaultClinicId,
    doctorMap
  );
  await backfillBulkDefault(
    Medicine as mongoose.Model<unknown>,
    "medicines",
    defaultClinicId
  );
  await backfillFamilyFromPatients(defaultClinicId);

  // eslint-disable-next-line no-console
  console.log("\n--- Summary ---");
  Object.entries(stats)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => {
      // eslint-disable-next-line no-console
      console.log(`  ${k}: ${v}`);
    });

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log("\nRe-run without --dry-run to apply changes.");
    // eslint-disable-next-line no-console
    console.log("After backfill, set TENANT_LEGACY_ORPHAN_READ=false in production.");
  } else {
    // eslint-disable-next-line no-console
    console.log("\nBackfill complete.");
    // eslint-disable-next-line no-console
    console.log("Recommended: set TENANT_LEGACY_ORPHAN_READ=false after verifying data.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Backfill failed:", err);
  process.exit(1);
});
