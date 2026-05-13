import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../lib/database';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class CertificateService {
    static TEMPLATE_PATHS = [
        path.join(process.cwd(), 'backend', 'src', 'assets', 'certificate_template.png'),
        path.join(__dirname, '..', 'assets', 'certificate_template.png')
    ];
    static getTemplatePath() {
        return this.TEMPLATE_PATHS.find((templatePath) => fs.existsSync(templatePath));
    }
    static generateCertificateId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let id = 'AMZ-';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    /**
     * FINAL PRODUCTION FIX — PIXEL PERFECT CERTIFICATE GENERATION SYSTEM
     * Strictly follows the locked base layer and masking strategy.
     */
    static async generatePDF(data) {
        return new Promise(async (resolve, reject) => {
            try {
                // PHASE 1 — PDF ENGINE CONFIGURATION
                const doc = new PDFDocument({
                    size: [842, 595], // A4 Landscape
                    layout: 'landscape',
                    margin: 0,
                    autoFirstPage: false,
                    bufferPages: true
                });
                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pageCount = doc.bufferedPageRange().count;
                    if (pageCount > 1) {
                        reject(new Error(`Layout Violation: PDF generated ${pageCount} pages. Content exceeded y=540 safety limit.`));
                        return;
                    }
                    resolve(Buffer.concat(buffers));
                });
                // Create the single allowed page
                doc.addPage({
                    margins: { top: 0, bottom: 0, left: 0, right: 0 }
                });
                // PHASE 2 & 3 — TEMPLATE BACKGROUND
                const templatePath = this.getTemplatePath();
                if (templatePath) {
                    doc.image(templatePath, 0, 0, { width: 842, height: 595 });
                }
                // PHASE 4 — WHITE MASK CLEANUP SYSTEM (Mandatory Erase Layer)
                // MASK 1 — PHOTO PLACEHOLDER REMOVAL
                doc.save();
                const photoBox = { x: 70, y: 175, w: 150, h: 205 };
                doc.fillColor('#FFFFFF').roundedRect(62, 165, 170, 225, 12).fill();
                doc.restore();
                // MASK 2 — NAME PLACEHOLDER REMOVAL
                doc.save();
                const nameBox = { x: 250, y: 268, w: 345, h: 45 };
                doc.fillColor('#FFFFFF').rect(245, 265, 355, 52).fill();
                doc.restore();
                // PHASE 5 — REAL CANDIDATE PHOTO INSERTION
                if (data.photoPath && fs.existsSync(data.photoPath)) {
                    try {
                        doc.save();
                        // Rounded clipping mask for frame
                        doc.roundedRect(photoBox.x, photoBox.y, photoBox.w, photoBox.h, 10).clip();
                        doc.image(data.photoPath, photoBox.x, photoBox.y, {
                            cover: [photoBox.w, photoBox.h],
                            align: 'center',
                            valign: 'center'
                        });
                        doc.restore();
                    }
                    catch (err) {
                        console.warn('Candidate photo drawing failed:', err);
                    }
                }
                // PHASE 6 — REAL CANDIDATE NAME INSERTION
                const cleanName = data.name.replace(/[{}]/g, '').toUpperCase();
                const nameFontSize = cleanName.length > 26 ? 22 : cleanName.length > 18 ? 26 : 30;
                doc.fillColor('#1A3A6B') // Dark navy blue
                    .font('Helvetica-Bold')
                    .fontSize(nameFontSize)
                    .text(cleanName, nameBox.x, nameBox.y + 6, {
                    width: nameBox.w,
                    align: 'center'
                });
                // PHASE 7 — ASSESSMENT TEXT
                doc.fillColor('#334155')
                    .font('Helvetica')
                    .fontSize(14)
                    .text("has successfully completed the assessment\nand is hereby awarded this certificate.", 230, 360, {
                    width: 380,
                    align: 'center',
                    lineGap: 4
                });
                // PHASE 8 — SCORE ACCURACY
                if (data.score !== undefined) {
                    doc.save();
                    doc.font('Helvetica-Bold').fontSize(12);
                    doc.fillColor('#000000').text('Score Accuracy: ', 300, 420, { continued: true });
                    doc.fillColor('#1A3A6B').text(`${data.score.toFixed(2)}%`);
                    doc.restore();
                }
                // PHASE 9 — QR CODE
                const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-certificate/${data.certificateId}`;
                const qrCodeBuffer = await QRCode.toBuffer(verificationUrl, { margin: 1, scale: 4 });
                doc.image(qrCodeBuffer, 700, 205, { width: 95, height: 95 });
                // PHASE 11 — DATE & SIGNATURE (Well above y=540 safety limit)
                doc.fillColor('#334155').font('Helvetica-Bold').fontSize(11);
                doc.text(data.date, 175, 488, { width: 150, align: 'center' });
                // ID below QR for tracking
                doc.fontSize(8).fillColor('#64748b').text(`CERT-ID: ${data.certificateId}`, 700, 305, { width: 95, align: 'center' });
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    static async saveCertificate(data) {
        const query = `
      INSERT INTO certificates (
        certificate_id, interview_session_id, candidate_name, 
        candidate_email, candidate_photo, test_name, score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (interview_session_id) DO NOTHING
    `;
        await pool.query(query, [
            data.certificateId,
            data.interviewSessionId,
            data.candidateName,
            data.candidateEmail,
            data.candidatePhoto,
            data.testName,
            data.score
        ]);
    }
    static async getCertificate(id) {
        const res = await pool.query('SELECT * FROM certificates WHERE certificate_id = $1', [id]);
        return res.rows[0];
    }
}
