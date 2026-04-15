/**
 * Candidate Routes - API endpoints for candidate management
 */
import express from 'express';
import {
  getCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  getCandidateStats
} from '../controllers/candidate.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get all candidates with filters
router.get('/', getCandidates);

// Create candidate
router.post('/', createCandidate);

// Get candidate statistics
router.get('/stats', getCandidateStats);

// Get candidate by ID
router.get('/:id', getCandidateById);

// Update candidate
router.put('/:id', updateCandidate);

// Delete candidate
router.delete('/:id', deleteCandidate);

export default router;
