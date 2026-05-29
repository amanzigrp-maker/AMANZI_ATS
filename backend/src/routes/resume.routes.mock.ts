import express, { Request, Response } from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'));
    }
  }
});

/**
 * MOCK: Upload and process a resume
 * This is a temporary mock endpoint for testing the UI
 */
router.post('/upload', verifyToken, upload.single('resume'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    console.log(`📄 [MOCK] Processing resume: ${file.originalname} (${file.size} bytes)`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return mock success response
    res.json({
      success: true,
      message: 'Resume uploaded successfully (MOCK MODE - AI service not connected)',
      data: {
        resume_id: Math.floor(Math.random() * 1000),
        candidate_id: Math.floor(Math.random() * 1000),
        filename: file.originalname,
        status: 'mock_processed',
        extracted_data: {
          name: 'John Doe (Mock)',
          email: 'mock@example.com',
          skills: ['JavaScript', 'React', 'Node.js'],
          experience_years: 5
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Mock upload error:', error.message);
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to upload resume (mock mode)' 
    });
  }
});

/**
 * MOCK: Search candidates
 */
router.post('/search', verifyToken, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    console.log(`🔍 [MOCK] Semantic search: "${query}"`);

    // Return mock search results
    res.json({
      success: true,
      data: {
        candidates: [
          {
            candidate_id: 1,
            full_name: 'Alice Johnson (Mock)',
            email: 'alice@example.com',
            similarity_score: 0.92,
            skills: ['React', 'TypeScript', 'Node.js'],
            years_of_experience: 5
          },
          {
            candidate_id: 2,
            full_name: 'Bob Smith (Mock)',
            email: 'bob@example.com',
            similarity_score: 0.85,
            skills: ['JavaScript', 'Python', 'AWS'],
            years_of_experience: 3
          }
        ]
      }
    });

  } catch (error: any) {
    console.error('Mock search error:', error.message);
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to search candidates (mock mode)' 
    });
  }
});

/**
 * Mock health check
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    success: true,
    ai_service: 'mock',
    message: 'Running in MOCK mode - AI service not connected'
  });
});

export default router;
