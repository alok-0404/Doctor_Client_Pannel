import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { Doctor } from "../models/Doctor";
import { Patient } from "../models/Patient";
import { Visit } from "../models/Visit";
import {
  createPatient as createPatientService,
  createVisit as createVisitService,
  findPatientByMobile,
  updatePatient as updatePatientService
} from "../services/patientService";
import { FamilyAccount } from "../models/FamilyAccount";
import { FamilyMember } from "../models/FamilyMember";
import { PatientTestRequest } from "../models/PatientTestRequest";
import { env } from "../config/env";
import { completedAgeYears } from "../utils/age";
import { getDailyAppointmentQuotaSnapshot } from "../utils/appointmentQuota";

const router = Router();

const SELF_MIN_AGE_MSG =
  "For Self, age must be 18 years or above. Please enter a valid date of birth.";
let patientMobileIndexChecked = false;

async function ensurePatientMobileNonUniqueIndex(): Promise<void> {
  if (patientMobileIndexChecked) return;
  const indexes = await Patient.collection.indexes();
  const uniqueMobileIndexes = indexes.filter(
    (idx: any) =>
      idx?.unique === true &&
      idx?.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.mobileNumber === 1
  );

  for (const idx of uniqueMobileIndexes) {
    if (typeof idx.name === "string" && idx.name) {
      await Patient.collection.dropIndex(idx.name);
    }
  }

  const hasPlainMobileIndex = indexes.some(
    (idx: any) =>
      idx?.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.mobileNumber === 1 &&
      !idx.unique
  );
  if (!hasPlainMobileIndex) {
    await Patient.collection.createIndex({ mobileNumber: 1 }, { name: "mobileNumber_1" });
  }

  // verify again; only then cache checked=true
  const verifyIndexes = await Patient.collection.indexes();
  const stillUnique = verifyIndexes.some(
    (idx: any) =>
      idx?.unique === true &&
      idx?.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.mobileNumber === 1
  );
  if (stillUnique) {
    throw new Error("PATIENT_MOBILE_UNIQUE_INDEX_STILL_PRESENT");
  }

  patientMobileIndexChecked = true;
}

/**
 * Ensure each family member in an account points to a distinct Patient document.
 * If multiple members are linked to the same patient (legacy behavior),
 * keep the first member on original patient and clone patient profile for others.
 */
