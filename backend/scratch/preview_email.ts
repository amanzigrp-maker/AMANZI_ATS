import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateEmailPreview() {
  const name = 'Abhinav';
  const to = 'abhinavvats5207@gmail.com';
  const loginUrl = 'http://13.201.116.154/assessment/start/token-12345';
  const displayPassword = 'VQS7W';
  const companyName = 'Amanzi';
  const logoUrl = 'http://13.201.116.154/assets/logo.png';
  const year = new Date().getFullYear();

  const html = `
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <title>Assessment Invitation</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <style type="text/css">
            body {
              margin: 0;
              padding: 0;
              min-width: 100%;
              background-color: #f4f6fa;
              font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            table {
              border-spacing: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            td {
              padding: 0;
            }
            img {
              border: 0;
              display: block;
              outline: none;
              text-decoration: none;
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; min-width: 100%; background-color: #f4f6fa;">
          <center class="wrapper" style="width: 100%; table-layout: fixed; background-color: #f4f6fa; padding-bottom: 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6fa; width: 100%; table-layout: fixed;">
              <tr>
                <td align="center" style="padding: 40px 10px 40px 10px;">
                  
                  <!-- MAIN CONTAINER TABLE -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; border-collapse: collapse;">
                    
                    <!-- BLUE HEADER ZONE (wraps top of white card) -->
                    <tr>
                      <td bgcolor="#0B51C1" style="background-color: #0B51C1; padding: 30px 30px 0 30px; border-top-left-radius: 20px; border-top-right-radius: 20px;">
                        
                        <!-- TOP NESTED WHITE CARD -->
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-top-left-radius: 16px; border-top-right-radius: 16px; border-collapse: collapse;">
                          <tr>
                            <td align="center" style="padding: 40px 30px 10px 30px;">
                              <!-- Logo -->
                              <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="padding-bottom: 20px;">
                                    <img src="${logoUrl}" alt="Amanzi Logo" width="160" style="display: block; border: 0; outline: none; text-decoration: none;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Title -->
                              <h1 style="color: #0f172a; font-size: 32px; font-weight: 800; margin: 0 0 10px 0; font-family: 'Inter', 'Segoe UI', sans-serif; letter-spacing: -0.5px; text-align: center;">Amanzi Tech ATS</h1>
                              
                              <!-- ONLINE ASSESSMENT INVITATION flanking dividers -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 20%;">&nbsp;</td>
                                  <td align="center" valign="middle" style="padding: 0 15px; font-size: 11.5px; font-weight: 800; color: #64748b; letter-spacing: 1.5px; text-transform: uppercase; font-family: 'Inter', sans-serif; white-space: nowrap;">
                                    ONLINE ASSESSMENT INVITATION
                                  </td>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 20%;">&nbsp;</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                      </td>
                    </tr>
                    
                    <!-- WHITE CONTENT ZONE (rest of the card) -->
                    <tr>
                      <td bgcolor="#f4f6fa" style="background-color: #f4f6fa; padding: 0 30px 30px 30px;">
                        
                        <!-- BOTTOM NESTED WHITE CARD -->
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05); border-collapse: collapse;">
                          <tr>
                            <td style="padding: 20px 30px 40px 30px; font-family: 'Inter', 'Segoe UI', sans-serif; text-align: left;">
                              
                              <!-- Greeting & Content -->
                              <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #0f172a;">Dear ${name || 'Candidate'},</p>
                              <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.6;">Greetings from <strong style="color: #0B51C1;">Amanzi Tech</strong>.</p>
                              <p style="margin: 0 0 25px 0; font-size: 15px; color: #334155; line-height: 1.6;">We are pleased to invite you to complete the online assessment as part of your recruitment evaluation process. Please review the details below carefully.</p>
                              
                              <!-- ASSESSMENT DETAILS Inner Card -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; border-collapse: separate; overflow: hidden; margin-bottom: 25px;">
                                <!-- Card Header -->
                                <tr>
                                  <td bgcolor="#f8fafc" style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 15px 20px;">
                                    <table cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                        <td valign="middle" style="width: 28px; padding-right: 12px;">
                                          <!-- Clipboard Icon -->
                                          <div style="background-color: #0B51C1; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                            <span style="font-size: 14px; color: #ffffff;">📋</span>
                                          </div>
                                        </td>
                                        <td valign="middle">
                                          <span style="font-size: 14px; font-weight: 800; color: #0B51C1; letter-spacing: 0.5px; font-family: 'Inter', sans-serif; text-transform: uppercase;">ASSESSMENT DETAILS</span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Card Rows -->
                                <tr>
                                  <td style="padding: 10px 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                      
                                      <!-- Row 1: Assessment Link -->
                                      <tr>
                                        <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #eff6ff; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #3b82f6;">🔗</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Assessment Link</span>
                                              </td>
                                              <td align="right" valign="middle">
                                                <a href="${loginUrl}" target="_blank" style="background-color: #0B51C1; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13.5px; font-weight: 700; font-family: 'Inter', sans-serif; display: inline-block; white-space: nowrap;">
                                                  Start Assessment &nbsp;➔
                                                </a>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                      <!-- Row 2: Username / User ID -->
                                      <tr>
                                        <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #eff6ff; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #3b82f6;">👤</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Username / User ID</span>
                                              </td>
                                              <td align="right" valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <a href="mailto:${to}" style="font-size: 14.5px; font-weight: 700; color: #0B51C1; text-decoration: underline;">${to}</a>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                      <!-- Row 3: Temporary Password -->
                                      <tr>
                                        <td style="padding: 15px 0 5px 0;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #fef3c7; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #f59e0b;">🔒</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Temporary Password</span>
                                              </td>
                                              <td align="right" valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 15.5px; font-weight: 800; color: #0B51C1; letter-spacing: 0.5px;">${displayPassword}</span>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Important Note Amber Container -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #fef3c7; border-left: 4px solid #ea580c; border-radius: 6px; background-color: #fffbef; border-collapse: separate; margin-bottom: 25px;">
                                <tr>
                                  <td style="padding: 15px 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                        <td valign="top" style="width: 20px; padding-right: 12px; font-size: 18px; line-height: 1;">
                                          ⚠️
                                        </td>
                                        <td valign="top" style="font-family: 'Inter', sans-serif; text-align: left;">
                                          <span style="font-size: 15px; font-weight: 800; color: #78350f; display: block; margin-bottom: 5px;">Important Note</span>
                                          <span style="font-size: 13.5px; color: #78350f; line-height: 1.5; display: block;">
                                            Please ensure that you complete the assessment within the stipulated timeline. Use a stable internet connection and attempt the test in a distraction-free environment for the best experience.
                                          </span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Support contact line -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                                <tr>
                                  <td valign="middle" style="width: 24px; padding-right: 12px; font-size: 20px; line-height: 1; text-align: center;">
                                    🎧
                                  </td>
                                  <td valign="middle" style="font-family: 'Inter', sans-serif; text-align: left; font-size: 13.5px; color: #475569; line-height: 1.5;">
                                    If you encounter any issues while accessing the assessment portal, please feel free to contact our recruitment team at <a href="mailto:support@amanzi.com" style="color: #0B51C1; text-decoration: underline; font-weight: 700;">support@amanzi.com</a>.
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Closing Greeting -->
                              <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">We wish you all the best for your assessment.</p>
                              
                              <p style="margin: 0 0 4px 0; font-size: 13.5px; color: #64748b;">Regards,</p>
                              <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 800; color: #0B51C1;">Amanzi Tech Hiring Team</p>
                              <p style="margin: 0; font-size: 13.5px; color: #475569;">Recruitment Department</p>
                              
                              <!-- Divider Shield -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; margin-bottom: 25px;">
                                <tr>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 45%;">&nbsp;</td>
                                  <td align="center" valign="middle" style="padding: 0 12px; font-size: 16px; line-height: 1; text-align: center; color: #64748b;">
                                    🛡️
                                  </td>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 45%;">&nbsp;</td>
                                </tr>
                              </table>
                              
                              <!-- Footer Branding -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="font-family: 'Inter', sans-serif; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
                                    <p style="margin: 0 0 6px 0;">This is an automated email from <strong style="color: #475569;">Amanzi Tech ATS</strong>. Please do not reply directly to this email.</p>
                                    <p style="margin: 0;">&copy; ${year} Amanzi Tech. All rights reserved.</p>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
            </table>
          </center>
        </body>
        </html>
  `;

  const artifactDir = "C:\\Users\\ABHINAV VATS\\.gemini\\antigravity-ide\\brain\\aef24f35-c92d-4629-8896-44299c7aa0f7";
  const outputPath = path.join(artifactDir, "email_preview.html");
  await fs.writeFile(outputPath, html);
  console.log(`Email HTML preview generated successfully at: ${outputPath}`);
}

generateEmailPreview();
