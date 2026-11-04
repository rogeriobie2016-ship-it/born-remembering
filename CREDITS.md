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
| **Changes** | Simplified from 500,000 to about 125,000 triangles, specks removed, ambient occlusion baked into the vertices, quantised (`art/tools/canova.mjs`) |
| **In the piece** | `public/art/psyche/canova.bin` |

What the licence asks:

- **Attribution**: Scan The World must be credited, and the changes stated. The credits screen does.
- **Non-commercial**: the mesh may not be used commercially. If the piece is ever sold or licensed, replace this mesh first.
- **Share-alike**: `canova.bin` is an adaptation and stays under CC BY-NC-SA 4.0. That covers this file, not the rest of the piece.

A copy on Sketchfab (3DLadnik, "3D Printable Psyche Revived By Cupid") is labelled CC BY, but its own description says it is a
remix of this same scan, so that label was not relied on.

## Paintings in the Eros and Psyche chapter

All from Wikimedia Commons, public domain. See `art/src/list4.tsv`.

- Edward Burne-Jones, *Palace Green Murals*, 1872–81 (Birmingham Museums Trust): *Psyche, Holding the Lamp, Gazes at Cupid*; *Cupid Finding Psyche Asleep by a Fountain*
- Edward Burne-Jones, *Psyche Entering the Portals of Olympus*, Palace Green Murals (Google Art Project)
- John William Waterhouse, *Psyche Opening the Golden Box*, 1903; *Psyche Entering Cupid's Garden*, 1903 (Harris Museum)
- William-Adolphe Bouguereau, *The Abduction of Psyche*, 1895
