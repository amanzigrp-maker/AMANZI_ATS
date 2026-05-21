import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/env.config";

/**
 * Middleware to enforce Secure Browser usage for high-stakes assessments
 */
export const requireSecureBrowser = (req: Request, res: Response, next: NextFunction) => {
  const isSecureBrowserRequired = req.body.secureBrowserRequired || req.query.secureBrowserRequired === "true";
  
  if (!isSecureBrowserRequired && !config.SECURE_BROWSER_STRICT_MODE) {
    return next();
  }

  // Expecting Amanzi-Secure-Browser-Token in headers
  const secureToken = req.headers["x-amanzi-secure-token"];
  const clientFingerprint = req.headers["x-amanzi-client-fingerprint"];

  if (!secureToken || typeof secureToken !== "string") {
    return res.status(403).json({
      success: false,
      error: "Secure Browser Required",
      message: "This assessment requires the Amanzi Secure Browser to proceed."
    });
  }

  try {
    // Basic verification of the JWT or signed payload (Simulated here)
    // In production, you would verify against a public key or shared secret
    const secret = config.SECURE_BROWSER_SECRET || "default_development_secret_only";
    
    // Split token (assuming format: payload.signature)
    const [payloadB64, signature] = secureToken.split(".");
    
    if (!payloadB64 || !signature) {
      throw new Error("Malformed token");
    }

    // Verify signature
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payloadB64);
    const expectedSignature = hmac.digest("hex");

    if (signature !== expectedSignature) {
      throw new Error("Signature mismatch");
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));

    // Check expiration
    if (payload.exp && payload.exp < Date.now()) {
      throw new Error("Token expired");
    }

    // Bind verification to request
    (req as any).secureBrowserVerified = true;
    (req as any).secureBrowserIdentity = payload;

    next();
  } catch (error) {
    console.error("[SecureBrowser] Attestation failed:", error);
    return res.status(403).json({
      success: false,
      error: "Secure Browser Verification Failed",
      message: "The secure browser integrity check failed. Please restart the application."
    });
  }
};
