# Auditoria dos recortes

Estado em 3/11/2026, antes de qualquer correção. São 43 imagens com transparência em `public/art`
(as outras 11 são opacas: fundos e quadros). Prancha: `auditoria-recortes.jpg`, com cada recorte sobre
magenta e branco para expor halo e sobras. Zoom do Orfeu: `auditoria-orfeu-zoom.jpg`.

**Medido por script:** largura da borda suave (padrão pedido: 1 a 2 px; 0 = serrilhado), sobra semitransparente,
fragmentos soltos, diferença de brilho na borda (halo) e resolução. Cortes retos e fragmentos foram vistos
na prancha. Só o grupo do Orfeu foi visto em zoom; os demais serão conferidos em zoom na correção.

## Causas que valem para todos (em `cutout()`, `src/core/collage.js`)

| Causa | Efeito |
|---|---|
| `MeshBasicMaterial`: o recorte não recebe a luz da cena | Principal motivo de parecer colado |
| Alpha não premultiplicado, com a cor do fundo original sob os pixels transparentes (brilho 60 a 165 em 0–255) | Halo claro ou escuro quando a textura reduz com a distância |
| `depthWrite: true` com `alphaTest: 0.05` | Pixels quase transparentes escrevem profundidade e criam contorno sobre o que está atrás |
| `anisotropy: 4` | Pouca nitidez em ângulo |
| Sombra de contato só em 5 arquivos: Esfinge, Jardim, Orfeu, quarto e Soltar | Medusa, Além e parte das outras figuras ficam sem chão |

**Correção comum:** novo pipeline de exportação (borda suave de 1 a 2 px, cor estendida para fora da máscara) e novo
material (premultiplicado, sem escrita de profundidade na borda, cor ajustada à luz de cada cena, relevo leve).

## Por recorte

Ação: **G** = só a correção comum · **R** = recortar de novo da fonte · **T** = a fonte não basta, trocar · **V** = hoje é vinheta oval, decidir.

| Recorte | Tamanho | Borda (px) | Problema | Ação |
|---|---|---:|---|---|
| orpheus/orpheus | 623×1019 | 0,0 | Serrilhado; figura minúscula no Corot, ampliada mostra a trama da tela; rosto sem definição | **T** |
| orpheus/eurydice | 267×638 | 0,0 | Serrilhado, baixa resolução, fragmento solto à direita, mesma limitação | **T** |
| orpheus/leighton | 1300×1500 | 0,9 | Halo escuro, base e lado esquerdo retos (bloco); fonte ótima (3421×4000) | **R** |
| orpheus/beethoven | 872×923 | 0,0 | Serrilhado | **R** |
| orpheus/muses | 1158×1300 | vinheta | Oval com nuvem e fundo; 96% de sobra | **V** |
| sirens/ulysses | 460×258 | 0,0 | Serrilhado, pixelado, base reta | **R**, usar só de longe |
| sirens/siren-rope | 260×597 | 0,0 | Serrilhado, muito baixa resolução, estourada, base cortada | **T** |
| sirens/sirens-climbing | 1118×1102 | 0,0 | Serrilhado, sobras na base | **R** |
| sirens/harpy-a, -b, -left, -mast, -right | 615–1000 px | vinheta | Medalhões ovais com o mar do quadro | **V** |
| crib/helmet | 208×229 | 0,0 | Serrilhado e minúsculo, visto de perto; fonte de só 1027×1266 | **T** (modelo 3D) |
| crib/andromache-face | 450×603 | vinheta | Oval com fundo, baixa resolução, a cerca de 0,6 m do rosto | **R** ou **T**, conferir a fonte |
| crib/amphora | 897×1500 | 1,2 | Halo claro do fundo branco da foto | **R** |
| crib/hector | 534×1500 | 1,1 | Bom recorte | **G** |
| garden/mercury | 572×1259 | 0,0 | Serrilhado; pernas cortadas na canela | **R** |
| garden/flora | 531×1400 | 1,0 | Halo escuro; lado direito reto onde a figura vizinha cruzava | **R** |
| garden/cupid | 579×262 | 0,0 | Serrilhado, fragmentos soltos | **R** |
| garden/hora | 777×1100 | vinheta | Oval com fundo da pintura | **R** |
| garden/graces, venus, venus-primavera | 513–934 px | 1,1–1,2 | Bons; pequenos fragmentos | **G** |
| garden/zephyr-aura, zephyr-chloris | 881–1264 px | 1,1–1,2 | Bons; fragmentos são flores soltas (zephyr-aura) | **G**, conferir |
| icarus/daedalus | 1083×844 | 0,0 | Serrilhado, corpo com base reta | **R** |
| icarus/icarus | 1400×1367 | 1,1 | Bom; fragmentos são penas | **G** |
| icarus/rock | 795×733 | 0,0 | Serrilhado, visto de longe | **R** |
| icarus/boat | 1113×760 | vinheta | Oval de gravura sobre o mar | **V** |
| medusa/shield | 1200×1200 | 2,9 | O melhor do projeto | **G** |
| medusa/stone-graces, -icarus, -mercury, -orpheus, -siren | 260–900 px | 0–1,4 | Derivados; herdam os defeitos das fontes | Regerar depois das fontes |
| endings/argos | 465×589 | vinheta | Traçado à mão, halo claro, baixa resolução; fonte de só 1380×1047 | **T** ou versão maior |
| endings/argus | 1057×1200 | vinheta | Gravura; ok se ficar emoldurada na parede | **V** |
| afterlife/elysium-lyre | 511×950 | vinheta | Oval com o campo atrás | **R** |
| afterlife/cerberus | 1200×1125 | vinheta | Aquarela de Blake sem contorno limpo | **V** |
| afterlife/isle | 1600×871 | vinheta | Fundo distante na névoa; funciona | **G** |
| sphinx/sphinx | 866×1600 | 15 | 17% de sobra perto dos pés; fonte permite mais resolução (2072×4000) | **R** |
| sphinx/figtree | 305×510 | 3,6 | Escura, fragmentada, baixa resolução | **T** (vegetação 3D) |

**Resumo:** 12 recortes com borda dura, sem nenhuma suavização · 5 de **T** (fonte insuficiente), mais o Argos se não houver versão maior · 9 só com a correção comum.

**Candidatos para os T** (a confirmar licença e resolução antes de baixar): Rubens, *Orfeu e Eurídice* (Prado), para substituir as
figuras do Corot, mantendo o bosque dele como cenário; versões maiores de Draper e Landseer; capacete e figueira em 3D.
