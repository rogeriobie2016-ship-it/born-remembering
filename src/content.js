// =====================================================================
//  CONTEÚDO EDITÁVEL — todos os textos, narração e faixas de áudio.
//  Edite à vontade: o código lê tudo daqui. Cada string em `lines`
//  vira uma linha de texto flutuando no espaço 3D (aparece palavra por
//  palavra). Mantenha linhas curtas (até ~40 caracteres) para ficar
//  legível no Quest.
// =====================================================================

export const TITLE = 'We Are Born Remembering, But We Learn to Forget';

// Título em duas linhas, usado dentro do 3D (fim do prólogo).
export const TITLE_LINES = ['We are born remembering,', 'but we learn to forget.'];

// Alfred, Lord Tennyson — In Memoriam A.H.H., canto XXVII (1850). Domínio público.
export const POEM = {
  stanza: [
    'I hold it true, whate’er befall;',
    'I feel it when I sorrow most;',
    '’Tis better to have loved and lost',
    'Than never to have loved at all.',
  ],
  attribution: 'Alfred, Lord Tennyson — In Memoriam A.H.H., 1850',
};

// Interface (tela inicial e botões da tela).
export const UI = {
  subtitle: 'An immersive memory in fourteen scenes',
  begin: 'Begin',
  headphones: 'Headphones recommended · about 16 minutes',
  howTo: {
    desktop: 'Drag to look around. Click whatever glows. In open places, walk with WASD or click the ground.',
    phone: 'Move your phone, or drag, to look around. Tap whatever glows. In open places, tap the ground to walk.',
    xr: 'Turn your head to look around. Point and pull the trigger, or reach out and grip. In open places, walk, or push the stick to teleport.',
  },
  // The small guide at the bottom of a flat screen, for a few seconds in each scene.
  controls: {
    walk: {
      desktop: 'WASD or click the ground to walk  ·  drag to look  ·  click what glows',
      phone: 'Tap the ground to walk  ·  drag to look  ·  tap what glows',
    },
    still: {
      desktop: 'Drag to look  ·  click what glows',
      phone: 'Move your phone to look  ·  tap what glows',
    },
  },
  // Beside the mouse pointer.
  tips: { choose: 'Click', pick: 'Click to pick up', touch: 'Click to touch', shake: 'Click to shake', pull: 'Click to pull', turn: 'Click to turn the page', stop: 'Click to stop' },
  tipThrow: { desktop: 'Click to throw', phone: 'Tap to throw' },
  narrationOn: 'Narration: on',
  narrationOff: 'Narration: off',
  subtitlesOn: 'Subtitles: on',
  subtitlesOff: 'Subtitles: off',
  smoothOn: 'Smooth walking: on',
  smoothOff: 'Smooth walking: off',
  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  gyroOn: 'Motion: on',
  gyroOff: 'Motion: off',
  menu: 'Menu',
  resume: 'Resume',
  restart: 'Restart',
  chapters: 'Chapters',
  credits: 'Credits',
  back: 'Back',
};

// ---------------------------------------------------------------------
//  TEXTOS DAS CENAS. Cada linha em `say`/`lines` aparece como legenda
//  flutuante e é lida pela narração (se ligada).
// ---------------------------------------------------------------------

// 0 · A Esfinge (abertura: ensina a olhar e a escolher)
export const SPHINX = {
  open: 'At the gate of every life, the Sphinx is waiting.',
  look: {
    desktop: 'Look around — drag with the mouse',
    phone: 'Look around — move your phone, or drag',
    xr: 'Look around — turn your head',
  },
  find: 'Find the light.',
  choose: {
    desktop: 'Click it — or keep it in the middle of your view',
    phone: 'Tap it — or keep it in the middle of your view',
    xr: 'Point and pull the trigger — or hold your gaze on it',
  },
  walk: {
    desktop: 'Walk closer — WASD, or click the ground',
    phone: 'Walk closer — tap the ground',
    xr: 'Walk closer — or push the stick forward and let go',
  },
  grab: {
    desktop: 'Pick up the crown the last traveller left — click it, then click again to throw',
    phone: 'Pick up the crown the last traveller left — tap it, then tap again to throw',
    xr: 'Pick up the crown the last traveller left — reach down and grip, or point and pull the trigger',
  },
  ask: 'Every soul must answer her before it is born.',
  answerHint: 'Answer her',
  wrong: 'No. Look again.',
  options: ['a god', 'a beast', 'a human being'],
  right: 2, // index of the true answer in `options`
  close: 'Now you may be born.',
};

