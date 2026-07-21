/**
 * Mobile layout audit: typed quiz must keep question + feedback visible
 * while the input dock stays above an overlay keyboard.
 *
 * Critical regression this catches:
 * - lifting the dock must NOT crush #app content to zero height
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
    return items.map(({ sel, maxBottom, minHeight }) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, ok: false, note: 'missing' };
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return { sel, ok: false, note: 'hidden', top: r.top, bottom: r.bottom, height: r.height };
      }
      const bottomLimit = maxBottom ?? window.innerHeight;
      const tallEnough = r.height >= (minHeight ?? 1);
      const ok = r.width > 0 && tallEnough && r.top >= -2 && r.bottom <= bottomLimit + 2;
      return {
        sel,
        ok,
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        maxBottom: bottomLimit,
        note: ok ? 'ok' : !tallEnough ? 'too-small' : 'clipped',
      };
    });
  }, checks);
}

async function quizLayoutSnapshot(page) {
  return page.evaluate(() => {
    const dock = document.getElementById('typed-input-dock');
    const input = document.getElementById('answer-input');
    const thai = document.querySelector('#test-question .thai-glyph-hero');
    const feedback = document.querySelector('#test-question .fb-strip');
    const exitBtn = document.getElementById('test-exit-btn');
    const app = document.getElementById('app');
    const dockR = dock?.getBoundingClientRect();
    const thaiR = thai?.getBoundingClientRect();
    const fbR = feedback?.getBoundingClientRect();
    const inputR = input?.getBoundingClientRect();
    return {
      dockInBody: dock?.parentElement === document.body,
      inputInDock: !!input?.closest('#typed-input-dock'),
      dockBottomCss: dock?.style.bottom || '',
      dockTop: dockR?.top ?? null,
      inputBottom: inputR?.bottom ?? null,
      thaiHeight: thaiR?.height ?? 0,
      thaiBottom: thaiR?.bottom ?? null,
      feedbackHeight: fbR?.height ?? 0,
      feedbackBottom: fbR?.bottom ?? null,
      exitHeight: exitBtn?.getBoundingClientRect().height ?? 0,
      appMaxHeight: app?.style.maxHeight || '',
      appPadBottom: app?.style.paddingBottom || '',
      typing: document.body.classList.contains('typing-focus'),
      keyboardOpen: document.body.classList.contains('keyboard-open'),
      vvh: getComputedStyle(document.documentElement).getPropertyValue('--vvh').trim(),
      innerH: window.innerHeight,
    };
  });
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

/** Content + controls must all fit in the visible band above the keyboard zone. */
async function assertQuizUsable(page, tag, visibleBottom) {
  await page.waitForSelector('#typed-input-dock.is-active', { timeout: 5000 });
  const snap = await quizLayoutSnapshot(page);
  if (!snap.dockInBody) throw new Error(`${tag}: dock not direct child of body`);
  if (!snap.inputInDock) throw new Error(`${tag}: input not inside dock`);

  assertOk(`${tag} visible chrome`, await auditRects(page, [
    { sel: '#test-exit-btn', maxBottom: visibleBottom, minHeight: 20 },
    { sel: '#test-question .thai-glyph-hero', maxBottom: visibleBottom, minHeight: 28 },
    { sel: '#answer-input', maxBottom: visibleBottom, minHeight: 36 },
    { sel: '#answer-submit-btn', maxBottom: visibleBottom, minHeight: 36 },
  ]));

  if (snap.thaiBottom != null && snap.dockTop != null && snap.thaiBottom > snap.dockTop + 4) {
    throw new Error(`${tag}: Thai word overlaps dock (thaiBottom=${snap.thaiBottom}, dockTop=${snap.dockTop})`);
  }
}

async function assertFeedbackVisible(page, tag, visibleBottom) {
  assertOk(`${tag} feedback`, await auditRects(page, [
    { sel: '#test-question .fb-strip', maxBottom: visibleBottom, minHeight: 24 },
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
      run: (page) => assertQuizUsable(page, 'mobile-full-quiz', MOBILE.height),
    },
    {
      name: 'mobile-full-feedback',
      viewport: MOBILE,
      url: '/?demo=feedback',
      run: async (page) => {
        await assertQuizUsable(page, 'mobile-full-feedback', MOBILE.height);
        await assertFeedbackVisible(page, 'mobile-full-feedback', MOBILE.height);
      },
    },
    {
      name: 'mobile-keyboard-quiz',
      viewport: KEYBOARD_RESIZED,
      url: '/?demo=feedback',
      run: async (page) => {
        await assertQuizUsable(page, 'mobile-keyboard-quiz', KEYBOARD_RESIZED.height);
        await assertFeedbackVisible(page, 'mobile-keyboard-quiz', KEYBOARD_RESIZED.height);
      },
    },
    {
      name: 'mobile-focus-lift',
      viewport: MOBILE,
      url: '/?demo=feedback',
      run: async (page) => {
        await page.waitForSelector('#typed-input-dock.is-active');
        await page.locator('#answer-input').tap();
        await page.waitForTimeout(300);

        const snap = await quizLayoutSnapshot(page);
        const keyboardTop = Math.round(MOBILE.height * 0.58); // content must stay above ~42% keyboard
        if (!snap.typing) throw new Error('mobile-focus-lift: typing-focus not set after tap');
        if (!snap.dockBottomCss || parseInt(snap.dockBottomCss, 10) < 180) {
          throw new Error(`mobile-focus-lift: dock not lifted (${JSON.stringify(snap)})`);
        }
        // The bug we hit: padding included keyboard inset and crushed content to nothing.
        if (snap.thaiHeight < 28) {
          throw new Error(`mobile-focus-lift: Thai question collapsed (${JSON.stringify(snap)})`);
        }
        if (snap.feedbackHeight < 24) {
          throw new Error(`mobile-focus-lift: feedback collapsed (${JSON.stringify(snap)})`);
        }
        if (snap.exitHeight < 20) {
          throw new Error(`mobile-focus-lift: exit control collapsed (${JSON.stringify(snap)})`);
        }
        if (snap.inputBottom == null || snap.inputBottom > keyboardTop + 2) {
          throw new Error(`mobile-focus-lift: input under keyboard zone (${JSON.stringify(snap)})`);
        }
        await assertQuizUsable(page, 'mobile-focus-lift', keyboardTop);
        await assertFeedbackVisible(page, 'mobile-focus-lift', keyboardTop);
      },
    },
    {
      name: 'mobile-overlay-keyboard',
      viewport: MOBILE,
      url: '/?demo=quiz',
      run: async (page) => {
        await page.waitForSelector('#typed-input-dock.is-active');
        await page.locator('#answer-input').tap();
        await page.waitForTimeout(300);
        const snap = await quizLayoutSnapshot(page);
        const keyboardTop = Math.round(MOBILE.height * 0.58);
        if (snap.thaiHeight < 28) {
          throw new Error(`mobile-overlay-keyboard: lost question (${JSON.stringify(snap)})`);
        }
        if (snap.inputBottom == null || snap.inputBottom > keyboardTop + 2) {
          throw new Error(`mobile-overlay-keyboard: input not above keyboard (${JSON.stringify(snap)})`);
        }
        await assertQuizUsable(page, 'mobile-overlay-keyboard', keyboardTop);
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
