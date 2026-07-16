/**
 * Capture README screenshots from demo URL scenes.
 * Usage: npm run screenshots
 * Requires: npm install && npx playwright install chromium
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from 'serve-handler';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const PORT = 4173;

const SCENES = [
  { id: 'dashboard', file: 'dashboard.png', wait: 600 },
  { id: 'lesson', file: 'lesson.png', wait: 700 },
  { id: 'quiz', file: 'quiz.png', wait: 600 },
  { id: 'feedback', file: 'feedback.png', wait: 700 },
  { id: 'death', file: 'death.png', wait: 900 },
  { id: 'survival', file: 'survival.png', wait: 600 },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const server = http.createServer((req, res) =>
    handler(req, res, { public: root })
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 420, height: 820 },
    deviceScaleFactor: 2,
  });

  for (const scene of SCENES) {
    const url = `http://127.0.0.1:${PORT}/?demo=${scene.id}`;
    console.log('Capturing', scene.id, '→', scene.file);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(scene.wait);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const el = document.getElementById('screen-flash');
      if (el) el.className = 'screen-flash';
    });
    await page.waitForTimeout(100);
    await page.screenshot({
      path: path.join(outDir, scene.file),
      type: 'png',
      fullPage: scene.id === 'dashboard' || scene.id === 'lesson',
    });
  }

  await browser.close();
  server.close();
  console.log('Wrote screenshots to', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
