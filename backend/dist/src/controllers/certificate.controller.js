import { CertificateService } from '../services/certificate.service';
import { pool } from '../lib/database';
export const downloadCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const certificate = await CertificateService.getCertificate(id);
        if (!certificate) {
            return res.status(404).json({ error: 'Certificate not found' });
        }
        // Fetch verification photo if available
        const verifyRes = await pool.query('SELECT v.selfie_path FROM interview_verifications v JOIN interview_sessions s ON v.token = s.token WHERE s.id = $1', [certificate.interview_session_id]);
        const photoPath = verifyRes.rows[0]?.selfie_path;
        const pdfBuffer = await CertificateService.generatePDF({
            name: certificate.candidate_name,
            test: certificate.test_name,
            date: new Date(certificate.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            certificateId: certificate.certificate_id,
            photoPath: photoPath
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Certificate_${id}.pdf`);
        res.send(pdfBuffer);
    }
    catch (error) {
        console.error('Error downloading certificate:', error);
        res.status(500).json({ error: error.message });
    }
};
export const verifyCertificate = async (req, res) => {
    try {
        const { id } = req.params;
        const certificateResult = await pool.query(`SELECT c.*, s.total_questions, s.started_at, s.completed_at, s.role
       FROM certificates c
       LEFT JOIN interview_sessions s ON c.interview_session_id = s.id
       WHERE c.certificate_id = $1`, [id]);
        if (!certificateResult.rows.length) {
            return res.status(404).json({ success: false, error: 'Certificate not found' });
        }
        const certificate = certificateResult.rows[0];
        // Fetch breakdown
        const breakdownResult = await pool.query(`SELECT q.difficulty,
              COUNT(*) as total,
              SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END) as correct
       FROM interview_questions q
       JOIN interview_responses r ON q.id = r.question_id
       WHERE r.session_id = $1
       GROUP BY q.difficulty`, [certificate.interview_session_id]);
        const breakdownMap = {};
        breakdownResult.rows.forEach((row) => {
            breakdownMap[row.difficulty] = {
                total: parseInt(row.total, 10),
                correct: parseInt(row.correct, 10)
            };
        });
        res.json({
            success: true,
            certificate,
            analytics: {
                breakdown: breakdownMap,
                totalQuestions: certificate.total_questions,
                duration: certificate.started_at && certificate.completed_at
                    ? Math.round((new Date(certificate.completed_at).getTime() - new Date(certificate.started_at).getTime()) / 60000)
                    : null
            }
        });
    }
    catch (error) {
        console.error('Error verifying certificate:', error);
        res.status(500).json({ error: error.message });
    }
};
