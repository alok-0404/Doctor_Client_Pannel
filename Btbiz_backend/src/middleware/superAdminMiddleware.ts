import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import { env } from "../config/env";

interface SuperAdminJwtPayload extends JwtPayload {
  role?: string;
  email?: string;
  name?: string;
}

export const authenticateSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authorization header missing or malformed" });
    return;
  }

  const token = authHeader.split(" ")[1];
  let decoded: SuperAdminJwtPayload;
  try {
    decoded = jwt.verify(token, env.jwt.secret) as SuperAdminJwtPayload;
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  if (decoded.role !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Only super admin can access this resource" });
    return;
  }

  req.superAdmin = {
    email: decoded.email ?? env.superAdmin.email,
    name: decoded.name ?? env.superAdmin.name,
    role: "SUPER_ADMIN"
  };
  next();
};

