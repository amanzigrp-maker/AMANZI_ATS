import { Router } from 'express';
import path from 'path';
import { downloadCertificate, verifyCertificate } from '../controllers/certificate.controller';
const router = Router();
router.get('/download/:id', downloadCertificate);
router.get('/verify/:id', verifyCertificate);
router.get('/template-image', (req, res) => {
    const templatePath = path.join(process.cwd(), 'backend', 'src', 'assets', 'certificate_template.png');
    res.sendFile(templatePath);
});
export default router;
