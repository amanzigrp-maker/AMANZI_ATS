
import puppeteer from 'puppeteer';
import fs from 'fs/promises';

async function testPuppeteer() {
  console.log('Starting Puppeteer test...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent('<h1>Hello Puppeteer</h1>');
    const pdf = await page.pdf({ format: 'A4' });
    await fs.writeFile('puppeteer_test.pdf', pdf);
    console.log('✅ Puppeteer test successful! PDF saved to puppeteer_test.pdf');
  } catch (error) {
    console.error('❌ Puppeteer test failed:', error);
  } finally {
    if (browser) await browser.close();
  }
}

testPuppeteer();
