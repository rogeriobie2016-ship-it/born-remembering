import { TitleScene } from './TitleScene.js';
import { SphinxScene } from './SphinxScene.js';
import { PrologueScene } from './PrologueScene.js';
import { CribScene } from './CribScene.js';
import { IcarusScene } from './IcarusScene.js';
import { SirensScene } from './SirensScene.js';
import { OrpheusScene } from './OrpheusScene.js';
import { MedusaScene } from './MedusaScene.js';
import { AfterlifeScene } from './AfterlifeScene.js';
import { BeethovenScene } from './BeethovenScene.js';
import { ForgettingScene } from './ForgettingScene.js';
import { ChoiceScene } from './ChoiceScene.js';
import { EndHoldScene } from './EndHoldScene.js';
import { EndLetGoScene } from './EndLetGoScene.js';
import { FinaleScene } from './FinaleScene.js';
import { CreditsScene } from './CreditsScene.js';

// Flow:
// title → sphinx → prologue → crib{birth} → icarus → crib{hearing} → sirens → orpheus → beethoven → medusa → choice
//   → endHold | endLetGo → afterlife{ending} (Styx, Elysium, Lethe) → finale{ending} → (begin again → prologue) | credits
export const SCENES = {
  title: TitleScene,
  sphinx: SphinxScene,
  prologue: PrologueScene,
  crib: CribScene,
  icarus: IcarusScene,
  sirens: SirensScene,
  orpheus: OrpheusScene,
  medusa: MedusaScene,
  afterlife: AfterlifeScene,
  beethoven: BeethovenScene,
  forgetting: ForgettingScene,
  choice: ChoiceScene,
  endHold: EndHoldScene,
  endLetGo: EndLetGoScene,
  finale: FinaleScene,
  credits: CreditsScene,
};

// Used by the N (skip) key when a scene sets no `skipTo`.
export const ORDER = ['title', 'sphinx', 'prologue', 'crib', 'icarus', 'sirens', 'orpheus', 'beethoven', 'medusa', 'choice', 'endHold', 'afterlife', 'finale', 'credits'];