// 2 · Berço
export const CRIB = {
  intro: ['You remember everything.', 'You know exactly what to say.'],
  hint: { desktop: 'Try to speak — click', phone: 'Try to speak — tap', xr: 'Try to speak — pull the trigger' },
  // O que o bebê TENTA dizer a cada clique (aparece e se desfaz em choro).
  attempts: [
    'I remember how I died —',
    'Listen. I was falling —',
    'I held a hand. It let go —',
    'Please, I have to tell you —',
    'I have lived before —',
  ],
  afterCries: 'But all that comes out is a cry.',
  light: 'The light from the window finds your face.',
  lightHint: { desktop: 'Look at the light — drag toward it, or click it', phone: 'Look at the light — or tap it', xr: 'Look at the light' },
  // Volta do Ícaro → gatilho da audição
  back: 'Another life. Another ending.',
  sound: 'Something, behind the wall…',
  soundHint: { desktop: 'Look toward the sound — drag, or click the door', phone: 'Look toward the sound — or tap the door', xr: 'Look toward the sound' },
};

// 3 · Ícaro
export const ICARUS = {
  open: 'You are flying.',
  hand: 'Someone you love is holding your hand.',
  higher: 'Higher. Closer to the sun.',
  holdHint: 'Hold on — click, tap or pull the trigger',
  slip: 'The hand slips.',
  fragment: '’Tis better to have loved and lost',
  hintSun: 'Look at the sun. It is looking at him',
  hintFeather: { desktop: 'A feather. Click to catch it', phone: 'A feather. Tap to catch it', xr: 'A feather. Reach out and catch it' },
  hintBecome: { desktop: 'Look at him. Click him', phone: 'Look at him. Tap him', xr: 'Look at him' },
  hintFlap: { desktop: 'Click to beat your wings', phone: 'Tap to beat your wings', xr: 'Beat your arms' },
};

// Perséfone: o jardim. `fruit` pode ser 'pomegranate' ou 'apple'.
export const ORPHEUS = {
  hintWalk: { desktop: 'Walk behind them: WASD, or click the ground', phone: 'Walk behind them: tap the ground', xr: 'Walk behind them' },
  hintLyre: { desktop: 'Click the strings', phone: 'Tap the strings', xr: 'Touch the strings' },
  hintEyes: 'He can feel you watching',
  hintReach: { desktop: 'Click to reach for him', phone: 'Tap to reach for him', xr: 'Reach for him' },
};

export const PERSEPHONE = {
  fruit: 'pomegranate',
  enter: 'A garden with no winter in it. You have been here before.',
  hintTree: { desktop: 'Click a tree to shake it', phone: 'Tap a tree to shake it', xr: 'Touch a tree — it answers' },
  hintFruit: {
    desktop: 'Click a fruit to pick it. Click again to throw it',
    phone: 'Tap a fruit to pick it. Tap again to throw it',
    xr: 'Reach up and grip a fruit. Let go to throw it',
  },
  taken: 'The flowers are still open. No one is there.',
  taste: {
    desktop: 'Pick a fruit, and taste it',
    phone: 'Pick a fruit, and taste it',
    xr: 'Pick a fruit, and bring it to your mouth',
  },
  tasteButton: 'Taste it (E)',
  you: 'One seed. And now you are her.',
};

// O Hades: o livro pop-up.
export const HADES = {
  open: 'The dead keep their stories in a book. It opens for you.',
  turn: { desktop: 'Click the gold ribbon to turn the page', phone: 'Tap the gold ribbon to turn the page', xr: 'Take the gold ribbon and pull the page across — or point and pull the trigger' },
  tab: { desktop: 'Pull the paper tab — click it', phone: 'Pull the paper tab — tap it', xr: 'Take the paper tab and pull it toward you' },
  crossing: 'The ferryman has never once looked back.',
  shades: 'They step away from you. You are still warm.',
  queen: 'This is where she sits, half of every year.',
  close: 'And you forget this, too.',
};

// 4 · Beethoven
export const BEETHOVEN = {
  open: 'Silence. You have not heard a sound in years.',
  hint: { desktop: 'Play — click, or press Space', phone: 'Play — tap', xr: 'Play — pull the trigger' },
  feel: 'You feel the music in the wood, in your bones.',
  hear: 'And then — you hear it.',
  hand: 'A hand holds yours.',
  fragment: 'I feel it when I sorrow most',
};

