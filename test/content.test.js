// Checks that run before every commit (and in CI before deploying): the text in
// content.js is complete, every scene the flow names exists, and every painting
// and recording the code asks for is actually in public/.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as content from '../src/content.js';
import { SCENES, ORDER } from '../src/scenes/index.js';

const root = join(import.meta.dirname, '..');
const sceneDir = join(root, 'src/scenes');
const sources = Object.fromEntries(
  readdirSync(sceneDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => [f, readFileSync(join(sceneDir, f), 'utf8')]),
);

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

describe('content', () => {
  it('has a title, the poem and the UI strings', () => {
    expect(nonEmpty(content.TITLE)).toBe(true);
    expect(content.POEM.stanza).toHaveLength(4);
    for (const v of Object.values(content.UI)) expect(nonEmpty(v)).toBe(true);
  });

  it('gives every myth quotation a source', () => {
    for (const [name, m] of Object.entries(content.MYTHS)) {
      const hasSource = nonEmpty(m.source) || (m.sources && Object.values(m.sources).every(nonEmpty));
      expect(hasSource, `MYTHS.${name} has no source`).toBe(true);
    }
  });

  it('has a right answer among the Sphinx’s lights', () => {
    const { options, right } = content.SPHINX;
    expect(options[right]).toBeDefined();
  });

  it('lists credits with no empty names', () => {
    for (const { role, names } of content.CREDITS) {
      expect(nonEmpty(role)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(nonEmpty(n), `empty name under ${role}`).toBe(true);
    }
  });
});

describe('scene flow', () => {
  it('registers every scene in ORDER and every chapter', () => {
    for (const id of ORDER) expect(SCENES[id], `ORDER names "${id}"`).toBeDefined();
    for (const c of content.CHAPTERS) expect(SCENES[c.scene], `chapter "${c.label}"`).toBeDefined();
  });

  it('only jumps to scenes that exist (next / skipTo / goto)', () => {
    for (const [file, src] of Object.entries(sources)) {
      for (const [, id] of src.matchAll(/(?:\.next|skipTo\s*=|goto)\(?\s*'([A-Za-z]+)'/g)) {
        expect(SCENES[id], `${file} jumps to "${id}"`).toBeDefined();
      }
    }
  });
});

describe('assets', () => {
  it('has every painting cut-out a scene loads', () => {
    const missing = [];
    for (const [file, src] of Object.entries(sources)) {
      for (const [, dir, list] of src.matchAll(/loadArt\(\s*'([\w-]+)'\s*,\s*\[([^\]]*)\]/g)) {
        for (const [, name] of list.matchAll(/'([\w-]+)'/g)) {
          const p = join(root, 'public/art', dir, `${name}.webp`);
          if (!existsSync(p)) missing.push(`${file}: art/${dir}/${name}.webp`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has every recording in AUDIO', () => {
    for (const [id, a] of Object.entries(content.AUDIO)) {
      expect(existsSync(join(root, 'public/audio', a.file)), `AUDIO.${id}: ${a.file}`).toBe(true);
    }
  });
});
