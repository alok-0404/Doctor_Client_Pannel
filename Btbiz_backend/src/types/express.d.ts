import { IDoctor } from "../models/Doctor";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {
      doctor?: Pick<IDoctor, "_id" | "email" | "name" | "role">;
      superAdmin?: {
        email: string;
        name: string;
        role: "SUPER_ADMIN";
      };
    }
  }
}

export {};

