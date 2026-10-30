# We Are Born Remembering, But We Learn to Forget

An immersive WebXR piece for Meta Quest (browser), phones and computers.
Three.js + WebXR, Web Audio, Web Speech. No backend; static deploy.

> Status: **all scenes built** (0–8 + credits), menu with chapters and credits. Music still uses
> synthetic placeholders until the public-domain recordings are added (see `public/audio/README.md`).

## Flow (≈ 7–8 min)

| # | Scene | File | Interaction |
|---|---|---|---|
| 0 | Title + menu | `TitleScene.js`, `ui.js` | Begin · Enter VR · Chapters · Credits |
| 1 | Prologue — the poem, verse by verse | `PrologueScene.js` | — |
| 2 | The crib — blurred eyes, giant hands, muffled voices; every word becomes a cry | `CribScene.js` (`phase: birth`) | click / tap / trigger = try to speak |
| 3 | Icarus — the window light becomes the sun; the hand slips; the fall | `CribScene.js` → `IcarusScene.js` | look at the light; hold on |
| 4 | Beethoven — silence, vibrations, then the music, overwhelming | `CribScene.js` (`phase: hearing`) → `BeethovenScene.js` | look toward the sound; play |
| 5 | Forgetting — memories return fainter; Für Elise warps | `ForgettingScene.js` | reach for a memory |
| 6 | The choice — your mother's hand | `ChoiceScene.js` | **hold her hand** or **let go** |
| 7A | Holding on — you watch her go, and remember everything | `EndHoldScene.js` | — |
| 7B | Letting go — a long life alone; you close your eyes | `EndLetGoScene.js` | — |
| 8 | Every life at once — montage, the full poem | `FinaleScene.js` | begin again · credits |
| — | Credits | `CreditsScene.js` | begin again |

## Run locally

```bash
npm install
npm run dev        # HTTPS on your network: https://localhost:5173 and https://<your-PC-IP>:5173
npm run dev:http   # plain HTTP, localhost only (desktop testing, or Quest via USB)
```

The HTTPS certificate is self-signed: the browser warns once, accept it ("Advanced → Proceed").

Useful while building:

- `?debug` — FPS / draw calls / current scene in the corner, and `window.app` in the console
- `?scene=icarus` — Begin jumps straight to that scene (`title, prologue, crib, icarus, beethoven, forgetting, choice, endHold, endLetGo, finale`)
- `?scene=crib&phase=hearing`, `?scene=finale&ending=letgo` — scene parameters · `?speed=4` — fast-forward timelines (testing)
- **N** key — skip to the next scene · **Esc** — menu (pause, chapters, credits, narration / sound / motion)

## Test on a phone (same Wi-Fi)

1. `npm run dev` on the PC. Windows may ask to let Node through the firewall: allow it on **private networks**.
2. On the phone open `https://<your-PC-IP>:5173` (find the IP with `ipconfig`, "IPv4 Address").
3. Accept the certificate warning (iPhone: "Show Details → visit this website").
4. Tap **Begin**. On iPhone, allow "Motion & Orientation" so moving the phone looks around. Dragging always works too.

## Test on Meta Quest

**Option A — Wi-Fi:** Quest Browser → `https://<your-PC-IP>:5173` → accept the warning → **Enter VR**.

**Option B — USB cable (no certificate hassle):** enable developer mode, connect the cable, then

```bash
adb reverse tcp:5174 tcp:5174
npm run dev:http -- --port 5174
```

and open `http://localhost:5174` in Quest Browser (localhost counts as secure, so WebXR works).

**Option C — deploy** (simplest for the hackathon): `npm run build` and upload `dist/` to Netlify Drop
(https://app.netlify.com/drop), or push to GitHub Pages / Vercel. Any HTTPS host works; the build uses relative paths.

## Controls (same everywhere)

| | Look | Choose |
|---|---|---|
| Quest | turn your head | gaze at a light until the ring fills, or point + trigger / pinch |
| Phone | move the phone (gyro) or drag | gaze ring, or tap the light |
| Computer | drag with the mouse, arrows / WASD | gaze ring, click, or Space / Enter |

Tapping / clicking empty space is passed to the scene (the crib uses it to "try to speak").

## Editing content

All text (poem, title, narration, UI labels), timing settings and music file names are in
[`src/content.js`](src/content.js). Music goes in [`public/audio/`](public/audio/README.md).

## Code map

```
src/main.js              renderer, camera rig, XR session, main loop
src/content.js           every editable text + audio manifest
src/ui.js                HTML title screen + flat-screen HUD (narration / sound / motion toggles, Enter VR)
src/core/SceneManager.js scene state machine + BaseScene (enter / start / update / exit)
src/core/Fader.js        fade to black / white (works in VR)
src/core/Input.js        gaze + dwell ring, click / tap, XR controllers, keyboard
src/core/LookControls.js drag / keys / gyroscope look-around (flat screens)
src/core/AudioSystem.js  music crossfades, spatial SFX, synthetic placeholders
src/core/Narrator.js     speechSynthesis narration (toggle)
src/core/TextBlock.js    3D text that appears word by word
src/core/props.js        Dust particles, Orb (selectable light)
src/scenes/              one file per scene; index.js = registry + order
```

## Credits

- Poem: Alfred, Lord Tennyson, *In Memoriam A.H.H.*, canto XXVII (1850) — public domain.
- Music: Ludwig van Beethoven — recordings and performers listed in `public/audio/README.md`.
- Font: Cormorant Garamond (SIL Open Font License), via Google Fonts.
- three.js (MIT).
