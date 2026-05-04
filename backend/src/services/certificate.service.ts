import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import pool from '../lib/database.js';

export class CertificateService {
  /**
   * Generates a custom certificate ID in the format AMZ-YYYY-MM-DD-XXXX
   */
  static generateCertificateId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `AMZ-${year}-${month}-${day}-${random}`;
  }

  /**
   * Generates a QR code for certificate verification as a Buffer
   */
  static async generateQRCode(certificateId: string): Promise<Buffer> {
    const baseUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';
    const verificationUrl = `${baseUrl}/verify/${certificateId}`;

    // Generate QR code as a buffer for direct PDF insertion
    return await QRCode.toBuffer(verificationUrl, {
      margin: 1,
      width: 400,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }

  /**
   * Generates a professional A4 landscape certificate using a template image
   */
  static async generatePDF(data: {
    name: string;
    test: string;
    date: string;
    certificateId: string;
    photoPath: string;
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
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const width = doc.page.width;
        const height = doc.page.height;

        // 1. Load template image as background
        // Path: backend/src/assets/certificate_template.png
        const templatePath = path.join(process.cwd(), 'src', 'assets', 'certificate_template.png');

        try {
          await fs.access(templatePath);
          doc.image(templatePath, 0, 0, { width, height });
        } catch (e) {
          // Fallback to .jpeg if .png is not found (per existing assets)
          const jpegPath = templatePath.replace('.png', '.jpeg');
          try {
            await fs.access(jpegPath);
            doc.image(jpegPath, 0, 0, { width, height });
          } catch (err) {
            console.warn('Certificate template image not found at', templatePath);
            // Optional: Draw a simple border if template is missing entirely
            doc.rect(0, 0, width, height).fill('#FFFFFF');
          }
        }

        // 2. Candidate Photo (center circle)
        // Position: Center horizontally, y: 180, size: 130x130 (clip to circle)
        if (data.photoPath) {
          try {
            let photoBuffer: Buffer;
            if (data.photoPath.startsWith('data:image')) {
              photoBuffer = Buffer.from(data.photoPath.split(',')[1], 'base64');
            } else if (data.photoPath.startsWith('http')) {
              // Note: If this is a URL, you'd normally fetch it. 
              // Assuming for this implementation it's a local path or base64.
              // If it's a path, read it:
              photoBuffer = await fs.readFile(data.photoPath);
            } else {
              photoBuffer = await fs.readFile(data.photoPath);
            }

            const photoSize = 130;
            const photoX = (width - photoSize) / 2;
            const photoY = 170;

            doc.save();
            // Create circular clipping path
            doc.circle(width / 2, photoY + photoSize / 2, photoSize / 2).clip();
            doc.image(photoBuffer, photoX, photoY, {
              width: photoSize,
              height: photoSize,
              align: 'center',
              valign: 'center'
            });
            doc.restore();
          } catch (photoErr) {
            console.error('Failed to overlay candidate photo:', photoErr.message);
          }
        }

        // 3. Candidate Name
        // Position: y: 330, width: full page, align: center, fontSize: 38, font: serif bold
        doc.fillColor('#0A2540') // Navy blue
          .font('Times-Bold') // Built-in Serif Bold font
          .fontSize(38)
          .text(data.name, 0, 330, { align: 'center', width: width });

        // 4. Test Name
        // Position: y: 400, width: full page, align: center, fontSize: 18
        doc.fillColor('#1E293B')
          .font('Helvetica')
          .fontSize(18)
          .text(data.test, 0, 400, { align: 'center', width: width });

        // 5. Completion Date
        // Position: x: 140, y: 500, fontSize: 12
        doc.fillColor('#1E293B')
          .font('Helvetica')
          .fontSize(12)
          .text(data.date, 140, 520);

        // 6. Certificate ID
        // Position: x: 540, y: 500
        doc.text(data.certificateId, 540, 500);

        // 7. QR Code
        // Position: x: 700, y: 440, width: 100
        const qrBuffer = await this.generateQRCode(data.certificateId);
        doc.image(qrBuffer, 680, 440, { width: 100 });

        // Finalize PDF
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
