/**
 * Mobile layout audit: typed quiz + lesson cards at full and keyboard-open heights.
 * Simulates keyboard overlay via visualViewport mock + input pinning.
 *
 * Run: node scripts/smoke-mobile-layout.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from 'serve-handler';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 4175;
const OUT = path.join(root, 'docs', 'screenshots', 'mobile-audit');

const VIEWPORTS = [
  { name: 'mobile-full', width: 390, height: 844 },
  { name: 'mobile-keyboard', width: 390, height: 400 },
  { name: 'mobile-overlay', width: 390, height: 844, visibleHeight: 380 },
];

function assertInViewport(label, audit) {
  const bad = audit.filter((r) => !r.ok);
  if (bad.length) {
    const detail = bad
      .map((r) => `${r.sel}: top=${r.top?.toFixed?.(0) ?? '?'} bottom=${r.bottom?.toFixed?.(0) ?? '?'} vh=${r.vh} ${r.note || ''}`)
      .join('\n  ');
    throw new Error(`${label}\n  ${detail}`);
  }
}

async function auditPage(page, selectors, vhOverride) {
  return page.evaluate(({ sels, vhOverride }) => {
    const vh = vhOverride || window.innerHeight;
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, ok: false, note: 'missing', bottom: 0, top: 0, vh };
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return { sel, ok: false, note: 'hidden', bottom: r.bottom, top: r.top, vh };
      }
      const ok = r.width > 0 && r.height > 0 && r.top >= -2 && r.bottom <= vh + 2;
      return { sel, ok, top: r.top, bottom: r.bottom, vh, note: ok ? 'ok' : 'clipped' };
    });
  }, { sels: selectors, vhOverride });
}

async function showLessonSlide(page, type) {
  await page.evaluate((slideType) => {
    const lesson = LESSONS.find((l) => l.id === state.currentLessonId);
    lessonSlides = buildLessonSlides(lesson);
    const idx = lessonSlides.findIndex((s) => s.type === slideType);
    if (idx < 0) throw new Error('No slide ' + slideType);
    lessonSlideIdx = idx;
    lessonReveal = {};
    animCtx.cardFlip = false;
    render();
  }, type);
  await page.waitForTimeout(120);
}

async function simulateKeyboardOverlay(page, visibleHeight) {
  await page.evaluate((h) => {
    const listeners = { resize: [], scroll: [] };
    const vv = {
      width: window.innerWidth,
      height: h,
      offsetTop: 0,
      offsetLeft: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
      removeEventListener() {},
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    document.body.classList.add('keyboard-open', 'typing-focus');
    if (typeof applyViewportKeyboard === 'function') applyViewportKeyboard();
    if (typeof pinTypedInputToViewport === 'function') pinTypedInputToViewport();
  }, visibleHeight);
  await page.waitForTimeout(100);
}

async function auditTypedQuiz(page, tag, vh) {
  await page.focus('#answer-input');
  const audit = await auditPage(page, [
    '#answer-input',
    '#answer-submit-btn, .test-compact-submit',
    '#test-exit-btn, .test-compact-exit',
    '.test-compact-main, .thai-glyph-hero',
  ], vh);
  assertInViewport(tag, audit);
  if (await page.locator('.fb-strip').count()) {
    assertInViewport(`${tag} feedback`, await auditPage(page, ['.fb-strip'], vh));
  }
}

async function auditLessonSlides(page, tag, vh) {
  for (const slide of ['intro', 'symbol', 'practice', 'teaching']) {
    await showLessonSlide(page, slide);
    assertInViewport(`${tag} ${slide} actions`, await auditPage(page, [
      '#lesson-primary-btn',
      '#lesson-exit-btn',
    ], vh));
    const stage = await auditPage(page, ['.lesson-stage'], vh);
    const stageEl = stage[0];
    if (!stageEl?.ok) {
      throw new Error(`${tag} ${slide}: lesson-stage missing`);
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => handler(req, res, { public: root }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  const browser = await chromium.launch({ headless: true });
  const failures = [];

  try {
    for (const vp of VIEWPORTS) {
      for (const scene of ['quiz', 'feedback', 'lesson']) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        const tag = `${vp.name}-${scene}`;
        const vh = scene === 'lesson' ? vp.height : (vp.visibleHeight || vp.height);
        try {
          const url = scene === 'lesson' ? '/?demo=lesson' : `/?demo=${scene}`;
          await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'networkidle' });
          await page.waitForSelector('#app .shell-frame', { timeout: 10000 });
          await page.waitForTimeout(150);

          if (vp.visibleHeight && scene !== 'lesson') {
            await simulateKeyboardOverlay(page, vp.visibleHeight);
          }

          if (scene === 'lesson') {
            await auditLessonSlides(page, tag, vh);
          } else {
            await auditTypedQuiz(page, tag, vh);
          }

          await page.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: false });
          console.log(`OK ${tag}`);
        } catch (err) {
          failures.push({ tag, err: err.message });
          await page.screenshot({ path: path.join(OUT, `${tag}-FAIL.png`), fullPage: false });
          console.error(`FAIL ${tag}: ${err.message}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} layout failure(s). Screenshots in ${OUT}`);
    process.exit(1);
  }
  console.log(`\nAll mobile layout checks passed. Screenshots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
