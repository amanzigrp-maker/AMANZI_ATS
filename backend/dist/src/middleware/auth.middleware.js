import jwt from "jsonwebtoken";
import { config } from "../config/env.config";
// -----------------------------------------------------------------------------
// INTERNAL HELPER - SAFE SECRET ACCESS
// -----------------------------------------------------------------------------
export const getJwtSecret = () => {
    return config.JWT_SECRET;
};
// -----------------------------------------------------------------------------
// VERIFY TOKEN
// Supports:
// 1) Authorization: Bearer <token>
// 2) ?token=<token>   (used for file downloads)
// -----------------------------------------------------------------------------
export const verifyToken = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    if (!token && typeof req.query.token === "string") {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({
            message: "Access denied. No token provided.",
        });
    }
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        const roleNorm = (decoded.role || "").trim().toLowerCase();
        req.user = {
            id: decoded.id,
            userid: decoded.id,
            email: decoded.email,
            role: roleNorm,
            interview_token: typeof decoded.interview_token === "string" ? decoded.interview_token : undefined,
        };
        next();
    }
    catch (err) {
        console.error("JWT verification failed:", err);
        return res.status(401).json({
            message: "Invalid or expired token.",
        });
    }
};
// -----------------------------------------------------------------------------
// ADMIN GUARD
// -----------------------------------------------------------------------------
export const isAdmin = (req, res, next) => {
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
export const isLead = (req, res, next) => {
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
export const isLeadOrAdmin = isLead;
