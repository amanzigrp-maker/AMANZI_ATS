import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import {
  createAssessmentFromAi,
  createAssessmentFromCsv,
  createAssessmentFromUpload,
  getCandidateAssessment,
  getAssessment,
  listAssessments,
  submitAssessmentAttempt,
} from "../controllers/assessment.controller";

const router = Router();

router.use(verifyToken);

router.post("/ai", createAssessmentFromAi);
router.post("/csv", createAssessmentFromCsv);
router.post("/upload", createAssessmentFromUpload);
router.get("/", listAssessments);
router.get("/:id/candidate", getCandidateAssessment);
router.post("/:id/attempts", submitAssessmentAttempt);
router.get("/:id", getAssessment);

export default router;