async function ensureDistinctPatientsPerFamilyAccount(accountId: mongoose.Types.ObjectId): Promise<void> {
  await ensurePatientMobileNonUniqueIndex();
  const members = await FamilyMember.find({
    account: accountId,
    isDeleted: { $ne: true }
  }).sort({ createdAt: 1 });
  const seenPatientIdToMember = new Map<string, string>();

  for (const member of members) {
    const patientId = member.patient?.toString();
    if (!patientId) continue;

    if (!seenPatientIdToMember.has(patientId)) {
      seenPatientIdToMember.set(patientId, member._id.toString());
      continue;
    }

    const sourcePatient = await Patient.findById(member.patient).lean();
    if (!sourcePatient) continue;

    let clonedPatient: any;
    try {
      clonedPatient = await Patient.create({
        firstName: sourcePatient.firstName,
        lastName: sourcePatient.lastName,
        mobileNumber: sourcePatient.mobileNumber,
        dateOfBirth: sourcePatient.dateOfBirth,
        gender: member.gender ?? sourcePatient.gender,
        address: sourcePatient.address,
        bloodGroup: sourcePatient.bloodGroup,
        previousHealthHistory: sourcePatient.previousHealthHistory,
        emergencyContactName: sourcePatient.emergencyContactName,
        emergencyContactPhone: sourcePatient.emergencyContactPhone
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        patientMobileIndexChecked = false;
        await ensurePatientMobileNonUniqueIndex();
        clonedPatient = await Patient.create({
          firstName: sourcePatient.firstName,
          lastName: sourcePatient.lastName,
          mobileNumber: sourcePatient.mobileNumber,
          dateOfBirth: sourcePatient.dateOfBirth,
          gender: member.gender ?? sourcePatient.gender,
          address: sourcePatient.address,
          bloodGroup: sourcePatient.bloodGroup,
          previousHealthHistory: sourcePatient.previousHealthHistory,
          emergencyContactName: sourcePatient.emergencyContactName,
          emergencyContactPhone: sourcePatient.emergencyContactPhone
        });
      } else {
        throw error;
      }
    }

    member.patient = clonedPatient._id as any;
    await member.save();
  }
}

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

// GET /public/doctors/:doctorId/appointment-quota?date=YYYY-MM-DD
// Remaining slots for online (portal) vs walk-in for that IST calendar day.
router.get("/doctors/:doctorId/appointment-quota", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const dateStr = (req.query.date as string | undefined)?.trim();
    if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
      res.status(400).json({ message: "Invalid doctor id" });
      return;
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ message: "Query ?date=YYYY-MM-DD is required" });
      return;
    }
    const visitDate = new Date(`${dateStr}T12:00:00+05:30`);
    const snapshot = await getDailyAppointmentQuotaSnapshot(doctorId, visitDate);
    res.status(200).json(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /doctors/:id/appointment-quota error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/family/login-or-create
// Body: { mobileNumber: string }
// Creates or finds a FamilyAccount for the given phone.
router.post("/family/login-or-create", async (req, res) => {
  try {
    const { mobileNumber } = req.body as { mobileNumber?: string };
    if (!mobileNumber) {
      res.status(400).json({ message: "mobileNumber is required" });
      return;
    }

    const trimmed = mobileNumber.trim();
    if (!trimmed) {
      res.status(400).json({ message: "mobileNumber is required" });
      return;
    }

    let accountDoc = await FamilyAccount.findOne({ phone: trimmed });
    if (!accountDoc) {
      accountDoc = await FamilyAccount.create({ phone: trimmed });
    }

    res.status(200).json({
      account: {
        id: accountDoc._id.toString(),
        phone: accountDoc.phone
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/login-or-create error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /public/family/members?mobile=... | accountId=...
router.get("/family/members", async (req, res) => {
  try {
    const mobile = (req.query.mobile as string | undefined)?.trim();
    const accountId = req.query.accountId as string | undefined;

    let accountFilter: any = null;
    if (accountId && accountId.trim()) {
      if (!mongoose.isValidObjectId(accountId)) {
        res.status(400).json({ message: "Invalid accountId" });
        return;
      }
      accountFilter = { _id: new mongoose.Types.ObjectId(accountId) };
    } else if (mobile) {
      accountFilter = { phone: mobile };
    } else {
      res.status(400).json({ message: "Either mobile or accountId is required" });
      return;
    }

    const account = await FamilyAccount.findOne(accountFilter).lean();
    if (!account) {
      res.status(404).json({ message: "Family account not found" });
      return;
    }

    await ensureDistinctPatientsPerFamilyAccount((account as any)._id);

    const members = await FamilyMember.find({
      account: (account as any)._id,
      isDeleted: { $ne: true }
    })
      .populate("patient", "firstName lastName mobileNumber gender dateOfBirth address")
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      account: {
        id: (account as any)._id.toString(),
        phone: account.phone
      },
      members: members.map((m: any) => ({
        id: m._id.toString(),
        fullName: m.fullName,
        relation: m.relation,
        gender: m.gender,
        dateOfBirth: m.dateOfBirth,
        patientId: m.patient?._id?.toString() ?? null,
        patient: m.patient
          ? {
              id: m.patient._id.toString(),
              firstName: m.patient.firstName,
              lastName: m.patient.lastName,
              mobileNumber: m.patient.mobileNumber,
              gender: m.patient.gender,
              dateOfBirth: m.patient.dateOfBirth,
              address: m.patient.address
            }
          : null
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/members error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** Map public API relation string to stored enum (same set as FamilyMember schema). */
function normalizePublicFamilyRelation(relation: string): string {
  const v = relation.trim().toUpperCase();
  if (v === "WIFE" || v === "HUSBAND") return "SPOUSE";
  const allowed = new Set([
    "SELF",
    "SPOUSE",
    "SON",
    "DAUGHTER",
    "FATHER",
    "MOTHER",
    "BROTHER",
    "SISTER",
    "OTHER"
  ]);
  return allowed.has(v) ? v : "OTHER";
}

// POST /public/family/members
// Body: { accountId, fullName, relation, gender?, dateOfBirth?, address? }
router.post("/family/members", async (req, res) => {
  try {
    await ensurePatientMobileNonUniqueIndex();

    const body = req.body as {
      accountId?: string;
      fullName?: string;
      relation?: string;
      gender?: "MALE" | "FEMALE" | "OTHER";
      dateOfBirth?: string;
      address?: string;
    };

    if (!body.accountId || !mongoose.isValidObjectId(body.accountId)) {
      res.status(400).json({ message: "Valid accountId is required" });
      return;
    }
    if (!body.fullName) {
      res.status(400).json({ message: "fullName is required" });
      return;
    }
    if (!body.relation) {
      res.status(400).json({ message: "relation is required" });
      return;
    }

    const relationNorm = normalizePublicFamilyRelation(body.relation);

    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        res.status(400).json({ message: "Invalid date of birth" });
        return;
      }
      if (relationNorm === "SELF" && completedAgeYears(dob) < 18) {
        res.status(400).json({ message: SELF_MIN_AGE_MSG });
        return;
      }
    }

    const account = await FamilyAccount.findById(body.accountId).lean();
    if (!account) {
      res.status(404).json({ message: "Family account not found" });
      return;
    }

    // One primary (SELF) profile per family account — do not create duplicate Patient rows.
    if (relationNorm === "SELF") {
      const existingSelf = await FamilyMember.findOne({
        account: (account as any)._id,
        relation: "SELF",
        isDeleted: { $ne: true }
      }).lean();

      if (existingSelf) {
        res.status(200).json({
          member: {
            id: (existingSelf as any)._id.toString(),
            fullName: (existingSelf as any).fullName,
            relation: (existingSelf as any).relation,
            gender: (existingSelf as any).gender,
            dateOfBirth: (existingSelf as any).dateOfBirth,
            patientId: (existingSelf as any).patient.toString()
          },
          alreadyExists: true,
          message: "Primary (SELF) profile already exists for this family account."
        });
        return;
      }
    }

    const nameParts = body.fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || undefined;

    // Always create a dedicated patient profile for each family member.
    // Family members can share mobile number but must not share medical records.
    let patient: any;
    try {
      patient = await Patient.create({
        firstName,
        lastName,
        mobileNumber: (account as any).phone,
        gender: body.gender,
        address: body.address
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        patientMobileIndexChecked = false;
        await ensurePatientMobileNonUniqueIndex();
        patient = await Patient.create({
          firstName,
          lastName,
          mobileNumber: (account as any).phone,
          gender: body.gender,
          address: body.address
        });
      } else {
        throw error;
      }
    }

    const member = await FamilyMember.create({
      account: (account as any)._id,
      patient: (patient as any)._id,
      fullName: body.fullName.trim(),
      relation: relationNorm as any,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined
    });

    res.status(201).json({
      member: {
        id: (member as any)._id.toString(),
        fullName: member.fullName,
        relation: member.relation,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth,
        patientId: (patient as any)._id.toString()
      },
      alreadyExists: false
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/members POST error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /public/family/members/:id
// Body: { fullName?, relation?, gender?, dateOfBirth?, address? }
router.patch("/family/members/:id", async (req, res) => {
  try {
    const memberId = req.params.id;
    if (!mongoose.isValidObjectId(memberId)) {
      res.status(400).json({ message: "Invalid member id" });
      return;
    }

    const body = req.body as {
      fullName?: string;
      relation?: string;
      gender?: "MALE" | "FEMALE" | "OTHER";
      dateOfBirth?: string;
      address?: string;
    };

    const member = await FamilyMember.findOne({
      _id: new mongoose.Types.ObjectId(memberId),
      isDeleted: { $ne: true }
    });
    if (!member) {
      res.status(404).json({ message: "Family member not found" });
      return;
    }

    const nextRelation = (body.relation ?? member.relation) as string;
    let nextDob: Date | undefined;
    if (body.dateOfBirth !== undefined) {
      if (!body.dateOfBirth) {
        nextDob = undefined;
      } else {
        const parsed = new Date(body.dateOfBirth);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ message: "Invalid date of birth" });
          return;
        }
        nextDob = parsed;
      }
    } else {
      nextDob = member.dateOfBirth ? new Date(member.dateOfBirth) : undefined;
    }
    if (nextRelation === "SELF" && nextDob && completedAgeYears(nextDob) < 18) {
      res.status(400).json({ message: SELF_MIN_AGE_MSG });
      return;
    }

    if (body.fullName && body.fullName.trim()) {
      member.fullName = body.fullName.trim();
      const parts = member.fullName.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || undefined;
      await Patient.findByIdAndUpdate(
        member.patient,
        {
          $set: {
            firstName,
            ...(lastName !== undefined && { lastName })
          }
        },
        { new: false }
      );
    }
    if (body.relation) {
      member.relation = body.relation as any;
    }
    if (body.gender) {
      member.gender = body.gender;
      await Patient.findByIdAndUpdate(
        member.patient,
        { $set: { gender: body.gender } },
        { new: false }
      );
    }
    if (body.dateOfBirth) {
      member.dateOfBirth = new Date(body.dateOfBirth);
    }
    if (body.address !== undefined) {
      await Patient.findByIdAndUpdate(
        member.patient,
        { $set: { address: body.address } },
        { new: false }
      );
    }

    await member.save();

    res.status(200).json({
      member: {
        id: (member as any)._id.toString(),
        fullName: member.fullName,
        relation: member.relation,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth,
        patientId: (member as any).patient.toString()
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/members PATCH error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /public/family/members/:id
// Soft delete: only hide the FamilyMember link; underlying Patient/visits remain
// so doctor-side history is preserved and member can be restored later if needed.
router.delete("/family/members/:id", async (req, res) => {
  try {
    const memberId = req.params.id;
    if (!mongoose.isValidObjectId(memberId)) {
      res.status(400).json({ message: "Invalid member id" });
      return;
    }
    const result = await FamilyMember.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(memberId),
        isDeleted: { $ne: true }
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date()
        }
      },
      { new: false }
    );
    if (!result) {
      res.status(404).json({ message: "Family member not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/members DELETE error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /public/family/member-history/:id
// Returns a limited view of a family member's health history for public portal.
router.get("/family/member-history/:id", async (req, res) => {
  try {
    const memberId = req.params.id;
    if (!mongoose.isValidObjectId(memberId)) {
      res.status(400).json({ message: "Invalid member id" });
      return;
    }

    const member = await FamilyMember.findOne({
      _id: new mongoose.Types.ObjectId(memberId),
      isDeleted: { $ne: true }
    })
      .populate("patient", "firstName lastName mobileNumber gender dateOfBirth address")
      .lean();
    if (!member || !member.patient) {
      res.status(404).json({ message: "Family member not found" });
      return;
    }

    const patientId = (member.patient as any)._id;
    const visits = await Visit.find({ patient: patientId })
      .sort({ visitDate: -1 })
      .populate("doctor", "name")
      .lean();

    res.status(200).json({
      member: {
        id: (member as any)._id.toString(),
        fullName: (member as any).fullName,
        relation: (member as any).relation,
        gender: (member as any).gender,
        dateOfBirth: (member as any).dateOfBirth,
        patient: {
          id: patientId.toString(),
          firstName: (member.patient as any).firstName,
          lastName: (member.patient as any).lastName,
          mobileNumber: (member.patient as any).mobileNumber,
          gender: (member.patient as any).gender,
          dateOfBirth: (member.patient as any).dateOfBirth,
          address: (member.patient as any).address
        }
      },
      visits: visits.map((v: any) => ({
        id: v._id.toString(),
        visitDate: v.visitDate,
        reason: v.reason,
        notes: v.notes,
        doctorName: v.doctor?.name ?? undefined
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/member-history error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/family/member-profile-token
// Body: { accountId, memberId }
// Returns patient JWT for opening full patient profile from Family Booking.
router.post("/family/member-profile-token", async (req, res) => {
  try {
    const body = req.body as { accountId?: string; memberId?: string };
    if (!body.accountId || !mongoose.isValidObjectId(body.accountId)) {
      res.status(400).json({ message: "Valid accountId is required" });
      return;
    }
    if (!body.memberId || !mongoose.isValidObjectId(body.memberId)) {
      res.status(400).json({ message: "Valid memberId is required" });
      return;
    }

    const member = await FamilyMember.findOne({
      _id: body.memberId,
      account: body.accountId,
      isDeleted: { $ne: true }
    })
      .populate("patient", "firstName lastName")
      .lean();

    if (!member || !member.patient) {
      res.status(404).json({ message: "Family member not found for this account" });
      return;
    }

    const patientId = (member.patient as any)._id.toString();
    const token = jwt.sign(
      { patientId, type: "patient" },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn as any }
    );

    res.status(200).json({
      token,
      patient: {
        id: patientId,
        firstName: (member.patient as any).firstName,
        lastName: (member.patient as any).lastName
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /family/member-profile-token error:", error);
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

    // If the same mobile is linked to multiple family members, the old flow becomes ambiguous.
    // In that case, ask the client to use the family flow (member selection).
    const digits = mobile.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    const candidates = new Set<string>();
    if (mobile) candidates.add(mobile);
    if (last10) {
      candidates.add(last10);
      candidates.add(`+91${last10}`);
    }
    const matchCount = await Patient.countDocuments({
      mobileNumber: { $in: Array.from(candidates) }
    });
    if (matchCount > 1) {
      res.status(409).json({
        message:
          "Multiple family members are linked to this mobile number. Please use Family Booking to select the member."
      });
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
      patientLongitude: body.patientLongitude,
      appointmentChannel: "ONLINE_BOOKING"
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
      if (error.message === "DAILY_ONLINE_QUOTA_FULL") {
        res.status(409).json({
          message:
            "Online booking slots for this doctor on this date are full. Please choose another date or contact the clinic."
        });
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
      patientLongitude: body.patientLongitude,
      appointmentChannel: "ONLINE_BOOKING"
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
      if (error.message === "DAILY_ONLINE_QUOTA_FULL") {
        res.status(409).json({
          message:
            "Online booking slots for this doctor on this date are full. Please choose another date or contact the clinic."
        });
        return;
      }
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/patient/tests (bot-compatible)
// Supports both shapes:
// - { patientId, tests: [{ testName }], serviceType, scheduledDate, scheduledTime, preferredDateTime }
// - { patientId, testName, serviceType, preferredDateTime }
router.post("/patient/tests", async (req, res) => {
  try {
    const body = req.body as {
      patientId?: string;
      testName?: string;
      tests?: Array<{ testName?: string; notes?: string }>;
      notes?: string;
      serviceType?: "LAB_VISIT" | "HOME_SERVICE" | "HOME_COLLECTION";
      paymentMode?: "ONLINE" | "OFFLINE";
      preferredDateTime?: string;
      scheduledDate?: string;
      scheduledTime?: string;
      expectedFulfillmentMinutes?: number;
      preferredProviderId?: string;
    };

    if (!body.patientId || !mongoose.isValidObjectId(body.patientId)) {
      res.status(400).json({ message: "Valid patientId is required" });
      return;
    }

    let patient = await Patient.findById(body.patientId).select("_id").lean();
    if (!patient) {
      // Bot flow may occasionally send FamilyMember id; resolve it to linked patient.
      const member = await FamilyMember.findById(body.patientId).select("patient").lean();
      const linkedPatientId = (member as any)?.patient?.toString?.();
      if (linkedPatientId && mongoose.isValidObjectId(linkedPatientId)) {
        patient = await Patient.findById(linkedPatientId).select("_id").lean();
      }
    }
    if (!patient) {
      res.status(404).json({ message: "Patient not found for provided patientId/familyMemberId" });
      return;
    }

    const namesFromArray = (body.tests ?? [])
      .map((t) => (t?.testName ?? "").trim())
      .filter(Boolean);
    const fallbackSingle = (body.testName ?? "").trim();
    const testNames = namesFromArray.length ? namesFromArray : (fallbackSingle ? [fallbackSingle] : []);

    if (!testNames.length) {
      res.status(400).json({ message: "At least one testName is required" });
      return;
    }

    let preferredDateTime: Date | undefined;
    if (body.preferredDateTime) {
      const parsed = new Date(body.preferredDateTime);
      if (!Number.isNaN(parsed.getTime())) preferredDateTime = parsed;
    }
    if (!preferredDateTime && body.scheduledDate && body.scheduledTime) {
      const parsed = new Date(`${body.scheduledDate}T${body.scheduledTime}`);
      if (!Number.isNaN(parsed.getTime())) preferredDateTime = parsed;
    }

    const serviceType =
      body.serviceType === "HOME_SERVICE" || body.serviceType === "HOME_COLLECTION"
        ? "HOME_SERVICE"
        : "LAB_VISIT";
    const paymentMode = body.paymentMode === "ONLINE" ? "ONLINE" : "OFFLINE";

    const created = await Promise.all(
      testNames.map((testName) =>
        PatientTestRequest.create({
          patient: patient._id,
          testName,
          notes: body.notes?.trim?.() || undefined,
          source: "patient",
          serviceType,
          paymentMode,
          preferredDateTime,
          expectedFulfillmentMinutes:
            typeof body.expectedFulfillmentMinutes === "number" && body.expectedFulfillmentMinutes > 0
              ? Math.round(body.expectedFulfillmentMinutes)
              : undefined,
          preferredProvider:
            body.preferredProviderId && mongoose.isValidObjectId(body.preferredProviderId)
              ? new mongoose.Types.ObjectId(body.preferredProviderId)
              : undefined,
        })
      )
    );

    res.status(201).json({
      requestId: created[0]?._id?.toString?.() ?? "",
      requestIds: created.map((r) => r._id.toString()),
      createdCount: created.length,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /patient/tests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /public/appointments/family
// Create an appointment (Visit) for a specific patientId (family member).
router.post("/appointments/family", async (req, res) => {
  try {
    const body = req.body as {
      patientId?: string;
      consultantId?: string;
      appointmentDate?: string;
      preferredSlot?: string;
      consultationType?: string;
      opdNumber?: string;
      patientName?: string;
      gender?: string;
      address?: string;
      patientLatitude?: number;
      patientLongitude?: number;
    };

    if (!body.patientId || !mongoose.isValidObjectId(body.patientId)) {
      res.status(400).json({ message: "Valid patientId is required" });
      return;
    }
    if (!body.consultantId || !body.appointmentDate) {
      res.status(400).json({ message: "Missing required fields for family appointment" });
      return;
    }

    const patient = await Patient.findById(body.patientId);
    if (!patient) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    const updatePayload: any = {};
    if (body.patientName) {
      const trimmed = body.patientName.trim();
      if (trimmed) {
        const parts = trimmed.split(" ");
        updatePayload.firstName = parts[0];
        updatePayload.lastName = parts.slice(1).join(" ") || undefined;
      }
    }
    if (body.gender) updatePayload.gender = body.gender;
    if (body.address) updatePayload.address = body.address;

    if (Object.keys(updatePayload).length > 0) {
      await updatePatientService((patient as any)._id.toString(), updatePayload);
    }

    const visitDate = buildVisitDate(body.appointmentDate, body.preferredSlot);
    const notesParts: string[] = [];
    if (body.opdNumber) notesParts.push(`OPD No: ${body.opdNumber}`);
    if (body.preferredSlot) notesParts.push(`Preferred time: ${body.preferredSlot}`);

    const visit = await createVisitService({
      patientId: (patient as any)._id.toString(),
      doctorId: body.consultantId,
      visitDate,
      reason: body.consultationType || "Family appointment",
      notes: notesParts.join(". ") || undefined,
      patientLatitude: body.patientLatitude,
      patientLongitude: body.patientLongitude,
      appointmentChannel: "ONLINE_BOOKING"
    });

    // Doctor is notified only when assistant refers (vitals/refer flow), not on online booking.

    res.status(201).json({
      appointmentId: (visit as any)._id.toString(),
      patientId: (patient as any)._id.toString()
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public /appointments/family error:", error);
    if (error instanceof Error) {
      if (error.message === "DOCTOR_NOT_FOUND" || error.message === "INVALID_DOCTOR_ID") {
        res.status(400).json({ message: "Selected consultant is invalid. Please try again." });
        return;
      }
      if (error.message === "PATIENT_NOT_FOUND" || error.message === "INVALID_PATIENT_ID") {
        res.status(404).json({ message: "Patient not found. Please check the selected member." });
        return;
      }
      if (error.message === "DAILY_ONLINE_QUOTA_FULL") {
        res.status(409).json({
          message:
            "Online booking slots for this doctor on this date are full. Please choose another date or contact the clinic."
        });
        return;
      }
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /public/appointments/:appointmentId/location
// Allows the patient device to keep updating their live location for the appointment day.
router.patch("/appointments/:appointmentId/location", async (req, res) => {
  try {
    const appointmentId = req.params.appointmentId;
    if (!mongoose.isValidObjectId(appointmentId)) {
      res.status(400).json({ message: "Invalid appointmentId" });
      return;
    }

    const body = req.body as {
      patientLatitude?: number;
      patientLongitude?: number;
      accuracyMeters?: number;
    };

    if (typeof body.patientLatitude !== "number" || typeof body.patientLongitude !== "number") {
      res.status(400).json({ message: "patientLatitude and patientLongitude are required" });
      return;
    }

    const updated = await Visit.findByIdAndUpdate(
      appointmentId,
      {
        $set: {
          patientLatitude: body.patientLatitude,
          patientLongitude: body.patientLongitude,
          ...(typeof body.accuracyMeters === "number" && { patientLocationAccuracyMeters: body.accuracyMeters })
        }
      },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404).json({ message: "Appointment not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("public PATCH /appointments/:id/location error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

