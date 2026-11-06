# Credits and licences

Everything the piece uses that was made by someone else and carries terms. Paintings and engravings are listed
in full in `public/art/README.md`; the credits screen in the piece (`CREDITS` in `src/content.js`) names them too.

## 3D scan: the one asset with conditions

| | |
|---|---|
| **Work** | Antonio Canova, *Psyche Revived by Cupid's Kiss*, 1787–93, marble, Musée du Louvre (MR 1776) |
| **Scan** | Scan The World, photogrammetry (Agisoft PhotoScan), `Louvre Psyche Revived By Cupid 1.Stl` |
| **Source** | https://www.myminifactory.com/object/3d-print-18131 |
| **Licence** | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| **Changes** | Simplified from 500,000 to about 125,000 triangles, specks removed, ambient occlusion baked into the vertices, quantised (`art/tools/scan.mjs`) |
| **In the piece** | `public/art/psyche/canova.bin` |

What the licence asks:

- **Attribution**: Scan The World must be credited, and the changes stated. The credits screen does.
- **Non-commercial**: the mesh may not be used commercially. If the piece is ever sold or licensed, replace this mesh first.
- **Share-alike**: `canova.bin` is an adaptation and stays under CC BY-NC-SA 4.0. That covers this file, not the rest of the piece.

A copy on Sketchfab (3DLadnik, "3D Printable Psyche Revived By Cupid") is labelled CC BY, but its own description says it is a
remix of this same scan, so that label was not relied on.

## 3D scans with no conditions

Simplified to between 55,000 and 120,000 triangles with `art/tools/scan.mjs`, in `public/art/scans/`. The scans themselves are large and are not in this repository.

| File | Work | Chapter | Scan and source | Licence |
|---|---|---|---|---|
| `perseus.bin` | Antonio Canova, *Perseus with the Head of Medusa*, 1804–06, Metropolitan Museum of Art | Medusa | [Scan The World, uploaded by the Met](https://www.myminifactory.com/object/3d-print-perseus-with-the-head-of-medusa-at-the-metropolitan-museum-of-art-new-york-10599) | CC0 |
| `demeter.bin` | *Demeter of Knidos*, plaster cast, KAS128 | Persephone | [SMK, National Gallery of Denmark](https://open.smk.dk/artwork/image/KAS128) | Public Domain Mark |
| `dying-gladiator.bin` | *Dying Gladiator*, plaster cast, KAS1312 | Afterlife | [SMK](https://open.smk.dk/artwork/image/KAS1312) | Public Domain Mark |
| `polyhymnia.bin` | *Polyhymnia*, plaster cast, KAS252 | Beethoven | [SMK](https://open.smk.dk/artwork/image/KAS252) | Public Domain Mark |
| `hypnos.bin` | *Hypnos*, plaster cast, KAS900, without its modern socle | Forgetting | [SMK](https://open.smk.dk/artwork/image/KAS900) | Public Domain Mark |
| `mater-dolorosa.bin` | Germain Pilon, *Seated Virgin of Sorrows*, plaster cast, KAS1999 | Holding on | [SMK](https://open.smk.dk/artwork/image/KAS1999) | Public Domain Mark |
| `penelope.bin` | *Seated woman, Penelope*, plaster cast, KAS202 | Letting go | [SMK](https://open.smk.dk/artwork/image/KAS202) | Public Domain Mark |

## Paintings in the Eros and Psyche chapter

All from Wikimedia Commons, public domain. See `art/src/list4.tsv`.

- Edward Burne-Jones, *Palace Green Murals*, 1872–81 (Birmingham Museums Trust): *Psyche, Holding the Lamp, Gazes at Cupid*; *Cupid Finding Psyche Asleep by a Fountain*
- Edward Burne-Jones, *Psyche Entering the Portals of Olympus*, Palace Green Murals (Google Art Project)
- John William Waterhouse, *Psyche Opening the Golden Box*, 1903; *Psyche Entering Cupid's Garden*, 1903 (Harris Museum)
- William-Adolphe Bouguereau, *The Abduction of Psyche*, 1895