// 5 · Esquecimento
export const FORGETTING = {
  lines: ['The memories come back weaker.', 'The room grows clear.', 'You are starting to forget.'],
  memoryHint: 'Reach for a memory',
  // Rótulos das memórias que flutuam e se apagam.
  memories: ['the sun', 'the sea', 'a hand', 'the music', 'a name'],
};

// 6 · A escolha
export const CHOICE = {
  lines: ['Your mother reaches for your hand.', 'You know what it means to hold a hand.', 'Every hand you held, you watched let go.'],
  hold: 'hold her hand',
  letGo: 'let go',
};

// 7A · Segurar
export const END_HOLD = {
  lines: ['You hold on.', 'Years pass in her hand.', 'And then, as always, you watch her go.', 'And you remember everything.'],
  fragment: 'I hold it true, whate’er befall',
};

// 7B · Soltar
export const END_LETGO = {
  lines: ['You let go.', 'Nothing can be taken from you now.', 'The years pass quietly.', 'You close your eyes.'],
  fragment: 'Than never to have loved at all.',
};

// 8 · Todas as vidas
export const FINALE = {
  flash: ['the sun', 'the sea', 'the silence', 'the music', 'her hand'],
  cycle: 'And you are born again — remembering.',
  again: 'begin again',
  credits: 'credits',
};

