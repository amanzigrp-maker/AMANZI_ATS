import { CertificateService } from '../src/services/certificate.service';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { config } from '../src/config/env.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateScreenshot() {
  console.log("Generating Certificate Screenshot...");
  const artifactDir = "C:\\Users\\ABHINAV VATS\\.gemini\\antigravity-ide\\brain\\17932ce5-c872-437f-a60f-13c50af7dc79";
  const outputPath = path.join(artifactDir, "certificate_preview.png");

  const data = {
    name: 'Rahul Kumar',
    test: 'Software Engineer',
    score: 85.50,
    certificateId: 'CERT-RAHUL-12345',
    photoPath: null
  };

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1123, height: 794 });

    const qrDataUrl = await QRCode.toDataURL(`https://amanzi.com/verify-certificate/${data.certificateId}`, {
      margin: 1,
      width: 256
    });

    // Load company logo as base64 with multiple fallback paths
    let companyLogoBase64 = null;
    const logoPaths = [
      path.join(process.cwd(), "..", "frontend", "public", "assets", "logo.png"),
      path.join(process.cwd(), "frontend", "public", "assets", "logo.png"),
      path.join(__dirname, "..", "..", "..", "frontend", "public", "assets", "logo.png")
    ];

    for (const logoPath of logoPaths) {
      try {
        const logoData = await fs.readFile(logoPath);
        companyLogoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;
        console.log(`Successfully loaded logo from: ${logoPath}`);
        break; 
      } catch (err) {
        // Try next candidate path
      }
    }

    const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Montserrat:wght@700;800;900&family=Dancing+Script:wght@700&display=swap');
        
        :root {
            --navy: #0A244D;
            --gold: #B8860B;
            --gold-light: #D4AF37;
            --logo-red: #E31E24;
            --logo-blue: #00AEEF;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            margin: 0;
            padding: 0;
            width: 1123px;
            height: 794px;
            overflow: hidden;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-family: 'Inter', sans-serif;
        }

        .certificate-container {
            width: 1123px;
            height: 794px;
            background: white;
            position: relative;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* BORDERS & CORNERS */
        .main-border {
            position: absolute;
            inset: 0;
            border: 20px solid var(--navy);
            z-index: 10;
        }
        .gold-line {
            position: absolute;
            inset: 30px;
            border: 1px solid var(--gold-light);
            z-index: 11;
        }

        /* WATERMARK */
        .watermark {
            position: absolute;
            top: 55%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 550px;
            height: 550px;
            opacity: 0.03;
            z-index: 1;
        }

        /* CONTENT LAYER */
        .content-layer {
            position: relative;
            z-index: 20;
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            padding: 40px 80px;
        }

        /* LOGO */
        .header { display: flex; justify-content: center; margin-bottom: 25px; }
        .amanzi-logo { display: flex; align-items: baseline; font-family: 'Montserrat', sans-serif; }
        .a-letter { font-size: 64px; font-weight: 900; color: var(--logo-red); line-height: 0.8; }
        .manzi-text { font-size: 48px; font-weight: 800; color: var(--logo-blue); letter-spacing: -2px; margin-left: -2px; }

        /* MIDDLE CONTENT */
        .main-body { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
        .side-element { width: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        
        .photo-frame {
            width: 130px; height: 160px; background: #fff; padding: 4px; 
            border: 1px solid #ddd; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden;
        }
        .photo-img { width: 100%; height: 100%; object-fit: cover; }

        .qr-box { background: white; padding: 6px; border: 1px solid #eee; margin-bottom: 8px; }
        .qr-img { width: 90px; height: 90px; }
        .verify-label { font-size: 8px; font-weight: 800; color: var(--gold); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
        .cert-id { font-family: monospace; font-weight: 900; font-size: 10px; color: var(--navy); }

        .center-stack { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 20px; }
        .cert-title { font-family: 'Playfair Display', serif; font-size: 46px; font-weight: 900; color: var(--navy); text-transform: uppercase; letter-spacing: 4px; }
        .achievement-label { font-size: 12px; font-weight: 700; color: var(--gold); text-transform: uppercase; letter-spacing: 7px; border-top: 1px solid var(--gold); padding-top: 6px; margin-bottom: 35px; }

        .certify-line { font-size: 17px; font-style: italic; color: #555; margin-bottom: 12px; }
        .candidate-name { 
            font-family: 'Montserrat', sans-serif; font-size: 44px; 
            font-weight: 900; color: var(--navy); text-transform: uppercase; 
            border-bottom: 2px double var(--gold); padding-bottom: 4px; margin-bottom: 18px; width: 100%; max-width: 550px; 
        }

        .desc-text { font-size: 15px; line-height: 1.5; color: #333; max-width: 500px; }
        .role-title { display: block; font-weight: 800; color: var(--navy); font-size: 21px; margin-top: 8px; text-decoration: underline var(--gold) 2px; }

        /* FOOTER */
        .footer { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 10px; margin-top: auto; margin-bottom: 30px; }
        .footer-col { width: 250px; display: flex; flex-direction: column; }
        .date-col { text-align: left; align-items: flex-start; }
        .label-text { font-size: 9px; font-weight: 800; color: #777; text-transform: uppercase; margin-bottom: 3px; }
        .value-text { font-weight: 700; font-size: 13px; color: var(--navy); }

        .signature-col { text-align: right; align-items: flex-end; }
        .sig-text { font-family: 'Dancing Script', cursive; font-size: 34px; color: var(--navy); margin-bottom: -8px; }
        .sig-rule { width: 100%; height: 1px; background: #555; margin-bottom: 4px; }
        .sig-info { font-weight: 800; font-size: 13px; text-transform: uppercase; color: #444; }
        .sig-sub { font-size: 9px; color: #777; text-transform: uppercase; }

        .seal-wrap { flex: 1; display: flex; justify-content: center; }
        .luxury-seal { 
            width: 90px; height: 90px; background: radial-gradient(circle, #D4AF37, #B8860B); 
            border-radius: 50%; border: 3px double #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); 
            display: flex; align-items: center; justify-content: center; transform: translateY(-10px);
        }
        .seal-content { color: white; font-weight: 900; font-size: 11px; text-align: center; line-height: 1.1; }
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="main-border"></div>
        <div class="gold-line"></div>
        <svg class="watermark" viewBox="0 0 100 100"><path d="M50 5 L95 95 L5 95 Z" fill="#1A3A6B" /></svg>

        <div class="content-layer">
            <div class="header">
                ${companyLogoBase64 ? `
                <img src="${companyLogoBase64}" style="height: 90px; max-width: 320px; object-fit: contain;" />
                ` : `
                <div class="amanzi-logo">
                    <span class="a-letter">A</span>
                    <span class="manzi-text">manzi</span>
                </div>
                `}
            </div>

            <div class="main-body">
                <div class="side-element">
                    <div class="photo-frame">
                        <div style="color:#ccc; font-size:10px; height:100%; display:flex; align-items:center; justify-content:center; text-align:center;">PHOTO</div>
                    </div>
                </div>

                <div class="center-stack">
                    <h1 class="cert-title">Certificate</h1>
                    <span class="achievement-label">Of Professional Achievement</span>
                    <p class="certify-line">This is to officially certify that</p>
                    <h2 class="candidate-name">${data.name.toUpperCase()}</h2>
                    <p class="desc-text">
                        has successfully completed the comprehensive professional assessment for the high-impact role of
                        <span class="role-title">${data.test || 'Technical Expert'}</span>
                        demonstrating mastery in technical domains and engineering standards.
                    </p>
                </div>

                <div class="side-element">
                    <div class="qr-box">
                        <img src="${qrDataUrl}" class="qr-img" />
                    </div>
                    <div class="verify-label">Verify Certificate</div>
                    <div class="cert-id">${data.certificateId}</div>
                </div>
            </div>

            <div class="footer">
                <div class="footer-col date-col">
                    <div class="label-text">Date of Issue</div>
                    <div class="value-text">${issueDate}</div>
                </div>
                <div class="seal-wrap">
                    <div class="luxury-seal">
                        <div class="seal-content">OFFICIAL<br/>VERIFIED<br/>AMANZI</div>
                    </div>
                </div>
                <div class="footer-col signature-col">
                    <div class="sig-text">Prithvi Bisht</div>
                    <div class="sig-rule"></div>
                    <div class="sig-info">Prithvi Bisht</div>
                    <div class="sig-sub">Authorized Signatory, Amanzi Pvt. Ltd.</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' as any });
    await page.screenshot({ path: outputPath });
    console.log(`Screenshot generated successfully at: ${outputPath}`);

  } catch (err) {
    console.error("Error creating screenshot:", err);
  } finally {
    await browser.close();
  }
}

generateScreenshot();
