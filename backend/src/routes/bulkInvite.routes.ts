import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../middleware/auth.middleware";
import {
  createBulkInvite,
  listBulkInviteJobs,
  getBulkInviteJob,
  retryJobFailedInvites
} from "../controllers/bulkInvite.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

// Endpoints
router.get("/", listBulkInviteJobs);
router.post("/", upload.single("file"), createBulkInvite);
router.get("/:id", getBulkInviteJob);
router.post("/:id/retry", retryJobFailedInvites);

export default router;