// Mitologia grega: um eco de Homero (ou Ovídio) em cada cena.
// Traduções em domínio público: Samuel Butler (Ilíada 1898, Odisseia 1900) e
// H. T. Riley (Metamorfoses, 1851). `text` aparece em 3D; `source` vai junto, menor.
// `motif` descreve o que a cena mostra visualmente (para quem for editar).
export const MYTHS = {
  // J. G. Frazer's translation of Apollodorus (Loeb, 1921), public domain.
  sphinx: {
    riddle: 'What is that which has one voice and yet becomes four-footed and two-footed and three-footed?',
    answer: 'As a babe he is four-footed, going on four limbs, as an adult he is two-footed, and as an old man he gets besides a third support in a staff.',
    fall: 'So the Sphinx threw herself from the citadel.',
    source: 'Library III · Apollodorus',
    motif: 'Moreau’s gorge at dusk: the Sphinx clings to Oedipus on the ledge. She asks you the riddle of the three ages of a life; the answer is the life you are about to live.',
  },
  // Hugh G. Evelyn-White's translation of the Homeric Hymn to Demeter (1914), public domain.
  persephone: {
    flowers: 'She was playing with the deep-bosomed daughters of Oceanus and gathering flowers over a soft meadow.',
    opens: 'The wide-pathed earth yawned there in the plain of Nysa.',
    seed: 'He secretly gave her sweet pomegranate seed to eat.',
    spring: 'When the earth shall bloom with the fragrant flowers of spring in every kind, then from the realm of darkness and gloom thou shalt come up once more.',
    source: 'Homeric Hymn to Demeter',
    motif: 'A garden to walk in: trees that answer your hand, pomegranates to pick and throw. Crane’s chariot rises from the ground and takes her. You taste a seed, and you are her. The underworld is a giant pop-up book made from Doré’s engraving; its last page lets you come up.',
  },
  prologue: {
    text: 'O Muses, tell me — for you are goddesses and are in all places so that you see all things, while we know nothing but by report.',
    source: 'Iliad II · Homer',
    motif: 'The nine Muses, daughters of Mnemosyne (Memory), carved in a marble frieze lit by one lamp.',
  },
  crib: {
    text: 'The boy cried and nestled in his nurse’s bosom, scared at the sight of his father’s armour, and at the horse-hair plume that nodded fiercely from his helmet. His father and mother laughed to see him.',
    source: 'Iliad VI · Hector and Astyanax',
    motif: 'The father holds a bronze helmet with a horse-hair crest; when the baby cries, he lays it down.',
  },
  icarus: {
    warning: 'Icarus, I recommend thee to keep the middle tract; if thou shouldst go too low, the water should clog thy wings; if too high, the fire of the sun should scorch them.',
    onlookers: 'A person while he is angling for fish, or the shepherd leaning on his crook, when he beholds them, is astonished, and believes them to be Divinities.',
    lament: 'Icarus, where art thou? In what spot shall I seek thee?',
    source: 'Metamorphoses VIII · Ovid',
    motif: 'You fly as Daedalus, holding your son’s hand. Fishermen and a shepherd look up. You watch him fall.',
  },
  beethoven: {
    text: 'The muse had given him both good and evil, for though she had endowed him with a divine gift of song, she had robbed him of his eyesight.',
    sirens: 'No one ever sailed past us without staying to hear the enchanting sweetness of our song.',
    source: 'Odyssey VIII and XII · Demodocus, the Sirens',
    motif:
      'Sound is the Sirens. In the crib, the muffled music behind the door is their song calling. ' +
      'In Beethoven’s room, in the silence, the Sirens rise in glowing mist and sing without a sound he can hear; ' +
      'he feels it through the piano, as Odysseus heard them bound to the mast. When the Ninth breaks through, their voices join it.',
  },
  sirens: {
    song: 'Come here, renowned Ulysses, honour to the Achaean name, and listen to our two voices. No one ever sailed past us without staying to hear the enchanting sweetness of our song.',
    source: 'Odyssey XII · Homer',
    // Hyginus tells that the Sirens were fated to die once a ship sailed past them unharmed (own words, after Fabulae 125).
    fate: 'It was foretold that the Sirens would live only until a mortal heard their song and sailed on. When Ulysses passed, they threw themselves into the sea.',
    fateSource: 'after Hyginus, Fabulae',
    motif: 'You watch the ship pass the Sirens’ rocks, Ulysses bound to the mast. Then you are a Siren: your song fails, and you fall into the sea and turn to stone.',
  },
  orpheus: {
    condition: 'The hero receives her, and, at the same time, this condition, that he turn not back his eyes until he has passed the Avernian valleys, or else that the grant will be revoked.',
    path: 'The ascending path is mounted in deep silence, steep, dark, and enveloped in deepening gloom.',
    turn: 'He, enamoured, fearing lest she should flag, and impatient to behold her, turned his eyes; and immediately she sank back again.',
    farewell: 'And now, dying a second time, she did not at all complain of her husband; for why should she complain of being beloved? And now she pronounced the last farewell.',
    source: 'Metamorphoses X · Ovid',
    motif: 'You watch Orpheus lead Eurydice up through Corot’s misty grove of the dead. He looks back; you are Eurydice, drawn back into the dark. In the light where he stands, the Muses appear, and Orpheus is Beethoven.',
  },
  medusa: {
    statues: 'He saw everywhere, along the fields and the roads, statues of men and wild beasts turned into stone from their natural form, at the sight of Medusa.',
    shield: 'From the reflection on the brass of the shield which his left hand bore, he beheld the visage of the horrible Medusa.',
    source: 'Metamorphoses IV · Ovid',
    // Not Ovid: our own reading, in which she meets her own gaze (the myth has Perseus behead her).
    self: 'In the polished bronze she saw a face she had never seen. It was her own. And she, too, became stone.',
    selfSource: 'a retelling',
    motif: 'A grotto of statues — figures from your earlier lives, turned to marble. A polished shield comes out of the dark; in it, Caravaggio’s Medusa. It is you. You turn to stone.',
  },
  forgetting: {
    text: 'Those who ate of the lotus left off caring about home.',
    nepenthe: 'Helen drugged the wine with an herb that banishes all care, sorrow, and ill humour.',
    source: 'Odyssey IX · The Lotus-eaters',
    motif: 'Memories become lotus blossoms drifting on a dark river (Lethe) across the floor.',
  },
  choice: {
    text: 'My mother Thetis tells me that there are two ways in which I may meet my end.',
    source: 'Iliad IX · Achilles',
    motif: 'Two lights between two columns: a short life that keeps everything, a long one that lets go.',
  },
  endHold: {
    text: 'Thrice I sprang towards her and tried to clasp her in my arms, but each time she flitted from my embrace as it were a dream or phantom.',
    longing: 'My longing to know what you were doing, and the force of my affection for you — this it was that was the death of me.',
    source: 'Odyssey XI · Odysseus and his mother',
    motif: 'At her death she becomes a shade of light; you reach for her three times.',
  },
  endLetGo: {
    text: 'As soon as he saw Ulysses standing there, he dropped his ears and wagged his tail, but he could not get close up to his master.',
    death: 'Argos died as soon as he had recognised his master.',
    source: 'Odyssey XVII · Argos',
    motif: 'An old dog lies by your chair at the window, the only one who still knows you.',
  },
  afterlife: {
    charon: 'Charon, the dread ferryman, guards these flowing streams, ragged and awful, his chin covered with untrimmed masses of hoary hair, and his glassy eyes aflame.',
    cerberus: 'This realm rings with the triple-throated baying of vast Cerberus, couched huge in the cavern opposite.',
    asphodel: 'They reached the meadow of asphodel where dwell the souls and shadows of them that can labour no more.',
    elysium: 'They came to the happy place, the green pleasances and blissful seats of the Fortunate Woodlands. Here an ampler air clothes the meadows in lustrous sheen, and they know their own sun and a starlight of their own.',
    orpheus: 'With them is the Thracian priest in sweeping robe, and makes music to their measures.',
    lethe: 'Souls, for whom second bodies are destined and due, drink at the wave of the Lethean stream the heedless water of long forgetfulness.',
    er: 'They rested at evening by the river Unmindful, whose water could not be retained in any vessel; and he who drank forgot all things.',
    birth: 'And suddenly they were all driven divers ways, shooting like stars to their birth.',
    sources: {
      charon: 'Aeneid VI · Virgil',
      asphodel: 'Odyssey XXIV · Homer',
      er: 'Republic X · Plato, the Myth of Er',
    },
    motif: 'You cross the Styx in Charon’s boat inside Patinir’s river world; Böcklin’s Isle of the Dead in the mist; Blake’s Cerberus on the far bank; pale asphodel; Schwabe’s Elysian Fields; then you cup the water of Lethe, drink, forget, and are born again.',
  },
  finale: {
    text: 'Men come and go as leaves year by year upon the trees. Those of autumn the wind sheds upon the ground, but when spring returns the forest buds forth with fresh vines.',
    source: 'Iliad VI · Glaucus',
    motif: 'Olive and laurel leaves fall through every life of the montage.',
  },
};

