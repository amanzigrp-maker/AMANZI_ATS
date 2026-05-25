import { Request, Response } from "express";
import { BulkInviteService, BulkCandidateInput } from "../services/bulk-invite.service";

/**
 * Get userId from authenticated request
 */
const getUserId = (req: any): number | null => {
  const u = req.user || {};
  return Number(u.userid ?? u.id ?? 0) || null;
};

/**
 * Get userRole from authenticated request
 */
const getUserRole = (req: any): string => {
  return String(req.user?.role || "recruiter").toLowerCase();
};

/**
 * Robust CSV parser helper
 */
const parseCsvString = (csvText: string): BulkCandidateInput[] => {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const candidates: BulkCandidateInput[] = [];
  
  if (lines.length === 0) return [];
  
  // Process header line
  const headersLine = lines[0];
  const headers = headersLine.split(",").map(h => h.trim().toLowerCase());
  
  const nameIdx = headers.indexOf("name");
  const emailIdx = headers.indexOf("email");
  const phoneIdx = headers.indexOf("phone");
  const roleIdx = headers.indexOf("job_role") !== -1 ? headers.indexOf("job_role") : headers.indexOf("role");
  const tagsIdx = headers.indexOf("tags") !== -1 ? headers.indexOf("tags") : headers.indexOf("custom_tags");
  
  const useGuess = emailIdx === -1;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    
    let name = "";
    let email = "";
    let phone = "";
    let job_role = "";
    let tagsStr = "";
    
    if (useGuess) {
      name = cells[0] || "";
      email = cells[1] || "";
      phone = cells[2] || "";
      job_role = cells[3] || "";
      tagsStr = cells[4] || "";
    } else {
      if (nameIdx !== -1) name = cells[nameIdx] || "";
      if (emailIdx !== -1) email = cells[emailIdx] || "";
      if (phoneIdx !== -1) phone = cells[phoneIdx] || "";
      if (roleIdx !== -1) job_role = cells[roleIdx] || "";
      if (tagsIdx !== -1) tagsStr = cells[tagsIdx] || "";
    }
    
    // Basic validation to skip empty headers/rows
    if (!email || !email.includes("@")) continue;
    
    const custom_tags = tagsStr ? tagsStr.split(";").map(t => t.trim()).filter(Boolean) : [];
    
    candidates.push({
      name: name.trim() || email.split("@")[0].trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      job_role: job_role.trim() || undefined,
      custom_tags
    });
  }
  
  return candidates;
};

/**
 * Handle creation of a bulk invite job. Accepts candidates in request body (JSON)
 * or as a file upload (CSV) via multer single('file').
 */
export const createBulkInvite = async (req: any, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, assessment_id, job_id, candidates: rawCandidates } = req.body;
    
    const assessmentId = Number(assessment_id);
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "assessment_id is required and must be a number" });
    }

    const jobTitleName = name || `Bulk Invite - ${new Date().toLocaleDateString()}`;
    let candidatesList: BulkCandidateInput[] = [];

    // Check if we received a file upload
    if (req.file) {
      const fileBuffer = req.file.buffer || (req.file as any).path; 
      let csvContent = "";
      if (req.file.buffer) {
        csvContent = req.file.buffer.toString("utf-8");
      } else {
        const fs = await import("fs/promises");
        csvContent = await fs.readFile((req.file as any).path, "utf-8");
      }
      candidatesList = parseCsvString(csvContent);
    } else if (Array.isArray(rawCandidates)) {
      // Received JSON candidates array
      candidatesList = rawCandidates.map(c => ({
        name: String(c.name || "").trim(),
        email: String(c.email || "").trim().toLowerCase(),
        phone: c.phone ? String(c.phone).trim() : undefined,
        job_role: c.job_role ? String(c.job_role).trim() : undefined,
        custom_tags: Array.isArray(c.custom_tags) ? c.custom_tags.map(String) : []
      }));
    } else if (typeof req.body.csvText === "string") {
      // Received copy-pasted CSV text
      candidatesList = parseCsvString(req.body.csvText);
    } else {
      return res.status(400).json({ success: false, error: "Either a CSV file or candidates array is required" });
    }

    if (candidatesList.length === 0) {
      return res.status(400).json({ success: false, error: "No valid candidates found to invite" });
    }

    const job = await BulkInviteService.createBulkInviteJob(
      userId,
      jobTitleName,
      assessmentId,
      job_id ? Number(job_id) : null,
      candidatesList
    );

    // Trigger immediate async processing in background to process first batch
    BulkInviteService.processPendingInvites(5).catch(err => {
      console.error("❌ Immediate background processPendingInvites failed:", err);
    });

    return res.status(201).json({
      success: true,
      message: "Bulk invitation job created successfully",
      data: job
    });
  } catch (error: any) {
    console.error("❌ createBulkInvite failed:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to create bulk invite job" });
  }
};

/**
 * Retrieve list of bulk invite jobs with pagination
 */
export const listBulkInviteJobs = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    const result = await BulkInviteService.getBulkInviteJobs(userId, userRole, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("❌ listBulkInviteJobs failed:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to load bulk invite jobs" });
  }
};

/**
 * Retrieve details of a bulk invite job along with its candidates list
 */
export const getBulkInviteJob = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid job ID" });

    const jobDetail = await BulkInviteService.getBulkInviteJobDetail(id);
    if (!jobDetail) return res.status(404).json({ success: false, error: "Bulk invite job not found" });

    // RBAC: check ownership
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    if (userRole !== "admin" && jobDetail.created_by !== userId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    return res.json({ success: true, data: jobDetail });
  } catch (error: any) {
    console.error("❌ getBulkInviteJob failed:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to load job details" });
  }
};

/**
 * Retry failed candidates under a bulk invite job
 */
export const retryJobFailedInvites = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid job ID" });

    const jobDetail = await BulkInviteService.getBulkInviteJobDetail(id);
    if (!jobDetail) return res.status(404).json({ success: false, error: "Bulk invite job not found" });

    // RBAC: check ownership
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    if (userRole !== "admin" && jobDetail.created_by !== userId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const retriedCount = await BulkInviteService.retryFailedInvites(id);

    // Trigger immediate async processing in background to process retries
    BulkInviteService.processPendingInvites(5).catch(err => {
      console.error("❌ Immediate background processPendingInvites after retry failed:", err);
    });

    return res.json({
      success: true,
      message: `Successfully queued ${retriedCount} failed invitations for retry`,
      data: { retriedCount }
    });
  } catch (error: any) {
    console.error("❌ retryJobFailedInvites failed:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to retry invitations" });
  }
};
