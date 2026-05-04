import { Request, Response } from 'express';
import { CertificateService } from '../services/certificate.service.js';
import { sendCertificateEmail } from '../services/email.service.js';
import { v4 as uuidv4 } from 'uuid';

export const generateAndSendCertificate = async (req: Request, res: Response) => {
  try {
    const { sessionId, score, testName, candidateName, candidateEmail, candidatePhoto } = req.body;
    console.log('[CERT] Generation request:', { sessionId, candidateEmail, testName, score });

    if (!sessionId || !candidateEmail) {
      console.error('[CERT] Missing required fields:', { sessionId, candidateEmail });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const certificateId = uuidv4();
    const companyName = process.env.COMPANY_NAME || 'Amanzi Tech';
    const issuedAt = new Date();

    // 1. Save to DB
    await CertificateService.saveCertificate({
      certificateId,
      interviewSessionId: Number(sessionId),
      candidateName,
      candidateEmail,
      candidatePhoto,
      testName,
      score
    });

    // 2. Generate PDF
    const pdfBuffer = await CertificateService.generatePDF({
      candidateName,
      candidateEmail,
      candidatePhoto,
      testName,
      companyName,
      score,
      certificateId,
      issuedAt
    });

    // 3. Send Email
    await sendCertificateEmail(candidateEmail, candidateName, testName, pdfBuffer, certificateId);

    return res.status(200).json({ 
      message: 'Certificate generated and sent successfully',
      certificateId 
    });
  } catch (error) {
    console.error('Error in generateAndSendCertificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadCertificate = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const cert = await CertificateService.getCertificate(certificateId);

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const companyName = process.env.COMPANY_NAME || 'Amanzi Tech';
    
    const pdfBuffer = await CertificateService.generatePDF({
      candidateName: cert.candidate_name,
      candidateEmail: cert.candidate_email,
      candidatePhoto: cert.candidate_photo,
      testName: cert.test_name,
      companyName,
      score: parseFloat(cert.score),
      certificateId: cert.certificate_id,
      issuedAt: new Date(cert.issued_at)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Certificate_${certificateId}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error in downloadCertificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyCertificate = async (req: Request, res: Response) => {
  try {
    const { certificateId } = req.params;
    const cert = await CertificateService.getCertificate(certificateId);

    if (!cert) {
      return res.status(404).json({ error: 'Invalid Certificate ID' });
    }

    return res.status(200).json({
      verified: true,
      data: {
        candidateName: cert.candidate_name,
        testName: cert.test_name,
        score: cert.score,
        date: cert.issued_at,
        candidatePhoto: cert.candidate_photo
      }
    });
  } catch (error) {
    console.error('Error in verifyCertificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