// Capítulos (menu). `scene` + `params` = onde começar.
export const CHAPTERS = [
  { label: 'The Sphinx', scene: 'sphinx' },
  { label: 'The Garden', scene: 'prologue' },
  { label: 'The Crib', scene: 'crib' },
  { label: 'Icarus', scene: 'icarus' },
  { label: 'The Sirens', scene: 'sirens' },
  { label: 'Orpheus and Eurydice', scene: 'orpheus' },
  { label: 'Beethoven', scene: 'beethoven' },
  { label: 'Medusa', scene: 'medusa' },
  { label: 'Persephone’s Garden', scene: 'persephone' },
  { label: 'Hades', scene: 'hades' },
  { label: 'The Choice', scene: 'choice' },
  { label: 'Holding On', scene: 'endHold' },
  { label: 'Letting Go', scene: 'endLetGo' },
  { label: 'The Afterlife', scene: 'afterlife', params: { ending: 'hold' } },
  { label: 'Every Life at Once', scene: 'finale', params: { ending: 'hold' } },
];

// Créditos (menu e cena final). Troque os nomes!
export const CREDITS = [
  { role: 'A piece by', names: ['Your Name Here'] },
  { role: 'Made for', names: ['USC Immersive Media Hackathon', 'November 6–8, 2026'] },
  { role: 'Poem', names: ['Alfred, Lord Tennyson', 'In Memoriam A.H.H., canto XXVII (1850)'] },
  {
    role: 'Myths',
    names: ['Homer, The Iliad and The Odyssey — trans. Samuel Butler', 'Ovid, Metamorphoses — trans. H. T. Riley', 'Virgil, Aeneid — trans. Theodore C. Williams', 'Plato, Republic — trans. Benjamin Jowett', 'Apollodorus, Library — trans. J. G. Frazer', 'Homeric Hymn to Demeter — trans. Hugh G. Evelyn-White'],
  },
  { role: 'Music', names: ['Ludwig van Beethoven'] },
  {
    role: 'Recordings',
    names: [
      'Moonlight Sonata — Paul Pitman for Musopen (public domain)',
      'Symphony No. 7 — Philadelphia Orchestra, Leopold Stokowski, 1927 (public domain)',
      'Symphony No. 9 — MIDI rendering, Wikimedia Commons (public domain)',
      'Für Elise — “Qoo”, Wikimedia Commons, CC BY-SA 2.5',
      'Baby cries — the_yura (CC0) and natalie (public domain)',
    ],
  },
  {
    // In order of appearance. Full sources and licences: public/art/README.md
    role: 'Paintings & engravings',
    names: [
      'Gustave Moreau — Oedipus and the Sphinx, 1864',
      'Sandro Botticelli — Primavera, c. 1480',
      'Sandro Botticelli — The Birth of Venus, c. 1485',
      'J. H. W. Tischbein — Hector’s Farewell to Andromache, 1812',
      'Francesco Hayez — Hector Greets Andromache and Astyanax',
      'Benjamin West — The Fright of Astyanax, 1766',
      'Carl Friedrich Deckler — The Farewell of Hector',
      'Kleophrades Painter — Panathenaic prize amphora, c. 500 BC',
      'Jacob Peter Gowy after Rubens — The Fall of Icarus, c. 1636',
      'The Fall of Icarus, engraving, 1730',
      'Herbert James Draper — Ulysses and the Sirens, c. 1909',
      'John William Waterhouse — Ulysses and the Sirens, 1891',
      'Camille Corot — Orpheus Leading Eurydice from the Underworld, 1861',
      'Frederic Leighton — Orpheus and Eurydice, 1864',
      'Rudolf Hausleithner — Beethoven’s Vision, 1882',
      'Caravaggio — Medusa, c. 1597',
      'Edward Burne-Jones — The Baleful Head, 1885',
      'Peter Paul Rubens — Orpheus and Eurydice, 1636–38',
      'Walter Crane — The Fate of Persephone, 1877',
      'Peter Paul Rubens — The Rape of Proserpina, 1636–38',
      'Gustave Doré — Charon, Dante’s Inferno, 1861',
      'Dante Gabriel Rossetti — Proserpine, 1874',
      'Frederic Leighton — The Return of Persephone, 1891',
      'Joachim Patinir — Crossing the River Styx, c. 1520',
      'Arnold Böcklin — Isle of the Dead, 1883',
      'William Blake — Cerberus (Dante’s Inferno), 1824–27',
      'Carlos Schwabe — The Elysian Fields, 1903',
      'Jacques-Louis David — study for Andromache Mourning Hector',
      'Theodoor van Thulden after Primaticcio — Ulysses Known by Argos, 1633',
      'Edwin Landseer — The Old Shepherd’s Chief Mourner, 1837',
    ],
  },
  {
    role: 'Images',
    names: [
      'Public domain and CC0, via Wikimedia Commons, The Metropolitan Museum of Art, the Rijksmuseum and the Museo del Prado',
      'Cut out, coloured and collaged for this piece',
    ],
  },
  { role: 'Built with', names: ['three.js · WebXR · Web Audio · Web Speech'] },
  { role: 'Typeface', names: ['Cormorant Garamond (SIL Open Font License)'] },
  { role: 'Thank you', names: ['for remembering with us.'] },
];

