import { VRButton } from 'three/addons/webxr/VRButton.js';

const $ = (id) => document.getElementById(id);

/**
 * HTML layer: title screen (scene 0), the in-experience menu (pause, chapters,
 * credits, narration / sound / motion toggles) and the small flat-screen HUD.
 * Callbacks:
 *   onBegin(chapter?)  start — optionally at a chapter { scene, params }
 *   onPause(paused)    the menu opened / closed
 *   onRestart()
 */
export function setupUI({ content, renderer, audio, narrator, look, prefs, isMobile, xrReady, onBegin, onPause, onRestart }) {
  const { UI, TITLE, CHAPTERS, CREDITS } = content;
  let started = false;

  $('title-text').textContent = TITLE;
  $('subtitle-text').textContent = UI.subtitle;
  $('headphones-text').textContent = UI.headphones;
  $('howto-text').textContent = UI.howTo;
  $('menu-title').textContent = TITLE;
  $('chapters-title').textContent = UI.chapters;
  $('credits-title').textContent = UI.credits;
  for (const [id, label] of [
    ['btn-begin', UI.begin],
    ['btn-chapters', UI.chapters],
    ['btn-credits', UI.credits],
    ['btn-resume', UI.resume],
    ['btn-restart', UI.restart],
    ['btn-menu-chapters', UI.chapters],
    ['btn-menu-credits', UI.credits],
    ['btn-menu', UI.menu],
  ])
    $(id).textContent = label;
  document.querySelectorAll('.btn-back').forEach((b) => (b.textContent = UI.back));

  // Everything gesture-gated (audio, speech, iOS motion permission) must start inside the click.
  function unlock() {
    audio.unlock();
    narrator.unlock();
    if (isMobile && !look.gyro) look.enableGyro().then(setGyroLabel);
  }

  function start(chapter) {
    unlock();
    started = true;
    closeMenu(false);
    onBegin(chapter);
  }
  $('btn-begin').addEventListener('click', () => start());

  // ---------- Enter VR ----------
  let vrButton = null;
  xrReady.then(() => {
    if (!navigator.xr) return;
    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((ok) => {
        if (!ok) return;
        vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
        vrButton.addEventListener('click', () => { audio.unlock(); narrator.unlock(); }, true);
        (started ? $('hud-vr-slot') : $('vr-slot')).appendChild(vrButton);
      })
      .catch(() => {});
  });

  // ---------- menu panels ----------
  const menu = $('menu');
  const panels = ['menu-main', 'menu-chapters', 'menu-credits'];
  let menuOpen = false;
  let returnTo = 'menu-main';
  let current = 'menu-main';

  function showPanel(id) {
    current = id;
    for (const p of panels) $(p).classList.toggle('hidden', p !== id);
  }
  function openMenu(panel = 'menu-main') {
    returnTo = started ? 'menu-main' : null;
    showPanel(panel);
    menu.classList.remove('hidden', 'fade');
    if (!menuOpen && started) onPause(true);
    menuOpen = true;
  }
  function closeMenu(resume = true) {
    menu.classList.add('hidden');
    if (menuOpen && resume && started) onPause(false);
    menuOpen = false;
  }
  function back() {
    if (returnTo && current !== returnTo) showPanel(returnTo);
    else closeMenu();
  }

  $('btn-menu').addEventListener('click', () => openMenu());
  $('btn-resume').addEventListener('click', () => closeMenu());
  $('btn-restart').addEventListener('click', () => {
    closeMenu(false);
    onPause(false);
    onRestart();
  });
  $('btn-chapters').addEventListener('click', () => openMenu('menu-chapters'));
  $('btn-credits').addEventListener('click', () => openMenu('menu-credits'));
  $('btn-menu-chapters').addEventListener('click', () => showPanel('menu-chapters'));
  $('btn-menu-credits').addEventListener('click', () => showPanel('menu-credits'));
  document.querySelectorAll('.btn-back').forEach((b) => b.addEventListener('click', back));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (menuOpen) back();
    else if (started) openMenu();
  });

  const list = $('chapter-list');
  CHAPTERS.forEach((ch, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.type = 'button';
    b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>`;
    b.append(ch.label);
    b.addEventListener('click', () => {
      if (started) onPause(false);
      start(ch);
    });
    li.appendChild(b);
    list.appendChild(li);
  });

  const credits = $('credits-list');
  for (const c of CREDITS) {
    const role = document.createElement('p');
    role.className = 'role';
    role.textContent = c.role;
    credits.appendChild(role);
    for (const n of c.names) {
      const name = document.createElement('p');
      name.className = 'name';
      name.textContent = n;
      credits.appendChild(name);
    }
  }

  // ---------- toggles ----------
  const narrationBtn = $('btn-narration');
  const setNarrationLabel = () => (narrationBtn.textContent = narrator.enabled ? UI.narrationOn : UI.narrationOff);
  setNarrationLabel();
  if (!narrator.supported) narrationBtn.classList.add('hidden');
  narrationBtn.addEventListener('click', () => {
    narrator.setEnabled(!narrator.enabled);
    setNarrationLabel();
  });

  const soundBtn = $('btn-sound');
  const setSoundLabel = () => (soundBtn.textContent = audio.muted ? UI.soundOff : UI.soundOn);
  setSoundLabel();
  soundBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    setSoundLabel();
  });

  const subtitlesBtn = $('btn-subtitles');
  const setSubtitlesLabel = () => (subtitlesBtn.textContent = prefs.subtitles ? UI.subtitlesOn : UI.subtitlesOff);
  setSubtitlesLabel();
  subtitlesBtn.addEventListener('click', () => {
    prefs.set('subtitles', !prefs.subtitles);
    setSubtitlesLabel();
  });

  const smoothBtn = $('btn-smooth');
  const setSmoothLabel = () => (smoothBtn.textContent = prefs.smooth ? UI.smoothOn : UI.smoothOff);
  setSmoothLabel();
  smoothBtn.addEventListener('click', () => {
    prefs.set('smooth', !prefs.smooth);
    setSmoothLabel();
  });

  const gyroBtn = $('btn-gyro');
  function setGyroLabel() {
    gyroBtn.textContent = look.gyro ? UI.gyroOn : UI.gyroOff;
  }
  if (isMobile && typeof DeviceOrientationEvent !== 'undefined') {
    gyroBtn.classList.remove('hidden');
    setGyroLabel();
    gyroBtn.addEventListener('click', async () => {
      if (look.gyro) look.disableGyro();
      else await look.enableGyro();
      look.reset();
      setGyroLabel();
    });
  }

  return {
    hideTitle() {
      const el = $('title-screen');
      el.classList.add('fade');
      setTimeout(() => el.classList.add('hidden'), 1200);
      if (vrButton) $('hud-vr-slot').appendChild(vrButton); // keep "Enter VR" reachable mid-experience
    },
    showHud(show = true) {
      $('hud').classList.toggle('hidden', !show);
      if (!show) closeMenu();
    },
  };
}
