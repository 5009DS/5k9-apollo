import { store } from '../store.js';
import { esc, dataBR, haQuanto, paraIso } from '../lib/formato.js';
import { vazioHTML } from '../lib/pecas.js';
import { conversas, ato, daEquipe, estadoMeta } from '../lib/conversa.js';
import {
    desenharBlocos, pintarMidia, ligarBlocos, variaveisDeVisual, contraste, hexValido, ehTelas, ESTILOS_BLOCOS,
} from '../lib/blocos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   APRESENTAÇÃO — /e/:token/p/:projeto, e a prévia da equipe.

   A identidade visual do cliente como site, não como PDF (README, "Formatos
   de página"). A moldura é da 5K9 — topo, ritmo, rodapé assinado —, e o
   miolo são os blocos do lib/blocos.js com a marca dele dentro.

   ── A MESMA TELA, DOIS USOS ───────────────────────────────────────────────
   O cliente vê a última PUBLICAÇÃO. A equipe, na organização da página, vê o
   RASCUNHO desenhado por esta mesma função, dentro de um iframe — e o iframe
   não é capricho: só nele a prévia de celular tem largura de celular de
   verdade, e as regras min-width da página respondem como no aparelho.

   ── O QUE O CLIENTE FAZ AQUI ──────────────────────────────────────────────
   Aprova a versão ou pede ajuste. As duas coisas exigem nome — a aprovação
   é prova, e prova sem autor não prova nada. Quem recusa uma versão velha,
   um "aprovo" repetido ou um ajuste depois do aprovado é o banco
   (db/local.js); a tela só mostra a recusa.
   ═══════════════════════════════════════════════════════════════════════════ */

const CHAVE_NOME = '5k9_apollo_nome';
const lembrarNome = () => { try { return localStorage.getItem(CHAVE_NOME) || ''; } catch { return ''; } };
const guardarNome = (n) => { try { localStorage.setItem(CHAVE_NOME, n); } catch { /* sem armazenamento */ } };

export const renderApresentacao = async (container, token, projetoId) => {
    injectStyles();
    container.innerHTML = `<div class="apr-carregando">Carregando…</div>`;

    let visao;
    try {
        visao = await store.apresentacao(token, projetoId);
    } catch (e) {
        console.error('[apresentacao] falha ao carregar:', e);
        return aviso(container, 'wifi-off', 'Não conseguimos carregar agora',
            'Verifique a conexão e tente de novo. Se continuar, avise a equipe.');
    }
    if (!visao) {
        return aviso(container, 'link-2-off', 'Esta apresentação não está disponível',
            'Ela pode ter sido substituída por uma versão nova. Peça o link atualizado para a equipe da 5K9.');
    }
    desenhar(container, visao, { token });
};

/**
 * A prévia do rascunho, para o iframe da organização da página.
 *
 * Fala com a página de fora por postMessage, e só com a MESMA origem:
 *   { tipo: 'apollo:redesenhar' }      relê o rascunho e redesenha no lugar
 *   { tipo: 'apollo:ir', bloco: id }   rola até o bloco escolhido no editor
 */
export const renderPrevia = async (container, projetoId) => {
    injectStyles();
    const carregar = async () => {
        const visao = await store.previa(projetoId);
        if (!visao) return aviso(container, 'folder-x', 'Projeto não encontrado', '');
        const y = window.scrollY;
        desenhar(container, visao, {});
        window.scrollTo(0, y);
    };
    await carregar();

    window.addEventListener('message', async (e) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.tipo === 'apollo:redesenhar') await carregar();
        if (e.data?.tipo === 'apollo:ir') {
            container.querySelector(`[data-bloco="${CSS.escape(e.data.bloco)}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
};

// ═══════════════════════════════════════════════════════════════════════════

const desenhar = (container, visao, { token }) => {
    const primeiro = visao.blocos?.[0];
    const comCapa = primeiro?.tipo === 'capa';
    /* O topo flutua sobre a capa e precisa ler nela: logo branco sobre foto,
       e sobre a cor de destaque o que o contraste dela pedir. */
    const capaComFoto = comCapa && primeiro.dados?.imagem && !primeiro.dados.imagem.bloqueada
                     && !primeiro.dados.imagem.faltando;
    const destaque = hexValido(visao.visual?.destaque) ? visao.visual.destaque : null;
    const topoClaro = comCapa && (capaComFoto || !destaque || contraste(destaque) === 'var(--paper)');
    // Sequência de telas: sem topo, uma tela por vez (ver blocos.js, ehTelas).
    const telas = ehTelas(visao.blocos);

    container.innerHTML = `
        <div class="apr ${comCapa ? 'apr--com-capa' : ''} ${comCapa ? (topoClaro ? 'apr--topo-claro' : 'apr--topo-escuro') : ''} ${telas ? 'apr--telas' : ''}"
             style="${variaveisDeVisual(visao.visual)}">
            ${telas ? '' : `
            <header class="apr-topo">
                <img class="apr-topo__logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                     alt="5K9 Studio" width="816" height="185">
            </header>`}

            ${visao.previa ? `<div class="apr-faixa-previa">Prévia do rascunho — versão ${visao.publicacao.numero} quando publicar</div>` : ''}

            <main>${desenharBlocos(visao)}</main>

            <footer class="apr-rodape">
                <div class="apr-largura apr-rodape__grade">
                    <img class="apr-rodape__logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                         alt="5K9 Studio" width="816" height="185">
                    <span>${esc(visao.projeto.nome)} · versão ${visao.publicacao.numero}${visao.publicacao.criado_em
                        ? ` · publicada em ${dataBR(paraIso(new Date(visao.publicacao.criado_em)))}` : ''}</span>
                </div>
            </footer>
        </div>`;

    pintarMidia(container);
    ligarBlocos(container);
    preencherDecisao(container, visao, token);

    if (window.lucide) lucide.createIcons();
};

// ── A decisão do cliente ──────────────────────────────────────────────────

const preencherDecisao = (container, visao, token) => {
    const alvo = container.querySelector('[data-decisao]');
    if (!alvo) return;

    const { fios } = conversas(visao.comentarios);
    const fiosHTML = fios.length ? `
        <div class="apr-fios">
            ${fios.map(f => `
                <article class="apr-fio">
                    <span class="apr-fio__estado apr-fio__estado--${f.estado}">${esc(estadoMeta(f.estado).cliente)}</span>
                    ${f.entradas.map(e => `
                        <div class="apr-fio__entrada ${daEquipe(e) ? 'is-equipe' : ''}">
                            <b>${daEquipe(e) ? esc(ato(e).rotulo) : `${esc(e.autor || 'Você')} pediu`}</b>
                            <small>${haQuanto(e.criado_em)}</small>
                            ${e.texto ? `<p>${esc(e.texto)}</p>` : ''}
                        </div>`).join('')}
                </article>`).join('')}
        </div>` : '';

    if (visao.aprovacao) {
        alvo.innerHTML = `
            <div class="apr-aprovada">
                <span class="apr-aprovada__selo"><i data-lucide="circle-check"></i></span>
                <div>
                    <b>Aprovada por ${esc(visao.aprovacao.quem_nome)}</b>
                    <small>${dataBR(paraIso(new Date(visao.aprovacao.criado_em)))} · versão ${visao.publicacao.numero}</small>
                </div>
            </div>
            ${fiosHTML}`;
        return;
    }

    const travado = visao.previa;
    alvo.innerHTML = `
        ${fiosHTML}
        <div class="apr-acoes" id="apr-acoes">
            <button class="apr-botao apr-botao--principal" data-abrir="aprovar" ${travado ? 'disabled' : ''}>
                <i data-lucide="check"></i> Aprovar esta versão</button>
            <button class="apr-botao" data-abrir="ajuste" ${travado ? 'disabled' : ''}>
                <i data-lucide="message-circle"></i> Pedir ajuste</button>
        </div>
        ${travado ? '<p class="apr-nota">Na prévia os botões não gravam nada.</p>' : ''}
        <form class="apr-form" id="apr-form" hidden novalidate></form>`;
    if (travado) return;

    const form = alvo.querySelector('#apr-form');
    const acoes = alvo.querySelector('#apr-acoes');

    const abrir = (modo) => {
        acoes.hidden = true;
        form.hidden = false;
        form.innerHTML = `
            <label class="apr-campo">
                <span>Seu nome</span>
                <input name="nome" type="text" autocomplete="name" value="${esc(lembrarNome())}" required>
            </label>
            ${modo === 'ajuste' ? `
                <label class="apr-campo">
                    <span>O que você quer que mude?</span>
                    <textarea name="texto" rows="4" required></textarea>
                </label>` : `
                <p class="apr-nota">Fica registrado que você aprovou a versão ${visao.publicacao.numero}
                    desta apresentação, com data e hora.</p>`}
            <p class="apr-erro" id="apr-erro" hidden></p>
            <div class="apr-acoes">
                <button class="apr-botao apr-botao--principal" type="submit">
                    ${modo === 'ajuste' ? 'Enviar pedido' : 'Confirmar aprovação'}</button>
                <button class="apr-botao" type="button" data-cancelar>Cancelar</button>
            </div>`;
        form.querySelector(modo === 'ajuste' ? 'textarea' : 'input')?.focus();

        form.querySelector('[data-cancelar]').addEventListener('click', () => {
            form.hidden = true;
            acoes.hidden = false;
        });

        form.onsubmit = async (e) => {
            e.preventDefault();
            const botao = form.querySelector('[type=submit]');
            const erro = form.querySelector('#apr-erro');
            const nome = form.nome.value.trim();
            botao.disabled = true;
            erro.hidden = true;
            try {
                if (modo === 'ajuste') {
                    await store.pedirAjuste(token, visao.projeto.id, visao.publicacao.numero, nome, form.texto.value,
                                            { nuvem: visao.nuvem });
                } else {
                    await store.aprovarPublicacao(token, visao.projeto.id, visao.publicacao.numero, nome,
                                                  { nuvem: visao.nuvem });
                }
                guardarNome(nome);
                const nova = await store.apresentacao(token, visao.projeto.id);
                if (nova) {
                    desenhar(container, nova, { token });
                    container.querySelector('[data-decisao]')?.scrollIntoView({ block: 'center' });
                }
            } catch (falha) {
                erro.textContent = falha.message || 'Não foi possível enviar. Tente de novo.';
                erro.hidden = false;
                botao.disabled = false;
            }
        };
    };

    alvo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.abrir)));
};

const aviso = (container, icone, titulo, texto) => {
    container.innerHTML = `
        <div class="apr apr--aviso">
            <div class="apr-aviso">
                <img class="apr-topo__logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                     alt="5K9 Studio" width="816" height="185">
                ${vazioHTML(icone, titulo, texto)}
            </div>
        </div>`;
    if (window.lucide) lucide.createIcons();
};

// ═══════════════════════════════════════════════════════════════════════════
function injectStyles() {
    if (document.getElementById('apresentacao-styles')) return;
    const style = document.createElement('style');
    style.id = 'apresentacao-styles';
    style.textContent = ESTILOS_BLOCOS + `
        .apr {
            flex: 1; min-width: 0; min-height: 100vh; position: relative;
            display: flex; flex-direction: column;
            background: var(--surface-base); color: var(--text-primary);
            font-family: var(--font-sans);
        }
        .apr main { flex: 1; }
        .apr-carregando {
            flex: 1; display: flex; align-items: center; justify-content: center; min-height: 100vh;
            font-family: var(--font-sans); color: var(--text-tertiary); font-size: var(--text-sm);
        }

        /* ── Topo ─────────────────────────────────────────────────────── */
        .apr-topo {
            display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
            padding: max(var(--space-5), env(safe-area-inset-top)) var(--space-5) var(--space-5);
            color: var(--text-primary);
        }
        .apr--com-capa .apr-topo { position: absolute; top: 0; left: 0; right: 0; z-index: 5; }
        .apr--topo-claro .apr-topo { color: var(--paper); }
        .apr--topo-escuro .apr-topo { color: var(--ink); }
        .apr-topo__logo { height: 20px; width: auto; display: block; }
        html[data-theme="light"] .apr:not(.apr--topo-claro) .apr-topo__logo,
        .apr--topo-escuro .apr-topo__logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }
        .apr--topo-claro .apr-topo__logo { content: url("/assets/logo/5k9-lockup-horizontal-white.png"); }

        .apr-faixa-previa {
            position: sticky; top: 0; z-index: 6;
            padding: var(--space-2) var(--space-4); text-align: center;
            background: var(--warning-muted); color: var(--warning);
            font-size: var(--text-xs); font-weight: 600;
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
        }

        /* ── Rodapé: a assinatura ─────────────────────────────────────── */
        .apr-rodape { padding: var(--space-10) 0 max(var(--space-10), env(safe-area-inset-bottom));
                      border-top: 1px solid var(--border-subtle); }
        .apr-rodape__grade { display: flex; flex-direction: column; gap: var(--space-3);
                             font-size: var(--text-xs); color: var(--text-tertiary); }
        /* Regra do DS: lockup pela ALTURA, largura em auto e sem stretch —
           numa coluna flex o padrão esticava a marca até a largura toda. */
        .apr-rodape__logo { height: 16px; width: auto; display: block; align-self: flex-start; }
        html[data-theme="light"] .apr-rodape__logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }

        /* ── Decisão ──────────────────────────────────────────────────── */
        .apr-acoes { display: flex; gap: var(--space-3); flex-wrap: wrap; }
        .apr-acoes[hidden], .apr-form[hidden] { display: none; }
        .apr-botao {
            display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
            height: 52px; padding: 0 var(--space-6); flex: 1 1 200px;
            border-radius: var(--radius-pill); border: 1px solid var(--border-strong);
            background: transparent; color: var(--text-primary);
            font-family: var(--font-sans); font-size: var(--text-body); font-weight: 600; cursor: pointer;
        }
        .apr-botao svg { width: 18px; height: 18px; }
        .apr-botao--principal { background: var(--apr-destaque); border-color: var(--apr-destaque); color: var(--apr-sobre-destaque); }
        .apr-botao:disabled { opacity: 0.45; cursor: not-allowed; }
        .apr-nota { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-tertiary); }

        .apr-form { display: flex; flex-direction: column; gap: var(--space-4); }
        .apr-campo { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); }
        .apr-campo input, .apr-campo textarea {
            width: 100%; padding: var(--space-3) var(--space-4);
            border: 1px solid var(--border-default); border-radius: var(--radius-md);
            background: var(--surface-2); color: var(--text-primary);
            font-family: var(--font-sans); font-size: 16px; line-height: 1.5;
        }
        .apr-campo input:focus, .apr-campo textarea:focus { outline: none; border-color: var(--apr-destaque); }
        .apr-erro { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
                    background: var(--danger-muted); color: var(--danger); font-size: var(--text-sm); }
        .apr-erro[hidden] { display: none; }

        .apr-aprovada {
            display: flex; align-items: center; gap: var(--space-4);
            padding: var(--space-5); border-radius: var(--radius-lg);
            background: var(--success-muted); color: var(--text-primary);
        }
        .apr-aprovada b { display: block; font-size: var(--text-body); }
        .apr-aprovada small { font-size: var(--text-sm); color: var(--text-secondary); }
        .apr-aprovada__selo { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
                              display: flex; align-items: center; justify-content: center;
                              background: var(--success); color: var(--accent-contrast); }
        .apr-aprovada__selo svg { width: 22px; height: 22px; }

        .apr-fios { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-5); }
        .apr-fio { padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface-2);
                   display: flex; flex-direction: column; gap: var(--space-3); }
        .apr-fio__estado { align-self: flex-start; padding: 2px 10px; border-radius: var(--radius-pill);
                           font-size: var(--text-xs); font-weight: 600; background: var(--surface-3); color: var(--text-secondary); }
        .apr-fio__estado--pendente { background: var(--warning-muted); color: var(--warning); }
        .apr-fio__estado--respondido { background: var(--info-muted); color: var(--info); }
        .apr-fio__estado--fechado { background: var(--success-muted); color: var(--success); }
        .apr-fio__entrada b { font-size: var(--text-sm); }
        .apr-fio__entrada small { margin-left: var(--space-2); font-size: var(--text-xs); color: var(--text-tertiary); }
        .apr-fio__entrada p { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
        .apr-fio__entrada.is-equipe { padding-left: var(--space-3); border-left: 2px solid var(--apr-destaque); }

        .apr--aviso { align-items: center; justify-content: center; padding: var(--space-6) var(--space-4); }
        .apr-aviso { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }

        /* ── Modo telas ───────────────────────────────────────────────────
           Uma tela por vez, cada uma do tamanho da janela. A trava é o
           scroll-snap no documento: a rolagem sempre para numa tela inteira,
           e scroll-snap-stop impede um gesto forte de pular várias. :has()
           em vez de classe no <html>: sair desta página não deixa a trava
           ligada na próxima. */
        html:has(.apr--telas) { scroll-snap-type: y mandatory; }
        .apr--telas .apr-bloco { scroll-snap-align: center; scroll-snap-stop: always; }
        .apr--telas .apr-bloco:empty { display: none; }
        .apr--telas .apr-rodape { scroll-snap-align: end; }
        .apr--telas .apr-faixa-previa { position: fixed; left: 0; right: 0; }
        .apr--telas .apr-imagem--slide,
        .apr--telas .apr-bloco:first-child .apr-imagem--slide {
            height: 100svh; padding: 0; display: flex; align-items: center; justify-content: center;
        }
        .apr--telas .apr-imagem--slide figure { max-width: none; width: 100%; }
        .apr--telas .apr-imagem--slide :is(img, video) { max-height: 100svh; border-radius: 0; }
        /* De pé, uma tela 16:9 do tamanho da janela seria uma faixa no meio
           do vazio. As telas ficam na largura do celular, uma embaixo da
           outra — e a trava continua parando em cada uma, pelo topo: pelo
           centro, as primeiras nunca chegariam ao meio da tela. */
        @media (orientation: portrait) {
            .apr--telas .apr-bloco { scroll-snap-align: start; }
            .apr--telas .apr-imagem--slide,
            .apr--telas .apr-bloco:first-child .apr-imagem--slide { height: auto; padding: 2px 0; }
        }

        @media (min-width: 720px) {
            .apr-topo { padding-left: var(--space-8); padding-right: var(--space-8); }
            .apr-rodape__grade { flex-direction: row; align-items: center; justify-content: space-between; }
        }
    `;
    document.head.appendChild(style);
}
