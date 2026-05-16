import { exec } from 'child_process';
import path from 'path';
import fsSync from 'fs';
import { promisify } from 'util';
const execPromise = promisify(exec);
/**
 * Converts a DOCX file to PDF using LibreOffice.
 * @param docxPath Absolute path to the .docx file
 * @returns Absolute path to the generated .pdf file
 */
export async function convertDocxToPdf(docxPath) {
    const ext = path.extname(docxPath).toLowerCase();
    if (ext !== '.docx' && ext !== '.doc') {
        throw new Error('Only .doc and .docx files are supported for PDF conversion');
    }
    const outputDir = path.dirname(docxPath);
    const pdfPath = docxPath.replace(ext, '.pdf');
    // Check if PDF already exists (optional, but good for performance if called multiple times)
    // However, requirements say "automatically convert them to .pdf" during upload, 
    // so we should probably overwrite if it exists to be safe.
    const isWindows = process.platform === 'win32';
    // Windows path provided by user: "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
    // Linux command provided by user: libreoffice --headless --convert-to pdf
    let libreOfficePath = 'libreoffice';
    if (isWindows) {
        const commonPaths = [
            "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
            "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
            "C:\\Program Files\\LibreOffice 7\\program\\soffice.exe",
            "C:\\Program Files\\LibreOffice 6\\program\\soffice.exe"
        ];
        const existingPath = commonPaths.find(p => fsSync.existsSync(p));
        if (existingPath) {
            libreOfficePath = `"${existingPath}"`;
        }
        else {
            // Fallback to checking if it's in the PATH
            try {
                const { stdout } = await execPromise('where.exe soffice');
                if (stdout.trim()) {
                    libreOfficePath = 'soffice';
                }
                else {
                    throw new Error('Not in PATH');
                }
            }
            catch {
                console.error('[FileConverter] CRITICAL: LibreOffice not found in common paths or PATH.');
                console.info('[FileConverter] Please install LibreOffice: https://www.libreoffice.org/download/');
                throw new Error('LibreOffice executable not found. Please install it to enable DOCX to PDF conversion.');
            }
        }
    }
    const command = `${libreOfficePath} --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
    console.log(`[FileConverter] Executing: ${command}`);
    try {
        const { stdout, stderr } = await execPromise(command);
        if (stderr && !stderr.includes('already exists') && !stderr.includes('Warning')) {
            console.warn(`[FileConverter] LibreOffice stderr: ${stderr}`);
        }
        // Verify file was created
        if (fsSync.existsSync(pdfPath)) {
            console.log(`[FileConverter] Successfully converted to: ${pdfPath}`);
            return pdfPath;
        }
        else {
            console.error(`[FileConverter] PDF not found at ${pdfPath} after command execution.`);
            console.log(`[FileConverter] stdout: ${stdout}`);
            throw new Error(`PDF file was not created by LibreOffice. Command: ${command}`);
        }
    }
    catch (error) {
        console.error(`[FileConverter] Conversion failed: ${error.message}`);
        throw error;
    }
}
