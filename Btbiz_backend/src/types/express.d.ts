import { IDoctor } from "../models/Doctor";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {
      /** Set by tenantMiddleware when tenant context is resolved. */
      tenantId?: string;
      doctor?: Pick<IDoctor, "_id" | "email" | "name" | "role" | "tenantId" | "tenantType">;
      patient?: {
        _id: unknown;
        firstName: string;
        lastName?: string;
        mobileNumber: string;
        tenantId?: string;
      };
      superAdmin?: {
        email: string;
        name: string;
        role: "SUPER_ADMIN";
      };
    }
  }
}

export {};

