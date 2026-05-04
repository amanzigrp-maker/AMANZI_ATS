import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import pool from '../lib/database.js';

export class CertificateService {
  /**
   * Generates a QR code for certificate verification
   */
  static async generateQRCode(certificateId: string): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const verificationUrl = `${baseUrl}/verify/${certificateId}`;
    return await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }

  /**
   * Generates a dynamic PDF certificate
   */
  static async generatePDF(data: {
    candidateName: string;
    candidateEmail: string;
    candidatePhoto?: string;
    testName: string;
    companyName: string;
    score: number;
    certificateId: string;
    issuedAt: Date;
  }): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 0,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          const finalBuffer = Buffer.concat(buffers);
          console.log(`[PDF] Generated buffer for cert: ${data.certificateId} | Size: ${finalBuffer.length}`);
          resolve(finalBuffer);
        });
        doc.on('error', (err) => {
          console.error('[PDF] Document error:', err);
          reject(err);
        });

        const width = doc.page.width;
        const height = doc.page.height;

        // --- Background & Border ---
        doc.rect(0, 0, width, height).fill('#FFFFFF');
        
        // Subtle blue-gold gradient border
        doc.rect(20, 20, width - 40, height - 40).lineWidth(1).strokeColor('#E2E8F0').stroke();
        doc.rect(30, 30, width - 60, height - 60).lineWidth(3).strokeColor('#C5A059').stroke(); // Gold inner border

        // Watermark (if logo path is available, we'd use it. For now, a soft text watermark)
        doc.opacity(0.03)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .fontSize(100)
           .text(data.companyName, 0, height / 2 - 50, { align: 'center', width: width });
        doc.opacity(1);

        // --- Header ---
        // Logo Placeholder or Text
        doc.fillColor('#1E293B')
           .font('Times-Bold')
           .fontSize(36)
           .text(data.companyName, 0, 70, { align: 'center', width: width });

        doc.fillColor('#C5A059')
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('CERTIFICATE OF COMPLETION', 0, 120, { align: 'center', width: width, characterSpacing: 2 });

        // --- Main Body ---
        doc.fillColor('#64748B')
           .font('Times-Italic')
           .fontSize(18)
           .text('This is to certify that', 0, 170, { align: 'center', width: width });

        doc.fillColor('#1E293B')
           .font('Helvetica-Bold')
           .fontSize(52)
           .text(data.candidateName, 0, 210, { align: 'center', width: width });

        doc.fillColor('#64748B')
           .font('Times-Roman')
           .fontSize(18)
           .text(`has successfully completed the ${data.testName} assessment`, 0, 280, { align: 'center', width: width });
           
        doc.text(`conducted by ${data.companyName}.`, 0, 305, { align: 'center', width: width });

        doc.fillColor('#1E293B')
           .font('Helvetica-Bold')
           .fontSize(22)
           .text(`Achievement Score: ${data.score}%`, 0, 350, { align: 'center', width: width });

        // --- Signatures ---
        const sigY = height - 120;
        
        // Left: Date
        doc.moveTo(100, sigY).lineTo(250, sigY).lineWidth(1).strokeColor('#94A3B8').stroke();
        doc.fillColor('#1E293B')
           .font('Helvetica')
           .fontSize(12)
           .text(data.issuedAt.toLocaleDateString(), 100, sigY + 10, { width: 150, align: 'center' });
        doc.fontSize(10).fillColor('#64748B').text('Date of Issue', 100, sigY + 25, { width: 150, align: 'center' });

        // Right: Authorized Signatory
        doc.moveTo(width - 250, sigY).lineTo(width - 100, sigY).stroke();
        doc.fillColor('#1E293B')
           .font('Times-BoldItalic')
           .fontSize(14)
           .text('Amanzi Systems', width - 250, sigY - 20, { width: 150, align: 'center' });
        doc.font('Helvetica')
           .fontSize(12)
           .text('Authorized Signatory', width - 250, sigY + 10, { width: 150, align: 'center' });

        // --- QR Code & Metadata ---
        const qrCodeDataUrl = await this.generateQRCode(data.certificateId);
        doc.image(qrCodeDataUrl, width - 110, height - 110, { width: 80 });

        doc.fillColor('#94A3B8')
           .font('Courier')
           .fontSize(8)
           .text(`VERIFICATION ID: ${data.certificateId}`, 50, height - 40);

        // --- Candidate Photo (Small circular or square in top corner) ---
        if (data.candidatePhoto) {
          try {
            const photoBuffer = Buffer.from(data.candidatePhoto.split(',')[1] || data.candidatePhoto, 'base64');
            doc.image(photoBuffer, 50, 50, { width: 60, height: 60 });
            doc.rect(50, 50, 60, 60).lineWidth(1).strokeColor('#C5A059').stroke();
          } catch (e) {}
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Saves certificate metadata to DB
   */
  static async saveCertificate(data: {
    certificateId: string;
    interviewSessionId: number;
    candidateName: string;
    candidateEmail: string;
    candidatePhoto?: string;
    testName: string;
    score: number;
  }) {
    const query = `
      INSERT INTO certificates (
        certificate_id, 
        interview_session_id, 
        candidate_name, 
        candidate_email, 
        candidate_photo, 
        test_name, 
        score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      data.certificateId,
      data.interviewSessionId,
      data.candidateName,
      data.candidateEmail,
      data.candidatePhoto,
      data.testName,
      data.score
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Fetches certificate by ID
   */
  static async getCertificate(certificateId: string) {
    const result = await pool.query('SELECT * FROM certificates WHERE certificate_id = $1', [certificateId]);
    return result.rows[0];
  }
}
