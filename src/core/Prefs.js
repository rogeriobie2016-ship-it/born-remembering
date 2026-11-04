const STORAGE_KEY = 'born-remembering:prefs';

const DEFAULTS = {
  subtitles: true,
  smooth: false, // smooth walking in VR (teleport and snap turn are always on)
};

/** The viewer's settings, remembered between visits. Works without storage (private windows). */
export class Prefs {
  constructor() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {}
    Object.assign(this, DEFAULTS, saved);
  }

  set(key, value) {
    this[key] = value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ subtitles: this.subtitles, smooth: this.smooth }));
    } catch {}
  }
}
