# 5K9 Apollo

A entrega do estúdio para o cliente: o vídeo que ele revisa quadro a quadro, a
foto que ele escolhe, e o registro do que ele aprovou — num link que abre no
celular.

Mesmo desenho e mesma stack do [5K9 Forms](../../Forms/5K9%20Forms), do
[5K9 Gestor](../../Gestor/5K9%20Gestor) e do
[5K9 Chronos](../../Chronos/5K9%20Chronos): módulos ES servidos direto, sem
build, sobre o design system da marca (`tokens.css` + `ds/`). O que muda aqui —
e é a única coisa que muda — é que existe mídia pesada, e mídia pesada não cabe
nesse desenho sozinha. A seção [Pipeline de mídia](#pipeline-de-mídia) trata
disso de frente.

Os links para os outros sistemas supõem cada um na sua pasta dentro de
`Programas/` — `Chronos/5K9 Chronos`, `Forms/5K9 Forms`, `Gestor/5K9 Gestor` —,
que é como o Chronos e o Apollo já estão.

Este documento é o escopo. O que já existe está em [Estado](#estado).

---

## Onde ele mora no ecossistema

| Ferramenta | O que ela responde |
|---|---|
| **Gestor** | quem é o cliente, quanto ele paga, quando renova |
| **Forms** | o que ele respondeu no briefing |
| **Chronos** | o que vai ao ar, quando, e com que roteiro |
| **Apollo** | **o material pronto, e o que ele achou dele** |

O cliente nasce no Gestor, é copiado para o Chronos e será copiado para o
Apollo pelo mesmo caminho (`Clientes → Trazer do Gestor`, em
[`lib/gestor.js`](../../Chronos/5K9%20Chronos/Sistema/lib/gestor.js)). Nome
digitado duas vezes vira dois clientes.

### O cliente tem um link só

Esta é a decisão estruturante, e ela precisa ser tomada antes da primeira
tabela.

O Chronos já manda um link sem senha para o cliente (`/c/:token`). Se o Apollo
criar outro, o cliente passa a ter dois endereços do mesmo estúdio e vai
perguntar no WhatsApp qual é o certo — que é exatamente a conversa que o
Chronos existe para acabar.

Então o Apollo **não cria dono de cliente**. Ele lê `vz_clientes` — a mesma
tabela do Chronos, no mesmo projeto Supabase — e usa **o mesmo token**. As duas
páginas públicas passam a ser duas seções da mesma casa:

```
/c/:token          cronograma do mês        (Chronos, já existe)
/e/:token          entregas                 (Apollo)
/e/:token/:peca    a peça, com revisão      (Apollo)
```

Quando as duas estiverem de pé, o cabeçalho público vira um só, com
`Cronograma · Vídeos · Fotos`, e o cliente nunca soube que são dois
repositórios.

**A exceção é o link avulso.** Uma entrega pontual — material bruto de um
evento, um corte que vai para o cliente do cliente — não deve morar no link
permanente. Para isso existe `ap_links`: token próprio, validade, senha
opcional, e revogação. Dois tipos de link, dois propósitos declarados:

| | Link do cliente | Link de entrega |
|---|---|---|
| endereço | `/e/:token` | `/l/:token` |
| dono | o cliente, para sempre | um projeto, por um tempo |
| validade | não expira | expira, e pode ser revogado |
| senha | não | opcional |
| some quando | nunca | na data marcada |

---

## Rodar

```bash
node .claude/static-server.js
```

Abre em `http://localhost:5178`. Sem passo de build: o servidor entrega
`Sistema/` e devolve `index.html` para rotas sem extensão, o mesmo que o
`vercel.json` faz em produção. A porta é 5178 porque 5176 é do Dionísio e
5177 do Partners, em `lib/ferramentas.js` — que agora lista o Apollo e
precisa ser copiado para os outros repositórios.

## Publicar na Vercel

Repositório `5009DS/5k9-apollo`, importado na Vercel com:

| Campo | Valor |
|---|---|
| Root Directory | `Sistema` |
| Framework Preset | Other |
| Build Command | vazio — não há build |
| Output Directory | vazio — a raiz de `Sistema/` é servida como está |

O `Sistema/vercel.json` devolve `index.html` para qualquer rota, o mesmo que o
servidor local faz. O domínio previsto é `apollo.5k9.studio`, o que o
trocador de ferramentas já usa.

### Ligar o domínio (GoDaddy)

1. Na Vercel, projeto `5k9-apollo` → **Settings → Domains** → adicionar
   `apollo.5k9.studio`. A Vercel mostra o registro DNS que espera.
2. Na GoDaddy, **Meus produtos → 5k9.studio → DNS → Adicionar registro**:
   tipo `CNAME`, nome `apollo`, valor o que a Vercel mostrou
   (normalmente `cname.vercel-dns.com`), TTL padrão.
3. Voltar à Vercel e esperar o domínio ficar **Valid Configuration**. O
   certificado HTTPS sai sozinho.

O subdomínio precisa ser exatamente `apollo`: o trocador monta o endereço de
cada ferramenta trocando o primeiro rótulo do domínio atual
(`chronos.5k9.studio` → `apollo.5k9.studio`). Com outro nome, o menu das
outras ferramentas aponta para um endereço que não existe.

**Enquanto não houver banco, o site publicado também é modo local.** Cada
navegador que abrir o endereço tem os próprios projetos e fotos, guardados
só nele. Serve para a equipe testar em qualquer máquina; o link de um cliente
continua não funcionando fora do navegador que criou o projeto. O Teste 1
(banco e R2) é o que muda isso.

## Estado

**Teste 0 — fotos em modo local.** Roda inteiro no navegador, sem banco e sem
R2: as linhas ficam no `localStorage` e os arquivos no IndexedDB
(`lib/midia.js`), com as chaves já no desenho dos buckets.

| Existe | Onde |
|---|---|
| Painel com projetos e "o que o cliente escolheu" | `pages/painel.js` |
| Galeria: enviar (arrastar ou escolher), ficha da foto, status, excluir | `pages/galeria.js` |
| Derivado de até 2048 px e miniatura, com a marca **queimada** | `lib/fotos.js` |
| Consentimento por foto e em lote; sem ele a foto não entra no link | `db/local.js`, `pages/galeria.js` |
| Link do cliente `/e/:token`: grade, tela cheia, escolher com o coração | `pages/entrega.js` |
| O link não devolve master, token, e-mail, responsável nem etiqueta | `db/local.js`, `entrega()` |

Limites do modo local, declarados: o link do cliente só abre **neste mesmo
navegador**, limpar os dados do site apaga as fotos, e o cliente é cadastrado
aqui (ligado ao banco, ele vem de `vz_clientes`, do Chronos).

**Para o Teste 1 — um link de verdade para um cliente:** `db/schema.sql` com
as funções `ap_`, `db/remoto.js`, os buckets R2, o Worker (URL assinada,
bilhete, ZIP) e o deploy na Vercel. Vídeo começa na Etapa 2.

**Etapa 1b — apresentação, também em modo local.** Os dois primeiros
[formatos de página](#formatos-de-página): seleção e apresentação.

| Existe | Onde |
|---|---|
| Os 9 blocos: campos, conteúdo inicial e desenho, num lugar só | `lib/blocos.js` |
| Organização da página: formato, cor de destaque, blocos, prévia em iframe, editor | `pages/pagina.js` |
| Publicar cria versão congelada; "mudanças não publicadas" no topo | `store.js`, `publicar()` |
| A apresentação do cliente, e a prévia pelo mesmo código | `pages/apresentacao.js` |
| Aprovar e pedir ajuste, com as recusas do banco (versão velha, já aprovada, sem nome) | `db/local.js` |
| Resposta da equipe no fio, com a regra de estado copiada do Chronos | `lib/conversa.js` |
| "Sem pessoa identificável" como motivo de consentimento | `pages/galeria.js`, `pages/pagina.js` |
| PNG transparente e SVG viram PNG; apresentação sem marca d'água | `lib/fotos.js`, `store.js` |
| Bloco de vídeo curto (vinheta, animação do logo): em loop, mudo e tocando sozinho; largura Slide para sequência de telas | `lib/blocos.js`, `store.enviarVideo` |
| Link personalizado: apelido do cliente e do projeto (`/e/dr-winter/p/identidade-visual`); o link com código continua valendo | `pages/pagina.js`, `store.definirLink`, `lib/pecas.js` |
| Publicação na nuvem (atalho antes do Teste 1): Publicar sobe a versão e os arquivos com autorização para o Supabase do Forms; o link do cliente abre em qualquer aparelho, e aprovação e ajuste voltam para o painel | `db/nuvem.sql`, `lib/nuvem.js`, `store.publicar` |

Ainda não: `entrega` e `revisao`, comentar por bloco e o kit da marca para
baixar depois de aprovado (precisa do Worker).

## Telas

| Rota | O que responde |
|---|---|
| `/` | Os projetos abertos e, antes deles, o que o cliente comentou e ninguém respondeu. |
| `/projeto/:id` | As peças daquele projeto, em pastas, com status e responsável. |
| `/projeto/:id/pagina` | A organização da página: o formato, os blocos em ordem, a prévia e o publicar. |
| `/peca/:id` | **A revisão.** Player, versões, comentários no quadro, anotações. |
| `/galeria/:id` | As fotos do projeto: aprovar, marcar, ver o que o cliente escolheu. |
| `/links` | Os links vivos: quem abriu, quanto assistiu, o que expira essa semana. |
| `/enviar` | Subir material: master, proxy e o que o sistema leu de cada arquivo. |
| `/configuracoes` | Conexão, marca da página do cliente, cópia de segurança, tema. |
| **`/e/:token`** | **O cliente.** A página de entregas dele. |
| **`/e/:token/:peca`** | **O cliente.** A peça, com comentar e aprovar. |
| **`/e/:token/p/:projeto`** | **O cliente.** Um projeto no formato dele — a apresentação inteira num endereço só. |
| **`/l/:token`** | **O cliente.** Entrega avulsa, com validade e senha. |

As quatro últimas são a razão do sistema existir. Tudo o mais serve para
alimentá-las.

---

## As vinte funções

Não é a lista inteira do Frame.io — é o recorte que faz alguém trocar de
ferramenta. O que ficou de fora está em [O que não vamos
fazer](#o-que-não-vamos-fazer), com o motivo.

### Revisar

**1. Comentário preso ao quadro.** O cliente pausa, escreve, e o comentário
nasce com o número do quadro. Clicar nele leva o player de volta àquele quadro
exato — não "por volta de". A seção [O player](#o-player) explica por que isso
é mais difícil do que parece e como resolvemos.

**2. Comentário de intervalo.** "Desses três segundos até aqui a música cobre a
voz" não é um ponto. Marcar entrada e saída grava `quadro` e `quadro_fim`, e a
barra do player mostra a faixa colorida. Sem isso, o cliente escreve o mesmo
comentário três vezes tentando cercar o trecho.

**3. Anotação por cima do quadro.** Caneta livre, seta, retângulo e texto,
desenhados sobre a imagem pausada. Guardados em **coordenadas normalizadas**
(0–1), nunca em pixels: o desenho feito no celular tem que cair no lugar certo
quando a equipe abre no monitor de 27".

**4. O fio tem fim.** Cada comentário abre uma conversa com os mesmos três
estados do Chronos — pendente, respondido, fechado — e com as mesmas quatro
palavras gravadas no banco:

| `tipo` | Quem grava | O que quer dizer | Estado depois |
|---|---|---|---|
| `ajuste` | cliente | pediu uma mudança | pendente — a vez é da equipe |
| `ajustado` | equipe | **Ajustamos**: o vídeo mudou | respondido — a vez é do cliente |
| `resposta` | equipe | **Respondemos**: não vai mudar, e aqui está o porquê | respondido |
| `aprovado` | qualquer lado | o "ficou bom" que encerra o assunto | fechado |

`ajustado` e `resposta` são separados de propósito: colapsar os dois num
"resolvido" ensina a marcar como ajustado o que não foi ajustado. E fechar um
fio **não aprova a peça** — "este trecho ficou bom" é o fim de um assunto; a
aprovação da versão é outra coisa e mora em `ap_aprovacoes`. É a mesma lição
que o Chronos aprendeu com a aprovação por fala.

O estado **não é uma coluna**: é a última entrada do fio, derivado pela mesma
função nos dois lados — se a equipe visse "pendente" onde o cliente vê
"resolvido", o sistema perderia a única coisa que oferece. A regra vem de
[`lib/conversa.js`](../../Chronos/5K9%20Chronos/Sistema/lib/conversa.js), do
Chronos, e é aqui que "gêmeo" precisa ser preciso:

- **Copiado sem mudar uma linha:** `ATOS`, `ato`, `ESTADOS`, `estadoMeta`,
  `daEquipe`, `emOrdem`, `estadoDaConversa`, `foiEditado` e `novidadesPara` —
  a parte que decide de quem é a vez. Ela só lê `origem`, `tipo` e
  `criado_em`, e é por isso que essas colunas têm os mesmos nomes e valores
  nos dois bancos.
- **De cada sistema:** o agrupamento e a montagem da entrada. O Chronos agrupa
  por fala (`bloco_id`) e guarda o texto antigo em `trecho`; o Apollo agrupa
  pelo comentário que abriu o fio (`pai_id`) e guarda quadro e anotação.
  `conversas`, `textoOriginal` e `entradaDaEquipe` são escritas de novo aqui.

Mudança na regra de estado é feita nos dois arquivos no mesmo dia, ou não é
feita.

**5. Comentário interno.** A equipe conversa na mesma peça sem o cliente ler.
Entrada interna é `origem = 'equipe'` com `interno = true` — não existe um
tipo a mais para ela. O recorte acontece na função do banco, não na tela:
filtrar na interface deixaria o texto interno viajando no JSON até o navegador
dele. É a mesma decisão que o Chronos tomou com as etiquetas.

**Entrada interna não conta no estado.** A vez de alguém só existe na conversa
com o cliente. Se uma nota da equipe dentro do fio entrasse na conta, a equipe
veria "respondido" onde o cliente — que nunca recebe a nota — vê "pendente".
Por isso a tela da equipe descarta `interno = true` **antes** de chamar
`estadoDaConversa`, e o filtro "tem comentário sem resposta" também. Fio
inteiramente interno não tem estado nenhum.

**6. Atalhos de teclado.** `espaço` toca, `J K L` rebobina/pausa/avança com
velocidade, `←→` andam um quadro, `shift+←→` andam um segundo, `i` e `o`
marcam o intervalo, `c` abre o comentário, `↑↓` pulam entre comentários. É
isto — e não o player — que faz editor gostar de uma ferramenta de revisão.

### Versionar

**7. Pilha de versões.** V1, V2, V3 vivem dentro da **mesma peça**. O link
enviado na semana passada continua valendo e passa a abrir a versão nova; o
cliente não recebe um endereço por corte.

**O comentário pertence à versão, não à peça.** Isto precisa nascer certo:
transformar depois um comentário solto em comentário versionado é uma migração
que ninguém quer fazer com histórico de cliente dentro.

**8. Comparar duas versões.** Lado a lado com o playhead travado, e A/B com
uma linha vertical arrastável por cima. É como se responde "mudou mesmo?" sem
abrir duas abas.

**9. Herança do que ficou aberto.** Ao subir a V3, os fios da V2 que não estão
fechados — pendentes ou respondidos — sobem junto, marcados como vindos de trás
(`herdado_de`). Um pedido de ajuste não deixa de existir
porque exportamos de novo — e o cliente que pediu quer ver onde ele foi parar.

### Organizar

**10. Status por peça.** `a revisar`, `em ajuste`, `aprovado`, com a cor lida
de longe. Poucos e fixos, porque cada valor vira regra em código; o resto do
estado interno é **etiqueta**, texto livre que o sistema não interpreta —
mesma divisão do Chronos, pelo mesmo motivo.

**11. Responsável e prazo.** Quem está com a peça, e até quando. O painel abre
pelo que passou da data.

**12. Busca e filtro.** Por cliente, projeto, status, etiqueta, responsável e
"tem comentário sem resposta". A última é a que vai ser usada todo dia.

### Compartilhar

**13. Link com validade e senha.** Data de expiração, senha opcional
(guardada como hash, nunca em claro) e revogação imediata. Material de paciente
não pode ficar aberto para sempre num endereço que alguém encaminhou.

**14. Download ligado ou desligado, por link.** E quando ligado, é uma URL
assinada de vida curta, gerada na hora. O arquivo nunca tem endereço público
fixo — endereço que vaza uma vez, vaza para sempre.

**15. Marca d'água com quem está vendo.** O e-mail de quem abriu, escrito por
cima da imagem. Ver a seção [Marca
d'água](#marca-dágua-o-que-é-real-e-o-que-é-enfeite) — tem limite técnico e ele
está declarado lá, porque uma marca d'água que a equipe acha que protege e não
protege é pior que nenhuma.

**16. Quem abriu, e quanto assistiu.** Data da primeira abertura, do último
acesso, e até que ponto do vídeo a pessoa chegou. Responde "o cliente sumiu?"
antes de virar conversa constrangedora — e responde "ele aprovou sem ver",
que acontece.

### Aprovar

**17. Aprovação registrada como prova.** Quem aprovou, quando, **de qual
versão**, com um retrato do estado daquele momento gravado junto. É o que
resolve "eu nunca aprovei esse corte" três semanas depois, e vale mais que
qualquer recurso de player.

**18. Aprovação em etapas.** A médica aprova o roteiro, o marketing aprova a
peça, o cliente final libera. Cada etapa sabe de quem é a vez e o e-mail sai
sozinho para a próxima. Projeto sem etapas configuradas se comporta como hoje:
uma aprovação, direto.

**19. E-mail em cada evento.** Material novo, pedido de ajuste, ajuste pronto,
aprovação, link prestes a expirar. O Chronos documenta com honestidade que não
consegue enviar e-mail sozinho — mas o **Gestor já resolveu isso**, com Resend
e cron na Vercel, em
[`api/comprovantes.js`](../../Gestor/5K9%20Gestor/Sistema/api/comprovantes.js). O Apollo
nasce com esse encanamento copiado, não com um botão de "copiar para o
WhatsApp".

### Devolver para a edição

**20. Os comentários voltam para a timeline.** CSV com timecode, e um `.edl` de
marcadores que o DaVinci importa direto. No Premiere não existe importação
nativa limpa de marcadores — o caminho confiável é um ExtendScript curto que lê
o CSV, e ele vive em `ferramentas/`.

Sem isto, o editor lê os comentários numa aba e anota no papel, e a ferramenta
inteira vira um WeTransfer com comentário.

---

## Formatos de página

Nem todo material chega ao cliente do mesmo jeito. Um ensaio é para escolher;
uma identidade visual é para ser apresentada — e mandar a marca nova de alguém
como PDF anexado é desperdiçar o trabalho na última etapa. Então o projeto
escolhe o **formato** em que ele chega:

| Formato | Para quê | O que o cliente faz |
|---|---|---|
| `selecao` | ensaio, evento, banco de imagens | escolhe as fotos |
| `apresentacao` | identidade visual, campanha, case | lê, aprova ou pede ajuste |
| `entrega` | o material final, já aprovado | baixa os arquivos |
| `revisao` | vídeo (Etapa 2) | comenta no quadro e aprova |

O formato é do **projeto** (`ap_projetos.modelo`), não do link: o mesmo
`/e/:token` mostra o ensaio como seleção e a identidade como apresentação, cada
um no seu.

### A apresentação

Uma página longa e editorial, feita de blocos:

| Bloco | O que mostra |
|---|---|
| `capa` | imagem em tela cheia, com título e subtítulo |
| `texto` | o conceito — a ideia por trás da marca |
| `logo` | a marca e as variações, cada uma no fundo em que ela vai viver |
| `paleta` | as cores, com HEX, RGB e CMYK que o cliente copia num toque |
| `tipografia` | as fontes da marca, com amostra |
| `aplicacoes` | a grade de mockups: cartão, fachada, redes, uniforme |
| `imagem` | uma imagem inteira, sem moldura |
| `antes_depois` | a marca antiga e a nova, com o divisor arrastável |
| `fechamento` | aprovar ou pedir ajuste; o kit da marca para baixar depois do aprovado |

**Blocos fixos, ordem livre.** A equipe escolhe quais blocos usar, em que
ordem, e preenche cada um. Não existe posicionar elemento à mão — isso é o
editor livre que [Decisões que valem saber](#decisões-que-valem-saber) recusa.
Bloco novo é código: desenhado uma vez, com cuidado, e usado em toda
apresentação dali para a frente.

**Moldura 5K9, conteúdo do cliente.** Grade, ritmo, tipografia de interface,
cabeçalho e a assinatura no rodapé são da 5K9 — é o que faz a página parecer
trabalho do estúdio. O que é do cliente entra dentro dos blocos: o logo, a
paleta, as fontes, os mockups, e uma cor de destaque (`ap_projetos.visual`)
tirada da paleta dele. A marca nova é a protagonista; a moldura é a assinatura.

**Publicar cria uma versão da página.** A equipe monta em rascunho e o cliente
só vê o que foi publicado. Cada publicação congela os blocos em
`ap_publicacoes`, numerada — V1, V2 —, pelo motivo de "o comentário pertence à
versão": aprovar a V2 da identidade não pode ser lido como aprovação da V1, e
um ajuste feito depois não pode mudar o que já foi aprovado.

**O cliente aprova ou pede ajuste.** A aprovação vai para `ap_aprovacoes`,
presa à publicação, com o retrato de sempre. O pedido de ajuste é um
comentário preso à publicação, com o fio de três estados de sempre. Comentar
bloco a bloco fica para depois: um pedido geral bem escrito resolve o caso
real, e um fio por bloco é uma tela inteira a mais.

**As imagens vêm das peças do projeto.** Um bloco nunca recebe arquivo solto:
ele aponta para peças (`peca_id`), escolhidas entre as que o projeto já tem.
É isso que mantém valendo, sem regra nova, o original sem endereço e o
consentimento. A publicação guarda os ids, não as chaves — uma peça que perde
a autorização some da página publicada também.

**Marca d'água desligada por padrão.** O "5K9" em diagonal por cima do logo do
cliente estragaria justamente o que a página existe para mostrar, e o
material é dele. Peça enviada para um projeto de apresentação nasce com
`marca_dagua = false`; a equipe liga quando a peça for sensível.

**Fonte só com licença para web.** A amostra de tipografia usa o arquivo da
fonte do cliente apenas quando a equipe marca que a licença permite uso na
web. Sem isso, a amostra é uma imagem. Fonte comercial publicada num site sem
licença é infração do estúdio, não do cliente.

### A organização da página

`/projeto/:id/pagina` é onde o formato é escolhido e a página é montada:

```
┌─ Formato: [Seleção] [Apresentação●] [Entrega] ──────── [📱 🖥]  [Publicar V2] ─┐
│ BLOCOS            │  PRÉVIA AO VIVO                │  BLOCO: Paleta          │
│ ⠿ Capa            │  ┌──────────────────────────┐  │  ■ #7F00E1  Violeta     │
│ ⠿ Conceito        │  │     DRA. FERNANDA        │  │  ■ #F4EFE6  Areia  [+]  │
│ ⠿ Logo            │  │     Identidade 2026      │  │  Mostrar CMYK  [✓]      │
│ ⠿ Paleta      ◀   │  ├──────────────────────────┤  │  Texto de apoio         │
│ ⠿ Tipografia      │  │  ■■■■  ■■■■  ■■■■        │  │  [...................]  │
│ + Adicionar bloco │  └──────────────────────────┘  │                         │
└───────────────────┴────────────────────────────────┴─────────────────────────┘
```

Três colunas: os blocos (arrastar para ordenar, adicionar, remover), a prévia
ao vivo no celular e na mesa, e os campos do bloco escolhido. A prévia é a
mesma tela que o cliente vai ver, desenhada pelo mesmo código — prévia feita
à parte mente no primeiro detalhe.

---

## O player

Quase todo clone de ferramenta de revisão erra aqui, e o erro só aparece
quando o editor abre no Premiere e o comentário está no lugar errado.

**Quadro é inteiro, e o framerate é uma fração.** `29.97` não é um número: é
`30000/1001`. Guardar o arredondado faz a conta escorregar cerca de um quadro
por hora de vídeo — pouco para peça de trinta segundos, fatal no dia em que
alguém subir uma entrevista de quarenta minutos. Por isso a versão guarda
`fps_num` e `fps_den`, e a duração é guardada em **quadros**, não em segundos.

```js
// segundo → quadro
const quadro = Math.floor(t * fps_num / fps_den + 1e-6);

// quadro → segundo, mirando o MEIO do quadro
const t = (quadro + 0.5) * fps_den / fps_num;
```

O `+ 0.5` é o detalhe que decide tudo: mirar o começo exato do quadro cai, com
frequência, no último instante do quadro anterior por erro de ponto flutuante,
e o vídeo pára um quadro antes do que o comentário diz.

**`currentTime` mente.** Ele devolve para onde você mandou ir, não o que está
desenhado na tela. Quem sabe a verdade é `requestVideoFrameCallback`, que
entrega o `mediaTime` do quadro efetivamente apresentado. O timecode na tela e
o quadro gravado no comentário saem **sempre** de lá.

**Andar de quadro em quadro é pausar e buscar.** Não existe "próximo quadro" em
vídeo HTML5; a operação é `pause()` seguido de um seek para o quadro seguinte.

**O proxy precisa de keyframe denso.** Com GOP longo, o navegador só consegue
parar nos keyframes: o cliente comenta no quadro 300 e o player mostra o 288.
Um sistema de revisão que erra o quadro não revisa nada. Por isso o proxy é
codificado com keyframe a cada segundo (`-g` igual ao fps, `-sc_threshold 0`).

**Timecode de origem.** A câmera começa em `01:00:00:00`, a timeline do editor
também, e o vídeo exportado começa em zero. Guardamos o TC inicial lido do
arquivo e mostramos o timecode **absoluto** — é o número que o editor procura
na timeline dele. Em 29.97 a notação é drop-frame, com `;` no lugar do último
`:`, e a conta de drop-frame está em `lib/timecode.js` com os testes ao lado.

**MP4 progressivo, não HLS.** O R2 responde a `Range`, e peça de social tem
trinta a noventa segundos: HLS acrescentaria manifesto, segmentação e uma
biblioteca de um megabyte para resolver um problema que não existe nesse
tamanho. A regra: acima de dez minutos, gera HLS; abaixo, MP4 direto. O campo
`hls_prefixo` já existe na tabela para o dia em que a primeira peça longa
chegar.

---

## Pipeline de mídia

Nenhum navegador toca ProRes, e nenhum cliente espera três gigabytes carregarem
no 4G do consultório. Alguém precisa transcodificar. As opções reais:

| Caminho | Custo | O que pesa contra |
|---|---|---|
| **ffmpeg no estúdio** | zero | depende de a pessoa rodar o script |
| **VPS pequeno com fila** | US$ 5–10/mês | mais um servidor para cuidar |
| **Bunny / Cloudflare Stream** | por minuto guardado e entregue | custo cresce com o catálogo |

**A escolha da v1 é o estúdio**, e não é economia: é que a máquina que acabou
de exportar o master já tem o arquivo, já tem ffmpeg e está ociosa. Subir o
proxy junto do master custa um comando; um servidor de fila custa manutenção
para sempre.

`ferramentas/preparar.js` recebe o master e devolve tudo que a versão precisa:

```bash
# proxy — keyframe a cada segundo, para o scrub parar onde mandarem
ffmpeg -i master.mov -c:v libx264 -crf 20 -preset medium \
  -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart proxy.mp4

# capa
ffmpeg -i master.mov -ss 1 -frames:v 1 -vf scale=640:-2 capa.jpg

# tira de miniaturas do scrub (10x10, um quadro por segundo)
ffmpeg -i master.mov -vf "fps=1,scale=160:-2,tile=10x10" tira.jpg

# a ficha técnica que vira colunas da versão
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,nb_frames,width,height \
  -show_entries format=duration -of json master.mov
```

A forma de onda do áudio sai do PCM extraído pelo ffmpeg e vira um JSON de
picos calculado no Node — desenhar onda no navegador a partir do áudio inteiro
significa baixar o áudio inteiro antes de mostrar qualquer coisa.

**O upload não passa pela Vercel.** O limite de payload de uma função está na
casa dos megabytes. O navegador pede uma URL assinada a um Worker e sobe
**direto para o R2**, em partes, com retomada — upload de quatro gigabytes numa
conexão de estúdio cai, e recomeçar do zero faz a pessoa desistir da ferramenta
na segunda tentativa.

O dia em que isso apertar, o `preparar.js` roda igual num VPS, disparado por
fila. O formato de saída é o mesmo; nada no banco muda.

### Marca d'água: o que é real e o que é enfeite

Marca d'água em CSS por cima do `<video>` sai com F12, com print e pedindo a
URL do arquivo. Não é proteção; é aviso.

O que fazemos, em três níveis declarados:

1. **Sempre**: a marca do estúdio é **queimada no proxy** pelo `preparar.js`.
   Um transcode, uma vez, para todo mundo.
2. **Em cima disso**: o e-mail de quem abriu, sobreposto em HTML. Sai com F12 —
   e serve para o que serve, que é lembrar quem está vendo de que dá para saber
   quem está vendo.
3. **Sob pedido**: para material realmente sensível, uma cópia queimada por
   convidado, gerada na hora. Custa um transcode por pessoa e por isso é uma
   caixa que alguém marca, nunca o padrão.

**Marca d'água forense** — a invisível, que sobrevive a recorte e recompressão
— não está aqui. É matemática de verdade, é o que os estúdios de cinema usam
para rastrear vazamento, e não é o medo de vocês.

Foto é diferente e mais fácil: a marca é queimada no derivado que o cliente vê,
e o arquivo limpo **não tem URL** — só sai por link assinado, depois da
aprovação.

---

## Armazenamento e custo

**Cloudflare R2**, e a conta da sua pesquisa está certa: 10 GB grátis por mês,
US$ 0,015 por GB-mês depois. O que decide, e não estava na conta, é que a
**saída é zero** — cliente baixando quarenta gigabytes de fotos não custa nada.
No S3 esse mesmo download seria a maior linha da fatura, e é por isso que o R2
ganha aqui.

| | Guardado | Por mês |
|---|---|---|
| 100 GB | 90 GB cobrados | ~US$ 1,35 |
| 500 GB | 490 GB cobrados | ~US$ 7,35 |
| 1 TB | ~990 GB cobrados | ~US$ 14,85 |

Três buckets, com regras de vida diferentes:

| Bucket | O que guarda | Vida |
|---|---|---|
| `apollo-master` | o arquivo de origem | move para arquivo frio aos 90 dias |
| `apollo-proxy` | proxy, capa, tira, onda | enquanto a peça existir |
| `apollo-entrega` | derivado com marca d'água, ZIPs | apaga aos 30 dias |

A regra de ciclo de vida é do bucket, não do sistema: "temporário" que depende
de alguém lembrar de apagar não é temporário. E o ZIP de download é montado em
**streaming no Worker** — trezentas fotos zipadas no navegador estouram a aba.

O Supabase guarda **apenas as linhas** — nenhum byte de mídia. O plano gratuito
dá 1 GB de arquivo e cobra saída; é a conta errada para vídeo, e não é para
isso que ele está aqui.

---

## Segurança

As regras são as mesmas do Chronos, porque o risco é o mesmo, e maiores em um
ponto, porque aqui existe download.

**O cliente não lê tabela nenhuma.** A chave `anon` é pública por natureza, e
RLS decide o que cada *linha* permite, não o que a consulta pediu. O anônimo só
enxerga funções `security definer` que recebem o token e devolvem a resposta já
recortada — sem rascunho, sem comentário interno, sem a anotação da equipe:

| Função | O que faz |
|---|---|
| `ap_abrir(token, senha)` | devolve a página de entrega, ou nada |
| `ap_peca(token, peca)` | a peça com as versões e os comentários visíveis |
| `ap_comentar(...)` | grava comentário do cliente: `origem = 'cliente'` e `interno = false` sempre, sem parâmetro, e `tipo` só `ajuste` ou `aprovado` |
| `ap_aprovar(token, versao, decisao, nome)` | grava a decisão e o retrato |
| `ap_selecionar(token, peca, marcado)` | a lista de fotos escolhidas |
| `ap_visitar(token, versao, quadro_max)` | a métrica de leitura |
| `ap_ticket(token, peca)` | um bilhete de uso único para baixar |

**A URL assinada é gerada pelo Worker, não pelo Postgres.** Assinar exige um
segredo do R2, e segredo do R2 dentro do banco é segredo a um `select` de
distância. O banco só emite um bilhete curto e de uso único; o Worker confere o
bilhete e devolve a URL.

**Toda regra que importa mora no banco.** Link expirado, link revogado, senha
errada, download desligado, peça já aprovada — tudo recusado pela função, com
mensagem escrita para o cliente ler. Esconder o botão na tela é decoração: quem
tem o link e o console chama a função direto. É a mesma lição da trava de
"gravado" no Chronos.

**Consentimento de imagem não é burocracia.** Os clientes de vocês são médicos
— o Chronos já carrega o alerta de CFM 2.336/2023 — e foto de paciente sem
autorização registrada é risco de verdade, para eles e para o estúdio. O lugar
de registrar isso é junto da foto: tem autorização, até quando vale, e para que
uso. Peça sem consentimento marcado **não entra em link público**, e o sistema
recusa em vez de avisar.

Mockup, logo e embalagem não têm pessoa nenhuma e não pedem termo — mas também
não passam sozinhos. A equipe marca "sem pessoa identificável", e essa marca é
uma linha de consentimento como outra qualquer (`motivo = 'sem_pessoa'`), com
data e quem marcou. A regra continua sendo uma só: sem linha, não entra. Liberar
por formato ("apresentação não exige") deixaria passar sem registro a foto de
paciente que um dia vai estar numa apresentação de antes e depois.

---

## O banco

Mora no projeto Supabase do **5K9 Forms**, com prefixo `ap_` — pelo mesmo
motivo do Chronos: a cota de projetos do plano gratuito já está gasta, e
dividir Postgres não tem contrapartida técnica. O Gestor continua sozinho, e
continua sem nenhuma tela aberta ao público.

**O dono do cliente é `vz_clientes`**, do Chronos. O Apollo não cria um segundo
cadastro de cliente: ele aponta para o que existe, e é isso que faz o link ser
um só.

Por isso todo `cliente_id` daqui é **`text`, não `uuid`**: é o tipo de
`vz_clientes.id`, que o Chronos criou como `gen_random_uuid()::text`. O
Postgres não aceita chave estrangeira entre tipos diferentes, e um `uuid` aqui
faria o `schema.sql` parar na primeira tabela. As tabelas `ap_` continuam com
`uuid` de verdade; só a coluna que aponta para fora segue o tipo de lá.

```sql
-- Projeto: um pacote de entregas de um cliente.
create table ap_projetos (
    id           uuid primary key default gen_random_uuid(),
    -- text, e não uuid: é o tipo de vz_clientes.id no Chronos.
    cliente_id   text not null references vz_clientes(id) on delete cascade,
    nome         text not null,
    descricao    text,
    -- Como o material chega ao cliente (ver "Formatos de página").
    modelo       text not null default 'selecao'
                 check (modelo in ('selecao','apresentacao','entrega','revisao')),
    -- Cor de destaque e capa da página; o resto da moldura é da 5K9.
    visual       jsonb,
    criado_em    timestamptz not null default now(),
    arquivado_em timestamptz
);

create table ap_pastas (
    id         uuid primary key default gen_random_uuid(),
    projeto_id uuid not null references ap_projetos(id) on delete cascade,
    pai_id     uuid references ap_pastas(id) on delete cascade,
    nome       text not null,
    ordem      int  not null default 0
);

-- Peça: a coisa que se revisa, independente de versão.
create table ap_pecas (
    id           uuid primary key default gen_random_uuid(),
    projeto_id   uuid not null references ap_projetos(id) on delete cascade,
    pasta_id     uuid references ap_pastas(id) on delete set null,
    tipo         text not null check (tipo in ('video','foto','audio','doc')),
    titulo       text not null,
    status       text not null default 'a_revisar'
                 check (status in ('a_revisar','em_ajuste','aprovado')),
    etiquetas    text[] not null default '{}',
    responsavel  text,
    prazo        date,
    ordem        int not null default 0,
    criado_em    timestamptz not null default now(),
    arquivado_em timestamptz
);

-- Versão: o arquivo. Framerate é fração; duração é em quadros.
create table ap_versoes (
    id              uuid primary key default gen_random_uuid(),
    peca_id         uuid not null references ap_pecas(id) on delete cascade,
    numero          int  not null,
    master_chave    text,
    proxy_chave     text,
    hls_prefixo     text,
    capa_chave      text,
    tira_chave      text,
    onda_chave      text,
    fps_num         int,
    fps_den         int,
    duracao_quadros int,
    tc_inicial      text,
    largura         int,
    altura          int,
    bytes           bigint,
    marca_dagua     boolean not null default true,
    enviado_por     text,
    notas           text,
    criado_em       timestamptz not null default now(),
    unique (peca_id, numero)
);

-- Bloco: um pedaço da página de um projeto, em rascunho. O tipo é fixo; o
-- conteúdo de cada tipo mora em `dados`, e imagem entra como peca_id.
create table ap_blocos (
    id         uuid primary key default gen_random_uuid(),
    projeto_id uuid not null references ap_projetos(id) on delete cascade,
    tipo       text not null check (tipo in ('capa','texto','logo','paleta','tipografia',
                                             'aplicacoes','imagem','antes_depois','fechamento')),
    ordem      int   not null default 0,
    dados      jsonb not null default '{}',
    criado_em  timestamptz not null default now(),
    editado_em timestamptz
);

-- Publicação: a página congelada no instante em que foi para o cliente.
create table ap_publicacoes (
    id            uuid primary key default gen_random_uuid(),
    projeto_id    uuid not null references ap_projetos(id) on delete cascade,
    numero        int   not null,
    blocos        jsonb not null,
    visual        jsonb,
    publicado_por text,
    criado_em     timestamptz not null default now(),
    unique (projeto_id, numero)
);

-- Comentário: uma entrada do fio. O estado NÃO é coluna — é a última entrada.
-- `origem`, `tipo`, `texto` e `autor` têm os mesmos nomes e valores de
-- vz_retornos, no Chronos: é o que deixa a regra de estado ser copiada.
-- Fala de uma versão de arquivo OU de uma publicação da página, nunca dos dois.
create table ap_comentarios (
    id            uuid primary key default gen_random_uuid(),
    versao_id     uuid references ap_versoes(id) on delete cascade,
    publicacao_id uuid references ap_publicacoes(id) on delete cascade,
    check ((versao_id is null) <> (publicacao_id is null)),
    pai_id     uuid references ap_comentarios(id) on delete cascade,
    origem     text not null check (origem in ('cliente','equipe')),
    tipo       text not null default 'ajuste'
               check (tipo in ('ajuste','ajustado','resposta','aprovado')),
    autor      text not null,
    interno    boolean not null default false,
    quadro     int,
    quadro_fim int,
    -- Pode ser vazio: o "ficou bom" (`aprovado`) não precisa de texto.
    texto      text,
    anotacao   jsonb,
    herdado_de uuid references ap_comentarios(id) on delete set null,
    criado_em  timestamptz not null default now(),
    editado_em timestamptz
);
```

A anotação fica em `jsonb` dentro do comentário, e não em tabela própria: ela
nunca é consultada sozinha, nunca é somada e não existe sem o comentário. Uma
tabela a mais só acrescentaria um `join` em toda leitura.

```sql
-- Link avulso. O link do cliente usa o token de vz_clientes e não passa aqui.
create table ap_links (
    id               uuid primary key default gen_random_uuid(),
    projeto_id       uuid not null references ap_projetos(id) on delete cascade,
    token            text not null unique,
    apelido          text unique,
    titulo           text,
    senha_hash       text,
    expira_em        timestamptz,
    revogado_em      timestamptz,
    permite_download boolean not null default false,
    permite_comentar boolean not null default true,
    exige_email      boolean not null default false,
    visual           jsonb,
    criado_em        timestamptz not null default now()
);

create table ap_etapas (
    id         uuid primary key default gen_random_uuid(),
    projeto_id uuid not null references ap_projetos(id) on delete cascade,
    ordem      int not null,
    nome       text not null,
    email      text,
    unique (projeto_id, ordem)
);

-- Aprovação: prova, com retrato do que foi aprovado — uma versão de arquivo
-- ou uma publicação da página, nunca os dois.
create table ap_aprovacoes (
    id            uuid primary key default gen_random_uuid(),
    versao_id     uuid references ap_versoes(id) on delete restrict,
    publicacao_id uuid references ap_publicacoes(id) on delete restrict,
    check ((versao_id is null) <> (publicacao_id is null)),
    etapa_id   uuid references ap_etapas(id) on delete set null,
    decisao    text not null check (decisao in ('aprovado','ajuste')),
    quem_nome  text not null,
    quem_email text,
    ip_hash    text,
    retrato    jsonb not null,
    criado_em  timestamptz not null default now()
);

create table ap_visitas (
    id         uuid primary key default gen_random_uuid(),
    link_id    uuid references ap_links(id) on delete cascade,
    cliente_id text references vz_clientes(id) on delete cascade,
    versao_id  uuid references ap_versoes(id) on delete cascade,
    sessao     text not null,
    email      text,
    quadro_max int,
    segundos   int,
    criado_em  timestamptz not null default now()
);

create table ap_downloads (
    id        uuid primary key default gen_random_uuid(),
    versao_id uuid references ap_versoes(id) on delete set null,
    peca_id   uuid references ap_pecas(id) on delete set null,
    quem      text,
    bytes     bigint,
    criado_em timestamptz not null default now()
);

-- Seleção de fotos: o que o cliente escolheu. Vale mais que o download.
create table ap_selecoes (
    id        uuid primary key default gen_random_uuid(),
    peca_id   uuid not null references ap_pecas(id) on delete cascade,
    sessao    text not null,
    nota      text,
    criado_em timestamptz not null default now(),
    unique (peca_id, sessao)
);

-- Autorização de uso de imagem. Sem linha aqui, a peça não entra em link.
-- `motivo` diz por que ela pode entrar: um termo assinado, ou a equipe ter
-- marcado que não há pessoa identificável na imagem (mockup, logo).
create table ap_consentimentos (
    peca_id         uuid primary key references ap_pecas(id) on delete cascade,
    motivo          text not null default 'termo' check (motivo in ('termo','sem_pessoa')),
    autorizado      boolean not null default false,
    registrado_por  text,
    documento_chave text,
    validade        date,
    escopo          text[] not null default '{}',
    observacao      text,
    registrado_em   timestamptz not null default now()
);

create table ap_atividade (
    id         uuid primary key default gen_random_uuid(),
    projeto_id uuid not null references ap_projetos(id) on delete cascade,
    tipo       text not null,
    ator       text,
    dados      jsonb,
    criado_em  timestamptz not null default now()
);
```

`ap_aprovacoes.versao_id` e `publicacao_id` são `on delete restrict` de
propósito: apagar uma versão ou uma publicação já aprovada apagaria a prova de
que ela foi aprovada. O sistema recusa e manda arquivar.

### Migrações

`schema.sql` roda uma vez e cria só tabelas `ap_`. Depois dele, na ordem:

| Arquivo | O que acrescenta |
|---|---|
| `migracao-etapas.sql` | aprovação em mais de um passo |
| `migracao-consentimento.sql` | autorização de uso de imagem |
| `migracao-metricas.sql` | visitas e downloads |
| `migracao-selecao.sql` | lista de fotos escolhidas |
| `migracao-formatos.sql` | formato do projeto, blocos e publicações da página |

---

## Estrutura

```
Sistema/
  index.html          entrada única; carrega tokens antes de tudo
  app.js              roteador SPA — casa padrão, e não alcança /e/ nem /l/
  store.js            escolhe o adaptador e expõe as coleções
  theme.js            claro/escuro (mesma chave do Forms: 5k9_theme)
  db/
    schema.sql        rodar uma vez, no projeto Supabase do Forms
    local.js          adaptador localStorage (sem mídia real)
    remoto.js         adaptador Supabase (mapa de tabelas ap_)
  lib/
    timecode.js       quadro ↔ segundo ↔ timecode, drop-frame incluso
    player.js         o motor do player, requestVideoFrameCallback
    anotar.js         desenho sobre o quadro, em coordenadas normalizadas
    conversa.js       os três estados — regra de estado GÊMEA da do Chronos
    versoes.js        pilha, comparação, herança de fio
    enviar.js         upload em partes com retomada, direto ao R2
    exportar.js       CSV e EDL de marcadores
    ligacao.js        URL assinada, bilhete de download
    gestor.js         ponte de leitura com o 5K9 Gestor (cartela)
    blocos.js         o catálogo de blocos: campos, validação e desenho de cada tipo
    formato.js  rotas.js  ui.js
  components/
    topnav.js  pageshell.js  drawer.js  campos.js  menu.js  toast.js  trocador.js
  pages/
    apollo.css        vocabulário .ap- compartilhado
    painel.js  projeto.js  peca.js  galeria.js  links.js  enviar.js
    configuracoes.js  login.js
    pagina.js         a organização da página: formato, blocos, prévia, publicar
    entrega.js        a tela pública — mobile-first, cabeçalho próprio
    apresentacao.js   a apresentação pública, desenhada pelo lib/blocos.js
  ds/                 design system entregue pelo estúdio — não editar
  tokens.css          camada base (dark-first)
  tokens-bridge.css   traduz os nomes semânticos para os tokens da marca

ferramentas/
  preparar.js         master → proxy, capa, tira, onda, ficha (ffmpeg)
  marcadores.jsx      ExtendScript: CSV de comentários → marcadores no Premiere

worker/
  index.js            assina URL, monta ZIP, valida bilhete (Cloudflare)
```

Nenhum componente novo usa cor literal: tudo é `var(--token)`.

---

## Decisões que valem saber

**Quadro é inteiro; segundo é derivado.** Todo comentário, toda duração e todo
salto do player falam em quadros. Segundo só aparece na hora de mostrar. É a
mesma disciplina do "dinheiro em centavos" do Gestor, e pelo mesmo motivo: o
erro de ponto flutuante que ninguém acha é o que faz todo mundo desconfiar do
sistema inteiro.

**O comentário pertence à versão.** Não à peça. Ele fala de um corte que existiu
num dia, e um pedido de ajuste sobre a V1 não pode parecer crítica à V3.

**O estado do fio não é coluna.** Ele é a última entrada visível ao cliente,
derivado pela mesma função nos dois lados da tela — regra herdada do Chronos,
com o mesmo vocabulário gravado no banco para que a função venha junto.

**A tela do cliente nasce pequena.** CSS em `min-width`, o contrário do resto do
estúdio. As outras telas são de trabalho, e trabalho acontece na mesa; esta abre
no celular, vindo de um link do WhatsApp.

**A tela do cliente não parece um sistema.** Sem topnav, sem trocador de
ferramenta, sem link para o painel. Nada ali sugere que existe um sistema atrás
para explorar — porque não existe, para ele.

**O construtor de página é um tema com marca, não um editor livre.** "Painel
completo para personalizar tudo" é um produto inteiro, maior que a revisão e a
galeria somadas, e o resultado costuma ser página que foge da identidade da 5K9
— o oposto do que o estúdio vende. O que existe: formatos fixos, cada um com os
seus blocos (ver [Formatos de página](#formatos-de-página)), mais cor de
destaque, capa e a ordem dos blocos. O padrão
já está implementado no Forms, em
[`config_visual`](../../Forms/5K9%20Forms/Sistema/db/migracao-config-visual.sql),
inclusive o cartão que o WhatsApp monta quando o link é colado — que é o detalhe
que faz a entrega parecer profissional antes de alguém clicar.

**O master não é o que o cliente vê.** Ele existe para o arquivo e para o
download autorizado. O que toca na tela é sempre o proxy, sempre com marca.

**Aprovar não apaga o pedido.** A conversa continua legível depois do aprovado,
como registro do que foi combinado — mesma regra do "gravado" no Chronos.

**Nada é gerado por modelo de linguagem.** Regra da casa, herdada do Forms e do
Chronos. Nem resumo de comentário, nem transcrição inventada.

---

## O que não vamos fazer

Não por preguiça — cada um destes é um projeto do tamanho deste documento, e
nenhum é o gargalo de vocês hoje.

| | Por quê |
|---|---|
| Painel dentro do Premiere/After Effects | plugin UXP é outro produto; o ExtendScript de marcadores entrega a maior parte do valor |
| Camera to Cloud | depende de hardware certificado e acordo com fabricante; não é replicável de fora |
| App de desktop para transferência | o upload em partes no navegador resolve, e não pede instalação |
| Apps iOS/Android | a página web mobile-first cobre o caso real: link do WhatsApp |
| Tocar ProRes/RAW no navegador | não existe; é por isso que o proxy é obrigatório |
| Marca d'água forense | matemática de rastreamento de vazamento de cinema; não é o medo de vocês |
| SSO/SAML, automações genéricas, Jira/Asana | funcionalidade de empresa grande vendendo para empresa grande |
| Presença ao vivo (ver o cursor do outro) | bonito na demonstração; ninguém revisa junto ao mesmo tempo |

---

## Ordem de construção

Cada etapa termina com algo que dá para mandar para um cliente de verdade.

**1 — Fotos.** Envio, marca d'água queimada, tela cheia, seleção, ZIP no Worker,
consentimento. Valida o R2, o Worker e a página pública sem depender de player
nenhum. É a menor distância entre zero e uma entrega real.

**1b — Apresentação.** O formato de apresentação, a organização da página, a
publicação com versão e a aprovação presa a ela. Não depende de player nem de
Worker: dá para construir no modo local logo depois do Teste 0, e ela entra no
Teste 1 junto com as fotos.

**2 — Revisão de vídeo.** `preparar.js`, o player com quadro exato, comentário
no quadro e no intervalo, anotação, o fio com os três estados, e a exportação
para a timeline. É o coração.

**3 — Versões e aprovação.** Pilha, comparação A/B, herança de fio, aprovação
com retrato, etapas, e o e-mail do Gestor ligado.

**4 — Links e métrica.** Validade, senha, revogação, download por bilhete, quem
abriu e quanto assistiu.

**5 — A página do cliente.** O tema com marca, e a fusão do cabeçalho público
com o do Chronos: um link, três seções, um estúdio.
