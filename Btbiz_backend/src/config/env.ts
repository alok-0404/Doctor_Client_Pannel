import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/btbiz_doctor",
  jwt: {
    secret: process.env.JWT_SECRET || "dev_jwt_secret_change_me",
    expiresIn: process.env.JWT_EXPIRES_IN || "1h"
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || "superadmin@medigraph.com",
    password: process.env.SUPER_ADMIN_PASSWORD || "Admin@123",
    name: process.env.SUPER_ADMIN_NAME || "Super Admin"
  }
} as const;

if (!env.jwt.secret) {
  // In production you may want to throw an error instead
  // eslint-disable-next-line no-console
  console.warn("JWT_SECRET is not set. Using a default insecure secret.");
}

