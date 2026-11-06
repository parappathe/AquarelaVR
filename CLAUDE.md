# AquarelaVR

Aquarela: jogo de território com tinta em VR para o Meta Quest 3 no navegador (WebXR), sem instalar
nada. Num ateliê claro de sótão, de manhã (claraboia, janelão com jardim, cavaletes, varal de
desenhos), você e o adversário pingam gotas de aquarela numa folha de papel molhado presa com fita na
mesa. A tinta escorre e se espalha pelo papel; onde as cores se encontram, a mais forte avança e as
parecidas viram lama cinza. No fim o papel seca e ganha quem pintou mais. Partida contra 3 adversários
com personalidade e 10 desafios com 3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/AquarelaVR/`
e apertar "Entrar em VR". (Publicação é com o Eduardo: `python publicar.py AquarelaVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8867` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar o conta-gotas | Botão lateral (aperto) com a mão a até 10 cm do conta-gotas vermelho (no pote à direita, na sua frente). Soltar o aperto devolve | Não precisa |
| Encher a gota | Segurar o gatilho: a gota cresce na ponta, o tom sobe e o controle vibra mais (de 1 a 6, cheia em 1,4 s) | Segurar o clique em cima do papel (barra na caixa de baixo) |
| Pingar | Soltar o gatilho: pinga na célula embaixo da ponta | Soltar o clique; ou teclas 1 a 6 para uma gota exata onde está o mouse |
| De longe | Sem pegar nada: apontar o raio para o papel, segurar e soltar o gatilho | |
| Prévia | Contorno pulsando com o que a gota vai pintar e placa "logo depois / no fim, secando" | O mesmo, mais a caixa embaixo da tela |
| Só com as mãos | Pinça apontando para o papel enche (segurando) e pinga (soltando) | |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Câmera | (sua cabeça) | Botão direito arrastando ou A/D/W/S |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé de frente para a mesa (papel a 88 cm do chão, 60 x 60 cm); o adversário fica em
pé do outro lado, leva o conta-gotas azul dele até o papel, pensa, comemora ou fica triste.

### Regras

- Papel de 20 x 20 células. Cada um tem 12 de tinta por rodada. Na sua vez, uma gota de 1 a 6
  (de meia em meia unidade) onde quiser, menos na cera. Acabou a tinta dos dois, a rodada acaba; se um
  acaba antes, o outro continua sozinho.
- A gota cai 40% na célula e 15% em cada vizinha e depois escorre 8 passos. Em cada passo, toda
  célula com mais de 0,1 de tinta manda metade do excesso, em partes iguais, para as vizinhas sem cera.
- Onde chegam duas cores na mesma célula: a que tiver pelo menos o dobro fica com a célula (com a
  diferença de tinta); se forem parecidas, vira lama cinza, que não é de ninguém e não muda mais.
  Gota forte em cima de tinta fraca do outro come a célula.
- Fim da rodada: o papel seca (mais 16 passos) e cada célula da sua cor vale 1 ponto.
- Papéis: Folha lisa, Fita no meio, Quatro ilhas, Moldura, Diagonal (a cera é bege no papel).
- Partida: 2 rodadas em 2 papéis sorteados, cada um começa uma; soma das áreas.
- Adversários (em `js/ai.js`, todos simulam a tinta de verdade): **Dona Cida** (cuidadosa: gotas
  médias no papel vazio, foge da briga), **Tito** (arriscado: gotas grandes em cima da sua tinta),
  **Mestre Aurélio** (pensa à frente: para as 4 melhores gotas dele, olha a sua melhor resposta).
- Desafios (em `js/challenges.js`, só você pinga, a azul já está no papel): 1 Primeira gota, 2 A flor,
  3 Empurrão, 4 Muro de cera, 5 Engolir, 6 Sem lama, 7 Dois rios, 8 Gota única, 9 Cerco, 10
  Obra-prima. Medidas: área sua, saldo (sua menos azul), células suas dentro do círculo tracejado,
  área menos 2 por lama, ou azul o menor possível. Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `aquarelavr.v1`): vitórias e partidas por
  adversário, estrelas por desafio, som, prévia e FPS.

## Como testar

- `npm test` (ou `node tests/run.js`): tinta (conserva a quantidade escorrendo, 8 passos, secagem,
  gota forte pinta mais, determinística, simétrica, cera não deixa passar, encontro igual vira lama,
  o dobro come, lama não muda, prévia não mexe no jogo), partida (acaba com a tinta, gota de 1 a 6,
  um continua sozinho, 2 rodadas alternando), IA (válida, menos de 100 ms por jogada, gerador em
  pedaços, Tito pinga gotas maiores que a Dona Cida), IA contra IA em 18 partidas até o fim (Aurélio
  ganha a maioria dos dois, Cida do Tito; mostra os placares), robô tira 3 estrelas nos 10 desafios
  gastando a tinta (mostra as gotas) e pingar tudo no canto não dá 3, e fumaça do `main.js` (carrega
  o jogo no Node com navegador e WebGL de mentira; mouse com prévia, segurar enche e soltar pinga,
  tecla 2, conta-gotas pego com um controle de VR de mentira, robô termina uma partida com a
  secagem, carrega os 10 desafios pelo mesmo caminho do menu conferindo tinta e manchas na tela,
  3 estrelas em todos dentro do jogo, `dev.win()`, salva, pausa). Tem que terminar com "Tudo certo";
  sai com código 1 se algo falhar (ou passar de 240 s). Não toca som. Leva uns 15 s.
- O teste de fumaça (`tests/smoke.js` + `tests/three-stub.js`) usa `module.registerHooks` do Node
  (Node 22.15 ou mais novo) para trocar só o `WebGLRenderer` do Three.js.
- No navegador (console): `dev.autoplay = true` (robô joga por você), `dev.advance(5)`, `dev.state()`
  (tela, fase, tinta, área no estado e na tela, gota enchendo, prévia), `dev.loadLevel(3)`,
  `dev.startMatch(2)`, `dev.win()` (ganha a partida ou resolve o desafio na hora), `dev.cellScreen(i)`,
  `dev.resetSave()`. `window.aquarela` tem `match`, `challenge`, `save`, `camera`, `scene`,
  `renderer`, `world`, `shell`.
- **Só dá para testar no óculos:** pegar o conta-gotas (10 cm), encher segurando o gatilho, pingar
  embaixo da ponta, raio de longe, pinça das mãos, vibração, placas e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, caixa da prévia (com barra da força) e dica do PC |
| `js/rules.js` | Papel (`PAPERS`, cera), gota (`dropInk`), escorrer (`spreadStep`), jogada (`applyMove`), secagem (`dry`), `areas`, `preview`, `Match`. Sem navegador |
| `js/ai.js` | Adversários (`OPPONENTS`), robô (`ROBOT`), avaliação, escolha em passos (`chooseMoveGen`), `playRound`. Sem navegador |
| `js/challenges.js` | Os 10 desafios e o robô que resolve (busca em feixe + ajuste fino: `bestChallengeGen`, `solveChallenge`). Sem navegador |
| `js/shell.js` | Casca: render, câmera, VR (controles, mãos, raios, vibração), mouse/teclado, painel, placas, FPS, laço |
| `js/main.js` | O jogo: turnos, encher e pingar (VR, raio, mouse, teclas), prévia, animação da gota e dos passos, secagem, conta-gotas do adversário, menus, HUD, `dev` |
| `js/scene.js` | Ateliê, mesa, papel com grão, camada de tinta e de prévia (canvas ampliado com suavização), círculo-alvo, conta-gotas e potes, tela do placar, adversário |
| `js/avatar.js`, `js/ui.js`, `js/audio.js`, `js/save.js` | Boneco, painel/placas, sons (pingo, gota enchendo, escorrer, lama, passarinhos, sininho), progresso |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8867, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: célula (x, y), x para a direita, y para longe de quem joga, índice `y * 20 + x`; no
Three.js fica em (TABLE.x + (x - 9,5)·3 cm, 0,884, TABLE.z - (y - 9,5)·3 cm), mesa em (0; -0,5).

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js: os testes rodam no Node.
- A animação mostra os mesmos passos de `applyMove`/`dry` (quadros guardados): o que a prévia diz é o
  que acontece.
- Mexeu em regras, IA ou desafios: rodar `npm test`. As metas dos desafios foram escolhidas com o
  robô (3 estrelas ≤ o que ele consegue) e com 60 jogadas aleatórias.
- A IA no navegador pensa em pedaços de até 6 ms por quadro (robô dos desafios: 12 ms).
- Testes nunca tocam som.

## Decisões

- Simulação por células com passos fixos (sem física de fluido) para a prévia e a IA serem exatas.
- "O dobro avança, parecido vira lama": deixa a briga de fronteira clara e a lama vira parede neutra.
- A IA avalia pelo papel já seco (16 passos) e dá valor à tinta que sobrou; com só a área de agora
  ela gastava tudo em gotas grandes e perdia para gotas médias.
- Mestre Aurélio usa gotas de 2, 3, 4 e 6 (com 2, 3,5, 5 e 6 ele perdia da Dona Cida).
- Robô dos desafios: busca em feixe numa grade de 2 em 2 células e ajuste fino de 1 célula.
- Sem luz com sombra (só céu e claraboia), para o Quest a 72 Hz.
- Porta do servidor local 8867.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar o conta-gotas, encher com o gatilho, pingar embaixo da ponta,
  raio de longe, mãos, vibração, placas e FPS (a textura da tinta é redesenhada a cada passo da
  animação, 160 x 160 px).
- Mestre Aurélio ganha da Dona Cida por pouco (placares próximos); contra gente pode estar fácil ou
  difícil, só jogando para saber.
- No desafio 1 dá para passar um pouco do robô (as metas ficaram abaixo do que ele faz).
