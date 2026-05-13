import pg from 'pg';
import { CertificateService } from '../src/services/certificate.service.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: '127.0.0.1',
  port: 5433,
  user: 'postgres',
  password: 'sagar123',
  database: 'ai_ats_data',
};

async function generateTestCert() {
  const service = new CertificateService();
  const data = {
    name: 'Rahul Kumar',
    test: 'Software Engineer',
    score: 85.50,
    certificateId: 'CERT-RAHUL-12345',
    photoPath: null // Using null for now
  };

  const outputPath = path.join(__dirname, 'rahul_kumar_certificate.pdf');
  
  try {
    const pdfBuffer = await CertificateService.generatePDF(data);
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, pdfBuffer);
    console.log(`Certificate generated successfully at: ${outputPath}`);
  } catch (err) {
    console.error('Error generating certificate:', err);
  }
}

generateTestCert();
