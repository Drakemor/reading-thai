# Reading Thai

**Thai Reading Quest** — a keyboard-first browser tutor for learning to **read** Thai script (not speak it). Progress through Basic → Medium → Advanced lessons, take heart-limited tests, and try endless **Survival** mode.

**Play it:** [https://drakemor.github.io/reading-thai/](https://drakemor.github.io/reading-thai/)

## Screenshots

| Dashboard | Lesson |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Lesson](docs/screenshots/lesson.png) |

| Quiz | Answer feedback |
| --- | --- |
| ![Quiz](docs/screenshots/quiz.png) | ![Feedback](docs/screenshots/feedback.png) |

| Out of hearts | Survival |
| --- | --- |
| ![Death](docs/screenshots/death.png) | ![Survival](docs/screenshots/survival.png) |

## Features

- **Curriculum** of consonants, vowels, and reading rules (closed syllables, tone marks, silent mark, …)
- **Reading quizzes** — type romanization or pick the pronunciation; fonts rotate (looped / modern)
- **Hearts** — miss too many and the test restarts (failed word stays until you continue)
- **Survival** — 3 hearts, length-weighted score, personal best + top runs in `localStorage`
- **Keyboard-first** — ↑↓, Enter, 1–4, Esc
- **8-bit chip audio** for UI / correct / wrong / death (muteable)
- **Cloud sync** — optional Google sign-in via Firebase to back up progress across devices (offline-first; localStorage still works without an account)

## Run locally

Static site — open `index.html`, or:

```bash
npm start
# → http://localhost:4173
```

## Demo / screenshot scenes

Force a mock UI without writing progress (useful for QA and README shots):

| URL | Scene |
| --- | --- |
| `/?demo=dashboard` | Mid-progress home |
| `/?demo=lesson` | Lesson teaching slide |
| `/?demo=quiz` | Active reading question |
| `/?demo=feedback` | Incorrect answer card |
| `/?demo=death` | Out-of-hearts hold screen |
| `/?demo=survival` | Survival run in progress |

Regenerate PNGs:

```bash
npm install
npx playwright install chromium
npm run screenshots
```

## Deploy (GitHub Pages)

This repo is set up for **Pages from the `main` branch root** (`/`). After push, the site is at:

`https://<user>.github.io/reading-thai/`

## Cloud sync (Google + Firebase — free tier)

Progress is stored locally first. To sync across devices with the Firebase Spark (free) plan:

1. Create a free [Firebase](https://firebase.google.com) project (Spark plan).
2. Enable products:
   - Authentication → Sign-in method → enable **Google**
   - Firestore Database → create database (in production mode)
3. Security rules (restrict to the signed-in user only):
   - Open Firestore → Rules, paste `firebase/firestore.rules`, and publish
4. Web app config:
   - Project Settings → General → Your apps (Web) → Register app (no hosting needed)
   - Copy the Web app config values
5. App configuration:
   - Copy `js/config.example.js` → `js/config.js`
   - Set `enabled: true` and fill the `firebase` fields
6. Authorized domains:
   - Authentication → Settings → Authorized domains: add `localhost` and `drakemor.github.io`

On the dashboard, use **Sign in with Google**. Your current device progress is merged with any saved cloud data. Changes upload automatically while you play.

Notes on free tier:
- Firebase Auth (Google) is free to use.
- Firestore Spark tier has generous free reads/writes for small personal projects; avoid heavy analytics writes in gameplay loops (this app debounces to keep usage low).

## Project layout

```
index.html          App shell
css/styles.css      Layout + animations
js/data.js          Symbols, word bank, lessons
js/audio.js         Chip synth
js/app.js           State, quizzes, Survival, demo hooks
js/config.js        Firebase keys (copy from config.example.js)
js/sync.js          Google sign-in + cloud progress sync (Firebase)
firebase/firestore.rules  Firestore security rules (user-only access)
scripts/            Smoke test + screenshot capture
docs/screenshots/   README images
```

## License

MIT
