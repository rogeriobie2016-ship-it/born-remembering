const STORAGE_KEY = 'born-remembering:narration';

/** Provisional voice-over with the Web Speech API. Can be switched off. */
export class Narrator {
  constructor(settings) {
    this.settings = settings;
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    this.enabled = this.supported && (saved === null ? settings.narration : saved === '1');
    this.voice = null;
    if (this.supported) {
      this._pickVoice();
      speechSynthesis.addEventListener?.('voiceschanged', () => this._pickVoice());
    }
  }

  _pickVoice() {
    const voices = speechSynthesis.getVoices();
    const lang = this.settings.voiceLang;
    const nice = /Google|Natural|Neural|Daniel|Serena|Arthur|Libby|Sonia/i;
    this.voice =
      voices.find((v) => v.lang === lang && nice.test(v.name)) ||
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang && v.lang.startsWith('en') && nice.test(v.name)) ||
      voices.find((v) => v.lang && v.lang.startsWith('en')) ||
      null;
  }

  /** Call inside a user gesture (iOS only allows speech after one). */
  unlock() {
    if (!this.supported) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
  }

  setEnabled(on) {
    this.enabled = on && this.supported;
    if (!this.enabled) this.stop();
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {}
  }

  stop() {
    if (this.supported) speechSynthesis.cancel();
  }

  /** Resolves when the line ends (or after a safety timeout). Never rejects. */
  speak(text, { rate, pitch, volume = 1 } = {}) {
    if (!this.enabled) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = this.voice ? this.voice.lang : this.settings.voiceLang;
        u.rate = rate ?? this.settings.voiceRate;
        u.pitch = pitch ?? this.settings.voicePitch;
        u.volume = volume;
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
      } catch {
        finish();
      }
      setTimeout(finish, 1500 + text.length * 110);
    });
  }
}
