/**
 * Smoke: action buttons stay fully in the viewport on desktop + mobile.
 * No screenshots — uses getBoundingClientRect + elementFromPoint via Playwright.
 *
 * Run: npm run smoke:viewport
 * Requires: npm install && npx playwright install chromium
 */
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from 'serve-handler';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 4174;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function auditSelectors(page, selectors) {
  return page.evaluate((sels) => {
    const eps = 1.5;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = [];
    for (const sel of sels) {
      const nodes = [...document.querySelectorAll(sel)];
      if (!nodes.length) {
        out.push({ sel, present: false, fullyInView: false, hittable: false, reason: 'missing' });
        continue;
      }
      nodes.forEach((el, i) => {
        const label = nodes.length > 1 ? `${sel}[${i}]` : sel;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          out.push({ sel: label, present: true, fullyInView: false, hittable: false, reason: 'hidden' });
          return;
        }
        const r = el.getBoundingClientRect();
        const fullyInView =
          r.width > 0 &&
          r.height > 0 &&
          r.top >= -eps &&
          r.left >= -eps &&
          r.bottom <= vh + eps &&
          r.right <= vw + eps;
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
        const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        const stack = document.elementsFromPoint(cx, cy);
        const hit = stack[0];
        const hittable = stack.some((n) => el === n || el.contains(n) || n.contains(el));
        out.push({
          sel: label,
          present: true,
          fullyInView,
          hittable,
          reason: fullyInView && hittable ? 'ok' : !fullyInView ? 'clipped' : 'covered',
          rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height },
          viewport: { vw, vh },
        });
      });
    }
    return out;
  }, selectors);
}

function assertAllOk(label, results) {
  const bad = results.filter((r) => !r.present || !r.fullyInView || !r.hittable);
  if (bad.length) {
    const detail = bad
      .map((r) => `${r.sel}: ${r.reason} ${JSON.stringify(r.rect || {})} vp=${JSON.stringify(r.viewport || {})}`)
      .join('\n  ');
    throw new Error(`${label}\n  ${detail}`);
  }
}

async function gotoDemo(page, scene) {
  await page.goto(`http://127.0.0.1:${PORT}/?demo=${scene}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app .shell-frame', { timeout: 10000 });
  await page.waitForTimeout(150);
}

async function showLessonSlideType(page, type) {
  await page.evaluate((slideType) => {
    const lesson = LESSONS.find((l) => l.id === state.currentLessonId);
    lessonSlides = buildLessonSlides(lesson);
    const idx = lessonSlides.findIndex((s) => s.type === slideType);
    if (idx < 0) throw new Error('No slide of type ' + slideType);
    lessonSlideIdx = idx;
    lessonReveal = {};
    animCtx.cardFlip = false;
    render();
  }, type);
  await page.waitForTimeout(100);
}

async function runViewport(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const tag = vp.name;

  await gotoDemo(page, 'lesson');
  assertAllOk(`${tag} lesson intro`, await auditSelectors(page, [
    '#lesson-exit-btn',
    '#lesson-prev-btn',
    '#lesson-primary-btn',
  ]));

  await showLessonSlideType(page, 'practice');
  assertAllOk(`${tag} lesson flip`, await auditSelectors(page, [
    '#lesson-exit-btn',
    '#lesson-prev-btn',
    '#lesson-primary-btn',
  ]));
  const flipLabel = (await page.locator('#lesson-primary-btn').innerText()).trim();
  if (flipLabel !== 'Flip') throw new Error(`${tag}: expected Flip, got ${flipLabel}`);

  await page.click('#lesson-primary-btn');
  await page.waitForTimeout(120);
  assertAllOk(`${tag} lesson after flip`, await auditSelectors(page, [
    '#lesson-exit-btn',
    '#lesson-prev-btn',
    '#lesson-primary-btn',
  ]));
  const nextLabel = (await page.locator('#lesson-primary-btn').innerText()).trim();
  if (nextLabel !== 'Next') throw new Error(`${tag}: expected Next, got ${nextLabel}`);

  await showLessonSlideType(page, 'test');
  assertAllOk(`${tag} lesson test gate`, await auditSelectors(page, [
    '#lesson-exit-btn',
    '#lesson-prev-btn',
    '#lesson-primary-btn',
  ]));

  await gotoDemo(page, 'quiz');
  const compactTyped = vp.width <= 640;
  if (compactTyped) {
    await page.waitForSelector('#typed-input-dock.is-active', { timeout: 5000 });
  } else {
    await page.waitForSelector('#answer-input', { timeout: 5000 });
  }
  assertAllOk(`${tag} typed quiz`, await auditSelectors(page, [
    '#test-exit-btn',
    '#answer-submit-btn',
  ]));

  await page.evaluate(() => {
    const word = WORDS.find((w) => w.id === 'baa') || WORDS[0];
    seedProgressBefore('basic-6');
    testSession = demoQuizSession({
      wordId: word.id,
      lessonId: 'basic-6',
      type: 'choose_pron',
      current: 0,
      score: 2,
      mistakes: 0,
      heartsTotal: 3,
    });
    testSession.questions[0] = {
      type: 'choose_pron',
      word,
      font: 'looped',
      prompt: 'Choose the pronunciation:',
      options: [
        { text: word.romanizations[0], correct: true },
        { text: 'zzz', correct: false },
        { text: 'yyy', correct: false },
        { text: 'xxx', correct: false },
      ],
    };
    currentScreen = 'test';
    render();
  });
  await page.waitForTimeout(100);
  assertAllOk(`${tag} mc quiz`, await auditSelectors(page, ['#test-exit-btn', '.test-option']));

  await gotoDemo(page, 'death');
  assertAllOk(`${tag} death`, await auditSelectors(page, ['#test-exit-btn', '#primary-action']));

  await page.evaluate(() => {
    seedProgressBefore('basic-6');
    testSession = demoQuizSession({
      wordId: 'baa',
      lessonId: 'basic-6',
      current: 3,
      score: 3,
      mistakes: 0,
      heartsTotal: 3,
      finished: true,
      passed: true,
    });
    testSession.pct = 1;
    currentScreen = 'test';
    render();
  });
  await page.waitForTimeout(100);
  assertAllOk(`${tag} results`, await auditSelectors(page, [
    '#test-exit-btn',
    '#test-dashboard-btn',
    '#primary-action',
  ]));

  await page.close();
}

async function main() {
  const server = http.createServer((req, res) => handler(req, res, { public: root }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`Auditing ${vp.name} ${vp.width}x${vp.height}…`);
      await runViewport(browser, vp);
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('OK — action buttons fully in view (mobile + desktop)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