// Ajustes gerais.
export const SETTINGS = {
  gazeDwell: 1.6,      // segundos olhando fixo para selecionar
  narration: true,     // narração ligada por padrão
  voiceLang: 'en-GB',  // idioma preferido da voz sintética
  voiceRate: 0.82,
  voicePitch: 0.9,
};

// Trilha (arquivos em /public/audio → servidos em /audio).
// Se o arquivo não existir, o app gera um "pad" sintético no lugar
// (acordes em `placeholder`, em Hz) para nunca ficar mudo.
export const AUDIO = {
  moonlight: {
    file: 'beethoven-moonlight-sonata-1st-mvt.mp3',
    title: 'Piano Sonata No. 14 in C♯ minor “Moonlight”, Op. 27 No. 2 — I. Adagio sostenuto',
    use: 'Prologue, crib',
    placeholder: [138.59, 164.81, 207.65, 277.18],
  },
  icarus: {
    file: 'beethoven-symphony-7-2nd-mvt.mp3',
    title: 'Symphony No. 7 in A major, Op. 92 — II. Allegretto',
    use: 'Icarus memory',
    placeholder: [110.0, 130.81, 164.81, 220.0],
  },
  ninth: {
    file: 'beethoven-symphony-9-4th-mvt.mp3',
    title: 'Symphony No. 9 in D minor, Op. 125 — IV. (choral finale)',
    use: 'Beethoven memory',
    placeholder: [146.83, 174.61, 220.0, 293.66],
  },
  elise: {
    file: 'beethoven-fur-elise.mp3',
    title: 'Bagatelle No. 25 in A minor “Für Elise”, WoO 59',
    use: 'Forgetting (played distorted)',
    placeholder: [220.0, 261.63, 329.63, 233.08],
  },
};
