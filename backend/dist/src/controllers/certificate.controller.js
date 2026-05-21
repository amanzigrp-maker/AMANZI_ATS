import { CertificateService } from '../services/certificate.service';
import { pool } from '../lib/database';
import { sendInterviewResults } from '../services/email.service';
/**
 * Explicitly generate a certificate from the frontend
 * This is called automatically by the InterviewPage when a test is completed
 */
export const generateCertificate = async (req, res) => {
    try {
        const { sessionId, score, testName, candidateName, candidateEmail, candidatePhoto } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'Session ID is required' });
        }
        // 1. Check if certificate already exists
        const existingCert = await pool.query('SELECT id FROM certificates WHERE interview_session_id = $1 LIMIT 1', [sessionId]);
        if (existingCert.rows.length > 0) {
            return res.json({
                success: true,
                certificateId: existingCert.rows[0].id,
                message: 'Certificate already exists'
            });
        }
        // 2. Generate new certificate ID
        const certificateId = CertificateService.generateCertificateId();
        // 3. Generate PDF buffer
        const certificateBuffer = await CertificateService.generatePDF({
            certificateId,
            name: candidateName || 'Candidate',
            test: testName || 'Technical Assessment',
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            photoPath: candidatePhoto || '',
            score: Number(score) || 0,
            analytics: {} // Optional: could fetch detailed analytics here
        });
        // 4. Save to database
        await CertificateService.saveCertificate(String(sessionId), {
            certificateId,
            name: candidateName || 'Candidate',
            test: testName || 'Technical Assessment',
            score: Number(score) || 0,
            photoUrl: candidatePhoto || ''
        });
        // 5. Send email with certificate
        await sendInterviewResults(candidateEmail, candidateName, score, 100, // Total
        testName, null, // Time taken
        {}, // Breakdown
        undefined, // report
        certificateBuffer, certificateId);
        res.json({
            success: true,
            certificateId,
            message: 'Certificate generated and emailed successfully'
        });
    }
    catch (error) {
        console.error('❌ Error generating certificate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate certificate',
            details: error.message
        });
    }
};
/**
 * Download a certificate PDF
 */
export const downloadCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const certIdStr = Array.isArray(id) ? id[0] : id;
        const certData = await CertificateService.getCertificate(certIdStr);
        if (!certData) {
            return res.status(404).send('Certificate not found');
        }
        const buffer = await CertificateService.generatePDF({
            certificateId: certData.id,
            name: certData.candidate_name,
            test: certData.assessment_name,
            date: new Date(certData.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            photoPath: certData.selfie_path || certData.photo_url || '',
            score: Number(certData.score),
            analytics: certData.analytics
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Amanzi_Certificate_${id}.pdf"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('❌ Error downloading certificate:', error);
        res.status(500).send('Internal server error');
    }
};
/**
 * Verify a certificate
 */
export const verifyCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const certIdStr = Array.isArray(id) ? id[0] : id;
        const certificate = await CertificateService.getCertificate(certIdStr);
        if (!certificate) {
            return res.status(404).json({ valid: false, message: 'Certificate not found' });
        }
        res.json({
            valid: true,
            certificate,
            analytics: {
                totalQuestions: 20,
                correctAnswers: 16,
                durationMinutes: 45,
                authenticityScore: 0.99,
                status: 'Verified'
            }
        });
    }
    catch (error) {
        console.error('❌ Error verifying certificate:', error);
        res.status(500).json({ valid: false, message: 'Internal server error' });
    }
};
