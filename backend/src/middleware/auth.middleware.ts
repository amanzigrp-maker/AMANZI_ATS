import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthenticatedRequest = Request & {
  user?: {
    id: number;
    userid?: number;
    email: string;
    role: string;
  };
};

// -----------------------------------------------------------------------------
// INTERNAL HELPER — SAFE SECRET ACCESS
// -----------------------------------------------------------------------------
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("[AUTH] Missing JWT_SECRET");
  }

  return secret;
};

// -----------------------------------------------------------------------------
// VERIFY TOKEN
// Supports:
// 1) Authorization: Bearer <token>
// 2) ?token=<token>   (used for file downloads)
// -----------------------------------------------------------------------------
export const verifyToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  // 1️⃣ Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2️⃣ Query param fallback (for downloads)
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      message: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      id: number;
      email: string;
      role: string;
    };

    const roleNorm = (decoded.role || "").trim().toLowerCase();

    req.user = {
      id: decoded.id,
      userid: decoded.id,
      email: decoded.email,
      role: roleNorm,
    };

    console.log("🟢 JWT VERIFIED →", req.user);
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err);
    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};

// -----------------------------------------------------------------------------
// ADMIN GUARD
// -----------------------------------------------------------------------------
export const isAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const role = (req.user.role || "").trim().toLowerCase();

  if (role === "admin") {
    return next();
  }

  return res.status(403).json({
    error: "Access denied. Admin only.",
  });
};

// -----------------------------------------------------------------------------
// LEAD GUARD (Lead + Admin)
// -----------------------------------------------------------------------------
export const isLead = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const role = (req.user.role || "").trim().toLowerCase();

  if (role === "lead" || role === "admin") {
    return next();
  }

  return res.status(403).json({
    error: "Access denied. Lead or Admin only.",
  });
};

export const isLeadOrAdmin = isLead; // Alias for clarity if needed

