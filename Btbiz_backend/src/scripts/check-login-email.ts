import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

import { env } from "../config/env";
import { Doctor } from "../models/Doctor";

dotenv.config();

const emailArg = process.argv[2] || "tuesdaypharmacy@gmail.com";
const passwordArg = process.argv[3];

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const normalized = emailArg.trim().toLowerCase();

  const byExact = await Doctor.findOne({ email: normalized }).lean();
  const byRaw = await Doctor.findOne({ email: emailArg.trim() }).lean();
  const byRegex = await Doctor.find({
    email: new RegExp(`^${emailArg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).lean();

  // eslint-disable-next-line no-console
  console.log("normalized email:", normalized);
  // eslint-disable-next-line no-console
  console.log("find lowercase:", byExact ? { role: byExact.role, tenantId: byExact.tenantId, status: byExact.status } : null);
  // eslint-disable-next-line no-console
  console.log("find raw:", byRaw ? { email: byRaw.email, role: byRaw.role } : null);
  // eslint-disable-next-line no-console
  console.log("regex count:", byRegex.length, byRegex.map((d) => ({ email: d.email, role: d.role, tenantId: d.tenantId })));

  if (passwordArg && byExact) {
    const doc = await Doctor.findById(byExact._id);
    if (doc) {
      const ok = await bcrypt.compare(passwordArg, doc.passwordHash);
      // eslint-disable-next-line no-console
      console.log("password match:", ok);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
