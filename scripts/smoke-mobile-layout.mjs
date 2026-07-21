/**
 * Mobile layout audit: typed quiz input dock + lesson cards.
 *
 * Tests what matters on real phones:
 * 1. Input lives in #typed-input-dock (body child), not inside #app
 * 2. At shrunk viewport height (keyboard resized), input stays visible
 * 3. On full-height viewport with focused input, dock lifts above estimated keyboard
 *
 * Run: npm run smoke:mobile
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

const MOBILE = { width: 390, height: 844 };
const KEYBOARD_RESIZED = { width: 390, height: 400 };

function assertOk(label, rows) {
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    throw new Error(`${label}\n  ${bad.map((r) => JSON.stringify(r)).join('\n  ')}`);
  }
}

async function auditRects(page, checks) {
  return page.evaluate((items) => {
    return items.map(({ sel, maxBottom }) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, ok: false, note: 'missing' };
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return { sel, ok: false, note: 'hidden', ...r.toJSON?.() };
      }
      const bottomLimit = maxBottom ?? window.innerHeight;
      const ok = r.width > 0 && r.height > 0 && r.top >= -2 && r.bottom <= bottomLimit + 2;
      return {
        sel,
        ok,
        top: r.top,
        bottom: r.bottom,
        maxBottom: bottomLimit,
        note: ok ? 'ok' : 'clipped',
      };
    });
  }, checks);
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

async function auditTypedDock(page, tag, visibleBottom) {
  await page.waitForSelector('#typed-input-dock.is-active', { timeout: 5000 });
  const dockParent = await page.evaluate(() => {
    const dock = document.getElementById('typed-input-dock');
    const input = document.getElementById('answer-input');
    return {
      dockInBody: dock?.parentElement === document.body,
      inputInDock: input?.closest('#typed-input-dock') != null,
      dockBottom: dock?.style.bottom || '',
      position: dock ? getComputedStyle(dock).position : '',
    };
  });
  if (!dockParent.dockInBody) throw new Error(`${tag}: dock not direct child of body`);
  if (!dockParent.inputInDock) throw new Error(`${tag}: input not inside dock`);
  if (dockParent.position !== 'fixed') throw new Error(`${tag}: dock not position:fixed`);

  await page.focus('#answer-input');
  await page.waitForTimeout(100);

  assertOk(`${tag} dock visible`, await auditRects(page, [
    { sel: '#typed-input-dock', maxBottom: visibleBottom },
    { sel: '#answer-input', maxBottom: visibleBottom },
    { sel: '#answer-submit-btn', maxBottom: visibleBottom },
    { sel: '#test-exit-btn', maxBottom: visibleBottom },
  ]));
}

async function auditLesson(page, tag, vh) {
  for (const slide of ['intro', 'symbol', 'practice', 'teaching']) {
    await showLessonSlide(page, slide);
    assertOk(`${tag} ${slide}`, await auditRects(page, [
      { sel: '#lesson-primary-btn', maxBottom: vh },
      { sel: '#lesson-exit-btn', maxBottom: vh },
    ]));
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

  const scenarios = [
    {
      name: 'mobile-full-quiz',
      viewport: MOBILE,
      url: '/?demo=quiz',
      run: (page) => auditTypedDock(page, 'mobile-full-quiz', MOBILE.height),
    },
    {
      name: 'mobile-full-feedback',
      viewport: MOBILE,
      url: '/?demo=feedback',
      run: (page) => auditTypedDock(page, 'mobile-full-feedback', MOBILE.height),
    },
    {
      name: 'mobile-keyboard-quiz',
      viewport: KEYBOARD_RESIZED,
      url: '/?demo=feedback',
      run: (page) => auditTypedDock(page, 'mobile-keyboard-quiz', KEYBOARD_RESIZED.height),
    },
    {
      name: 'mobile-focus-lift',
      viewport: MOBILE,
      url: '/?demo=feedback',
      run: async (page) => {
        await page.waitForSelector('#typed-input-dock.is-active');
        await page.locator('#answer-input').tap();
        await page.waitForTimeout(250);
        const visibleBottom = Math.round(MOBILE.height * 0.52);
        assertOk('mobile-focus-lift', await auditRects(page, [
          { sel: '#answer-input', maxBottom: visibleBottom },
          { sel: '#answer-submit-btn', maxBottom: visibleBottom },
        ]));
        const lifted = await page.evaluate(() => {
          const dock = document.getElementById('typed-input-dock');
          return {
            bottom: dock?.style.bottom || '',
            typing: document.body.classList.contains('typing-focus'),
            vvH: window.visualViewport?.height ?? window.innerHeight,
            innerH: window.innerHeight,
          };
        });
        if (!lifted.typing) throw new Error('mobile-focus-lift: typing-focus not set after tap');
        if (!lifted.bottom || parseInt(lifted.bottom, 10) < 200) {
          throw new Error(`mobile-focus-lift: dock not lifted (${lifted.bottom}) vv=${lifted.vvH} inner=${lifted.innerH}`);
        }
      },
    },
    {
      name: 'mobile-overlay-keyboard',
      viewport: MOBILE,
      url: '/?demo=quiz',
      run: async (page) => {
        await page.waitForSelector('#typed-input-dock.is-active');
        await page.locator('#answer-input').tap();
        await page.waitForTimeout(250);
        const metrics = await page.evaluate(() => {
          const input = document.getElementById('answer-input');
          const r = input.getBoundingClientRect();
          const liftLine = window.innerHeight * 0.52;
          return {
            dockBottom: document.getElementById('typed-input-dock')?.style.bottom || '',
            inputBottom: r.bottom,
            liftLine,
            innerH: window.innerHeight,
            ok: r.bottom <= liftLine + 2,
          };
        });
        if (!metrics.ok) {
          throw new Error(`mobile-overlay-keyboard: input not lifted above keyboard zone (${JSON.stringify(metrics)})`);
        }
      },
    },
    {
      name: 'mobile-full-lesson',
      viewport: MOBILE,
      url: '/?demo=lesson',
      run: (page) => auditLesson(page, 'mobile-full-lesson', MOBILE.height),
    },
    {
      name: 'mobile-keyboard-lesson',
      viewport: KEYBOARD_RESIZED,
      url: '/?demo=lesson',
      run: (page) => auditLesson(page, 'mobile-keyboard-lesson', KEYBOARD_RESIZED.height),
    },
  ];

  try {
    for (const sc of scenarios) {
      const context = await browser.newContext({
        viewport: sc.viewport,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}${sc.url}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#app .shell-frame', { timeout: 10000 });
        await page.waitForTimeout(150);
        await sc.run(page);
        await page.screenshot({ path: path.join(OUT, `${sc.name}.png`), fullPage: false });
        console.log(`OK ${sc.name}`);
      } catch (err) {
        failures.push({ tag: sc.name, err: err.message });
        await page.screenshot({ path: path.join(OUT, `${sc.name}-FAIL.png`), fullPage: false });
        console.error(`FAIL ${sc.name}: ${err.message}`);
      }
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} failure(s). Screenshots in ${OUT}`);
    process.exit(1);
  }
  console.log(`\nAll mobile layout checks passed. Screenshots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
