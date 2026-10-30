# Audio — Beethoven, public-domain recordings only

Drop the files here with **exactly these names** (MP3 plays everywhere, including iPhone).
Until a file exists, the app plays a synthetic chord pad in its place, so you can test without them.

| File | Piece | Used in |
|---|---|---|
| `beethoven-moonlight-sonata-1st-mvt.mp3` | Piano Sonata No. 14 "Moonlight", Op. 27 No. 2 — I. Adagio sostenuto | Prologue, crib |
| `beethoven-symphony-7-2nd-mvt.mp3` | Symphony No. 7, Op. 92 — II. Allegretto | Icarus memory |
| `beethoven-symphony-9-4th-mvt.mp3` | Symphony No. 9, Op. 125 — IV. (choral finale) | Beethoven memory |
| `beethoven-fur-elise.mp3` | Bagatelle No. 25 "Für Elise", WoO 59 | Forgetting (distorted in code) |

File names and titles live in `src/content.js` (`AUDIO`).

## Where to find public-domain recordings

The composition is public domain, but **the recording must be too** (or CC0). Good sources:

- **Musopen** — https://musopen.org/music/composer/ludwig-van-beethoven/ (check each recording's licence says "Public Domain")
- **Wikimedia Commons** — https://commons.wikimedia.org/wiki/Category:Audio_files_of_music_by_Ludwig_van_Beethoven (many Musopen recordings are mirrored here; the file page shows the licence)

Keep each file under ~5 MB (trim or encode at 128 kbps) so it loads fast on the Quest and on phones.

## Credits

| File | Recording | Source | Licence | Edit |
|---|---|---|---|---|
| `beethoven-moonlight-sonata-1st-mvt.mp3` | Paul Pitman, piano, for Musopen | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27,_op._27_no._2_-_i._adagio_sostenuto.ogg) | Public domain | Full movement, MP3 112 kbps, 4 s fade-out |
| `beethoven-symphony-7-2nd-mvt.mp3` | Philadelphia Orchestra, cond. Leopold Stokowski (Victor, 1927) | [Internet Archive](https://archive.org/details/BeethovenSymphonyNo.7_807) | Public Domain Mark 1.0 | First 5:15, MP3 112 kbps, 6 s fade-out |
| `beethoven-symphony-9-4th-mvt.mp3` | Synthesised rendering of a MIDI sequence (no choir) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sinfonia_n._9_Quarto_Movimento.ogg) | Public domain | 4:53–8:53 (starts on the orchestral "Joy" tutti), MP3 112 kbps |
| `beethoven-fur-elise.mp3` | Recording by "Qoo" | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Beethoven_F%C3%BCr_Elise_Rondo.ogg) | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) — attribution required; this MP3 is shared under the same licence | Converted to MP3 128 kbps (detuning happens live in code) |

## Sound effects

| File | Recording | Source | Licence | Edit |
|---|---|---|---|---|
| `cry-newborn-1.mp3`, `cry-newborn-2.mp3` | "Crying newborn baby child 2" by the_yura (Freesound) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Crying_newborn_baby.ogg) | CC0 | Cut 0:00–0:03.4 and 0:08–0:12.3, mono, loudness-normalised, MP3 96 kbps |
| `cry-baby-1.mp3`, `cry-baby-2.mp3` | "Baby long wanting cry" by natalie (PDSounds) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Baby_long_wanting_cry.ogg) | Public domain | Cut 0:09.1–0:13.4 and 0:01.1–0:04.4, mono, loudness-normalised, MP3 96 kbps |

Used by `CribScene.js` (`cry0`–`cry3`, one per attempt to speak) and `FinaleScene.js` (`cry-finale`). If a file is missing, the old synthesized cry plays instead.
