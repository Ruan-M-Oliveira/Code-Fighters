# Code Fighters

Jogo de nave arcade feito com HTML5 Canvas e JavaScript puro, todo em português. Escolha seu caça, sobreviva às ondas de inimigos, derrote o chefe e dispute um lugar no Top 3.

Não usa frameworks, bibliotecas nem build: é só abrir e jogar.

## Como jogar

| Ação | Controle |
|---|---|
| Mover | `W` `A` `S` `D` ou setas |
| Mirar | Mouse (a nave sempre aponta para o cursor) |
| Atirar | Clique esquerdo ou `Espaço` (segure para disparar sem parar) |
| Onda de choque | `Q`, `E` ou clique direito (depois de ganhar a melhoria) |
| Pausar | `Esc` ou `P` |

No celular, a nave segue o dedo e atira sozinha.

**Fluxo de uma partida:** INICIAR → digite seu codinome (3 a 10 caracteres) → escolha a nave → jogue.

- Destrua todos os inimigos para concluir cada onda.
- O chefe **Encouraçado Ômega** aparece na onda 5, com três fases.
- Sobreviva até a onda 10 para vencer, ou continue no modo infinito.
- Encadeie abates em poucos segundos para aumentar o multiplicador de pontos.

## Naves

| Nave | Classe | Arma |
|---|---|---|
| **Interceptor** | Interceptador | Canhões gêmeos: dois disparos paralelos, cadência muito alta |
| **Striker** | Pesado | Canhão de plasma: um orbe lento e devastador |
| **Spectre** | Controle | Leque triplo: três trajetórias, ótimo contra grupos |
| **Nova** | Energia | Lança de energia: feixe contínuo que acelera ao aquecer |

Cada nave tem velocidade, manobrabilidade, aparência e som de tiro próprios.

## Power-ups e melhorias

**Power-ups (temporários):** Escudo, Tiro rápido, Tiro triplo, Turbo e Reparo.

**Melhorias (permanentes durante a partida):** os núcleos dourados deixados a cada onda vencida, pelo chefe e por alguns inimigos dão uma melhoria aleatória:

- Dano, Cadência de tiro, Tiro múltiplo e Velocidade do projétil, que fazem a arma evoluir por 5 níveis visuais (Padrão → Aprimorada → Avançada → Elite → Máxima)
- Barreira de energia, que absorve um impacto e recarrega sozinha
- Propulsores
- Onda de choque, um ataque especial com recarga

## Outros recursos

- **Top 3:** as três maiores pontuações ficam salvas no navegador, com codinome e onda alcançada.
- **Modo demonstração:** depois de 10 segundos parado no menu, um piloto automático joga sozinho com uma nave sorteada. Qualquer tecla, clique ou movimento do mouse devolve o controle. As pontuações da demonstração nunca são salvas.
- **Trilha sonora:** músicas diferentes para o menu, o jogo, o chefe e o fim de jogo. Os efeitos sonoros são gerados com a Web Audio API.
- **Configurações:** som, volume geral, volume da música, tremor de tela, tela cheia e dificuldade (Fácil, Normal, Difícil).
- **Ferramentas de desenvolvimento:** `F3` abre o painel do motor (FPS, entidades, memória) e `F4` mostra as caixas de colisão.

## Executar

Abra o `index.html` em um navegador moderno (Chrome, Edge ou Firefox).

Se preferir servir a pasta por um servidor local:

```bash
python -m http.server 8765
```

Depois acesse `http://localhost:8765`.

## Estrutura

```
index.html        página do jogo e tela de carregamento
css/style.css     menus, telas e seleção de naves
js/game.js        laço principal, estados do jogo e eventos
js/player.js      nave do jogador, tiro e melhorias
js/ships.js       definição e desenho das quatro naves
js/projectile.js  projéteis e efeitos visuais das armas
js/enemy.js       inimigos
js/boss.js        chefe e suas fases
js/asteroid.js    asteroides
js/wave.js        ondas
js/collision.js   colisões
js/powerup.js     power-ups e núcleos de melhoria
js/particles.js   partículas (explosões, rastros, impactos)
js/audio.js       efeitos sonoros e trilha sonora
js/ui.js          menus, HUD, codinome e seleção de naves
js/leaderboard.js Top 3 salvo no navegador
js/attract.js     modo demonstração e piloto automático
js/debug.js       painel do motor (F3) e colisões (F4)
js/utils.js       constantes e funções auxiliares
music/            trilha sonora
```
