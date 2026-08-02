const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const svgPath = path.join(__dirname, '..', 'public', 'og-image.svg');
  const pngPath = path.join(__dirname, '..', 'public', 'og-image.png');

  if (!fs.existsSync(svgPath)) {
    console.error("og-image.svg does not exist!");
    process.exit(1);
  }

  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  const html = `
    <! unqualified>
    <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
          svg { width: 1200px; height: 630px; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.screenshot({ path: pngPath, type: 'png', omitBackground: false });

  await browser.close();
  console.log('Successfully generated public/og-image.png (1200x630)!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
