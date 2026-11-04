# Recortes: antes e depois

Lista pedida no item 9 do briefing. Cada arquivo em `recortes/` mostra o antes à esquerda e o depois à direita, metade sobre magenta e metade sobre branco, para expor halo e sobra. A auditoria original está em `auditoria-recortes.md`.

**O que vale para todos, em `cutout()` (`src/core/collage.js`):**

| Antes | Depois |
|---|---|
| Não recebia a luz da cena | Metade da luz vem da cena, metade é da própria tinta |
| Alpha sem premultiplicar | Mistura premultiplicada, e a exportação estende a cor para fora da máscara: sem halo ao reduzir |
| Escrevia profundidade na borda | Não escreve mais |
| Plano reto | Levemente curvado, como cartão: parallax real no headset, e a luz corre pela figura |
| Anisotropia 4 | 8, com mipmaps |

As texturas ficam com alpha normal na memória. Premultiplicar já no carregamento, em sRGB, escurecia as bordas. A mistura final é premultiplicada e a cor estendida evita o halo.

Sombra de contato: já existia na maior parte das cenas e foi adicionada ao Orfeu e à lira. Não revisei cena por cena se ainda falta alguma. No Sirens as figuras estão sobre rochas, e no Medusa, sobre pedestais.

## Como foi verificado

- Vi os recortes dos lotes sobre magenta e branco. Em todas as cenas, vi só um quadro na tela plana, sem erro no console.
- Não vi em headset real. A nitidez de perto está estimada pela resolução.

## Refeitos, limpos

| Recorte | Tamanho antes → depois | O que mudou | Comparar |
|---|---|---|---|
| orpheus/couple (novo) | novo, 1036×1600 | Rubens substitui o Corot; o pé de Plutão foi pintado por cima com o próprio tecido | [ver](recortes/orpheus-couple.jpg) |
| orpheus/leighton | 1300×1500 → 1357×1500 | Sem halo, sem a lira e o bloco; a base dissolve na névoa | [ver](recortes/orpheus-leighton.jpg) |
| orpheus/beethoven | 872×923 → 1228×1300 | Mesmo contorno, sem serrilhado | [ver](recortes/orpheus-beethoven.jpg) |
| icarus/daedalus | 1083×844 → 1400×1273 | Agora com as asas que Gowy pintou; contorno refeito à mão | [ver](recortes/icarus-daedalus.jpg) |
| icarus/rock | 795×733 → 789×840 | Cortado à tesoura, com tira de papel | [ver](recortes/icarus-rock.jpg) |
| icarus/boat | 1113×760 → 1016×572 | Era oval; agora é recorte de verdade | [ver](recortes/icarus-boat.jpg) |
| sirens/harpy-right | 864×697 → 754×731 | Era medalhão oval; agora é recorte. A ponta da asa sai da pintura e foi desenhada à mão | [ver](recortes/sirens-harpy-right.jpg) |
| sirens/harpy-left | 1000×687 → 1208×694 | Idem. Resta uma mancha azul-esverdeada na cauda, talvez da própria pintura | [ver](recortes/sirens-harpy-left.jpg) |
| sirens/harpy-a | 691×471 → 687×255 | Idem. Pequeno | [ver](recortes/sirens-harpy-a.jpg) |
| sirens/ulysses | 460×258 → 381×923 | **Outra figura:** o antigo parecia ser do Draper; este é o Ulisses de corpo inteiro, de Waterhouse | [ver](recortes/sirens-ulysses.jpg) |
| garden/mercury | 572×1259 → 485×1600 | Pernas e pés inteiros, sem franja escura | [ver](recortes/garden-mercury.jpg) |
| garden/flora | 531×1400 → 668×1600 | Sem lado reto e sem halo | [ver](recortes/garden-flora.jpg) |
| garden/cupid | 579×262 → 715×449 | Sem serrilhado, uma peça só. O alto das asas e a flecha foram desenhados à mão | [ver](recortes/garden-cupid.jpg) |
| garden/hora | 777×1100 → 1191×1600 | Era oval; agora é recorte com o manto inteiro | [ver](recortes/garden-hora.jpg) |
| crib/amphora | 897×1500 → 973×1600 | Sem halo branco, sem base de foto | [ver](recortes/crib-amphora.jpg) |
| sphinx/sphinx | 866×1600 → 825×1600 | Sem sobra perto dos pés | [ver](recortes/sphinx-sphinx.jpg) |
| medusa/stone-mercury, stone-siren, stone-orpheus | vários | Refeitos a partir dos recortes novos | [Mercúrio](recortes/medusa-stone-mercury.jpg) · [sereia](recortes/medusa-stone-siren.jpg) · [Orfeu](recortes/medusa-stone-orpheus.jpg) |

