# Art — public-domain paintings and engravings

Every image here was cut out, cropped, vignetted or recoloured from a public-domain
(or CC0) work. The originals live in `art/src/` (not shipped); `art/src/list*.tsv`
map each original to its Wikimedia Commons file name. The credits screen lists them
too (`CREDITS` in `src/content.js`).

| Original (`art/src/`) | Work | Licence / source | Used as |
|---|---|---|---|
| `sphinx-moreau.jpg` | Gustave Moreau, *Oedipus and the Sphinx*, 1864 (21.134.1) | CC0 · The Metropolitan Museum of Art | `sphinx/`: sphinx (the pair, cut out), gorge (the painting with the figures lifted out, the gap filled from its own sky and rock), rock, figtree |
| `persephone-crane.jpg` | Walter Crane, *The Fate of Persephone*, 1877 | Public domain · Commons | `persephone/`: rapture (traced by hand), maidens, meadow, orchard, grove-tufts (its narcissi) |
| `proserpina-rubens.jpg` | Peter Paul Rubens, *The Rape of Proserpina*, 1636–38 (Prado) | Public domain · Commons | `persephone/rubens-plate` (printed in the book) |
| `charon-dore.jpg` | Gustave Doré, Charon, plate 10 of Dante's *Inferno*, 1861 | Public domain · Commons | `persephone/`: dore-sky, dore-hill, dore-crowd, dore-bank, dore-water (layers of the pop-up) |
| `proserpine-rossetti.jpg` | Dante Gabriel Rossetti, *Proserpine*, 1874 (Tate) | Public domain · Google Art Project via Commons | `persephone/proserpine` |
| `persephone-leighton.jpg` | Frederic Leighton, *The Return of Persephone*, 1891 | Public domain · Commons | `persephone/`: return, demeter |
| `primavera.jpg` | Sandro Botticelli, *Primavera*, c. 1480 (Uffizi) | Public domain · Google Art Project via Commons | `garden/`: graces, mercury, flora, zephyr-chloris, venus-primavera, cupid, meadow, grove; `persephone/`: grove-crown (its leaves, one by one; oranges turned to pomegranates), grove-bark |
| `venus.jpg` | Sandro Botticelli, *The Birth of Venus*, c. 1485 (Uffizi) | Public domain · Google Art Project via Commons | `garden/`: venus, zephyr-aura, hora, sea |
| `hector-tischbein.jpg` | J. H. W. Tischbein, *Hector's Farewell to Andromache*, 1812 | Public domain · Commons | `crib/`: hector, andromache-face |
| `hector-hayez.jpg` | Francesco Hayez, *Hector Greets Andromache and Astyanax* | Public domain · Commons | `crib/`: hayez, troy-view |
| `hector-fright.jpg` | Benjamin West, *Hector Taking Leave of Andromache: the Fright of Astyanax*, 1766 | CC0 · The Metropolitan Museum of Art | `crib/fright` |
| `hector-deckler.jpg` | Carl Friedrich Deckler, *The Farewell of Hector to Andromache and Astyanax*, before 1918 | Public domain · Commons | `crib/helmet` |
| `amphora.jpg` | Kleophrades Painter, Panathenaic prize amphora, c. 500 BC | CC0 · The Metropolitan Museum of Art | `crib/amphora` |
| `icarus-gowy.jpg` | Jacob Peter Gowy after Rubens, *The Fall of Icarus*, c. 1636 | Public domain · Museo del Prado | `icarus/`: daedalus, icarus |
| `icarus-engraving.jpg` | *The Fall of Icarus*, engraving, 1730 (RP-P-OB-51.285) | CC0 · Rijksmuseum | `icarus/`: boat, rock |
| `sirens-draper.jpg` | Herbert James Draper, *Ulysses and the Sirens*, c. 1909 | Public domain · Commons | `sirens/`: sirens-climbing, siren-rope |
| `sirens-waterhouse.jpg` | John William Waterhouse, *Ulysses and the Sirens*, 1891 | Public domain · Google Art Project via Commons | `sirens/`: harpy-*, ulysses |
| `orpheus-corot.jpg` | Camille Corot, *Orpheus Leading Eurydice from the Underworld*, 1861 | Public domain · Google Art Project via Commons | `orpheus/`: grove, orpheus, eurydice |
| `orpheus-leighton.jpg` | Frederic Leighton, *Orpheus and Eurydice*, 1864 | Public domain · Commons | `orpheus/leighton` |
| `beethoven-vision.jpg` | Rudolf Hausleithner, *Beethoven's Vision*, 1882 | Public domain · Commons | `orpheus/`: muses, beethoven; `beethoven/vision` (the whole painting, framed on the wall) |
| `medusa-caravaggio.jpg` | Caravaggio, *Medusa*, c. 1597 (Uffizi) | Public domain · Commons | `medusa/shield` |
| `medusa-burnejones.jpg` | Edward Burne-Jones, *The Baleful Head*, 1885 | Public domain · Commons | `medusa/baleful-head` |
| (garden, icarus, sirens, orpheus cut-outs) | as above | as above | `medusa/stone-*` (re-tinted as marble) |
| `styx-patinir.jpg` | Joachim Patinir, *Crossing the River Styx*, c. 1520–24 | Public domain · Museo del Prado | `afterlife/styx-band` |
| `elysium-bocklin.jpg` | Arnold Böcklin, *Isle of the Dead* (third version), 1883 | Public domain · Google Art Project via Commons | `afterlife/isle` |
| `cerberus-blake.jpg` | William Blake, *Cerberus*, illustration to Dante's *Inferno*, 1824–27 | Public domain · Commons | `afterlife/cerberus` |
| `elysium-schwabe.jpg` | Carlos Schwabe, *The Elysian Fields*, 1903 | Public domain · Commons | `afterlife/`: elysium-meadow, elysium-lyre |
| `david-andromache.jpg` | Jacques-Louis David, study for *Andromache Mourning Hector* | Public domain · Commons | `endings/david` |
| `argus-engraving.jpg` | Theodoor van Thulden after Primaticcio, *Ulysses Known by Argos*, from *Les Travaux d'Ulysse*, 1633 (BI-1883-1235-37) | CC0 · Rijksmuseum | `endings/argus` |
| `landseer.jpg` | Edwin Landseer, *The Old Shepherd's Chief Mourner*, 1837 | Public domain · Commons | `endings/argos` (silhouette traced by hand) |

Missing files never break a scene: `loadArt()` resolves them to `null` and the scene
leaves that figure out.
