import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateCertificate, downloadCertificate, verifyCertificate } from '../controllers/certificate.controller';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();
/**
 * Serves the master certificate template image for frontend previews
 */
router.get('/template-image', (req, res) => {
    const templatePath = path.join(__dirname, '..', 'assets', 'amanzi_final_template.png');
    if (fs.existsSync(templatePath)) {
        res.sendFile(templatePath);
    }
    else {
        res.status(404).send('Template image not found');
    }
});
/**
 * Explicitly generate a certificate
 */
router.post('/generate', generateCertificate);
/**
 * Verification endpoint for QR code scans
 */
router.get('/verify/:id', verifyCertificate);
/**
 * Serves the actual generated certificate PDF (view/inline)
 */
router.get('/view/:id', downloadCertificate);
/**
 * Serves the actual generated certificate PDF (download/attachment)
 */
router.get('/download/:id', downloadCertificate);
export default router;