## Refeitos, com defeito que continua

| Recorte | Tamanho | Defeito | Causa | Comparar |
|---|---|---|---|---|
| orpheus/orpheus | 623×1019 → 557×1600 | Sozinho, sem Eurídice: a perna de trás fica escondida e o braço termina na mão que a segurava. Só aparece de longe, na névoa | Ela está na frente dele no quadro | [ver](recortes/orpheus-orpheus.jpg) |
| crib/andromache-face | 450×603 → 367×529 | Olha para outro lado e não é a mesma Andrômaca do Heitor (Tischbein). O busto termina em fade. Fica um pouco suave a 0,6 m | Fonte. O Tischbein tem o rosto com cerca de 150 px, fora de foco, então usei Hayez, bem mais nítido | [ver](recortes/crib-andromache-face.jpg) |
| endings/argos | 465×589 → 405×548 | Pequeno, mostra a trama da tela. O contorno do corpo escuro foi desenhado por mim | Fonte: preto sobre preto | [ver](recortes/endings-argos.jpg) |
| sirens/harpy-b | 768×547 → 838×486 | Cabelo em bloco, com cinza entre os fios no alto | Fonte: fios finos contra o céu | [ver](recortes/sirens-harpy-b.jpg) |
| sirens/harpy-mast | 615×546 → 217×437 | Só meia figura, com corte quase reto. **Saiu da cena**: o bando agora tem 4 | Fonte: o mastro a divide | [ver](recortes/sirens-harpy-mast.jpg) |
| sirens/siren-rope, sirens-climbing | 260×597 → 490×1057; 1118×1102 → 1139×1061 | Máscara limpa, mas a pintura está estourada e suave | Fonte | [corda](recortes/sirens-siren-rope.jpg) · [subindo](recortes/sirens-sirens-climbing.jpg) |
| afterlife/elysium-lyre | 511×950 → 769×1600 | O véu é translúcido: uma faixa do fundo aparece no ombro | Fonte | [ver](recortes/afterlife-elysium-lyre.jpg) |
| medusa/stone-graces | 600×900 → 934×1400 | Herdou fragmentos soltos de garden/graces | Só some refazendo garden/graces | [ver](recortes/medusa-stone-graces.jpg) |

## Não refeitos

| Recorte | Situação | Próximo passo |
|---|---|---|
| orpheus/muses, afterlife/cerberus, afterlife/isle, endings/argus | Vinhetas de propósito: visão na luz, medalhão, fundo na névoa, gravura emoldurada | Nenhum, a não ser que você prefira outra coisa |
| garden/graces, venus, venus-primavera, zephyr-*, crib/hector, icarus/icarus, medusa/shield, medusa/stone-icarus | Bons na auditoria. Levam só o material novo, sem refazer o recorte | graces tem fragmentos pequenos, que podem ser limpos |

## Trocados por modelo 3D

- **crib/helmet:** agora é um elmo coríntio de bronze modelado, com penacho de crina. O arquivo foi apagado.
- **sphinx/figtree:** agora é uma figueira de verdade, com tronco, galhos, folhas lobadas e figos. O arquivo foi apagado.

## Também trocado

- **garden/meadow:** o chão do Jardim tinha pés e pedaços de moldura misturados. Agora vem da faixa de flores abaixo dos pés, sem nada disso.
- **Novos do bosque:** orpheus/grove-crown, grove-tufts, grove-ground, shades-a, shades-b (Corot); icarus/clouds (feitas em código, com a trama da tela de Gowy).
