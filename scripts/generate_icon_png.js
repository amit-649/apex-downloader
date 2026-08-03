const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const pngPath = path.join(__dirname, '..', 'public', 'icon.png');
  const desktopPath = 'C:\\Users\\Amit\\Desktop\\apex_icon.png';

  // High-precision vector SVG designed specifically for flawless PNG rasterization
  const cleanSvgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <defs>
    <linearGradient id="apexBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF007A" />
      <stop offset="45%" stop-color="#E60023" />
      <stop offset="100%" stop-color="#7928CA" />
    </linearGradient>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="28" flood-color="#E60023" flood-opacity="0.4" />
    </filter>
  </defs>

  <g filter="url(#softGlow)">
    <!-- Outer Chevron Outer Shell -->
    <path 
      d="M512 90 L90 850 H290 L512 430 L734 850 H934 Z" 
      fill="url(#apexBg)" 
    />
    <!-- Inner White Triangle Frame -->
    <path 
      d="M512 430 L310 850 H714 Z" 
      fill="none" 
      stroke="#FFFFFF" 
      stroke-width="52" 
      stroke-linejoin="round" 
      stroke-linecap="round" 
    />
  </g>
</svg>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=2']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 1024px; height: 1024px; }
          svg { width: 1024px; height: 1024px; display: block; shape-rendering: geometricPrecision; text-rendering: geometricPrecision; }
        </style>
      </head>
      <body>
        ${cleanSvgContent}
      </body>
    </html>
  `;

  await page.setContent(html);

  // Save to public/icon.png
  await page.screenshot({ path: pngPath, type: 'png', omitBackground: true });

  // Save copy to Desktop
  try {
    await page.screenshot({ path: desktopPath, type: 'png', omitBackground: true });
    console.log(`Successfully generated ultra-crisp PNG to Desktop: ${desktopPath}`);
  } catch (err) {
    console.log("Saved to public/icon.png");
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
