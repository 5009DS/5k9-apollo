-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 APOLLO — PUBLICAÇÃO NA NUVEM (o atalho antes do Teste 1)
--
-- Rodar UMA vez no SQL Editor do projeto Supabase do 5K9 Forms — o mesmo do
-- Chronos (lib/supabase-config.js). Só cria o que tem prefixo `ap_` e o
-- bucket `apollo`; não encosta em nada do Forms nem do Chronos. Pode rodar de
-- novo sem estragar nada.
--
-- ── O QUE ISTO É ───────────────────────────────────────────────────────────
-- O Apollo continua montando tudo no navegador da equipe (modo local). O que
-- sobe é só o que o CLIENTE precisa ver: a versão publicada, congelada, e os
-- arquivos dela. Assim o link abre em qualquer aparelho.
--
-- Não é o desenho final do README (tabelas ap_ completas, mídia no R2 com
-- Worker). É o recorte que faz o link funcionar hoje, e ele foi feito para
-- ser jogado fora quando o Teste 1 entrar: nada aqui é lido pelo painel da
-- equipe além dos retornos do cliente.
--
-- ── QUEM VÊ O QUÊ ──────────────────────────────────────────────────────────
-- Mesma regra do Chronos (db/schema.sql de lá): o anônimo não lê tabela
-- nenhuma. Ele só CHAMA duas funções `security definer`, que recebem o link e
-- devolvem aquela apresentação e nada além dela:
--
--     ap_apresentacao(p_cliente, p_projeto)          → a última versão publicada
--     ap_registrar_retorno(p_cliente, p_projeto, …)  → aprova ou pede ajuste
--
-- A equipe (logada com o login do Forms) grava as versões e responde.
--
-- O bucket `apollo` é público para LEITURA por endereço exato — é assim que a
-- imagem chega ao <img> do cliente sem login. Listar o bucket não é permitido,
-- e só sobe arquivo com autorização de imagem: o Apollo nem envia o que está
-- bloqueado. Os caminhos têm o id da peça (uuid), não o nome do cliente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── As versões publicadas ──────────────────────────────────────────────────
-- `visao` é a apresentação pronta, na forma que a tela do cliente desenha —
-- blocos com as imagens já resolvidas. Congelada: publicar de novo cria outra
-- linha, e a aprovação fica presa ao número que o cliente viu.
create table if not exists ap_publicadas (
    id              text primary key default gen_random_uuid()::text,
    projeto_id      text not null,
    numero          int  not null,
    cliente_token   text not null,
    -- Os apelidos do link personalizado. Mudar o apelido no Apollo atualiza
    -- estas colunas em todas as versões daquele cliente e projeto.
    cliente_apelido text,
    projeto_apelido text,
    visao           jsonb not null,
    publicado_por   uuid default auth.uid(),
    criado_em       timestamptz not null default now(),
    unique (projeto_id, numero)
);
create index if not exists ap_publicadas_cliente_token   on ap_publicadas (cliente_token);
create index if not exists ap_publicadas_cliente_apelido on ap_publicadas (cliente_apelido);

-- ── O que o cliente e a equipe disseram ────────────────────────────────────
-- Aprovação, pedido de ajuste e as respostas da equipe, num fio só — o mesmo
-- formato dos comentários do Apollo (lib/conversa.js), para a equipe puxar
-- para o painel sem tradução.
create table if not exists ap_retornos (
    id         text primary key default gen_random_uuid()::text,
    projeto_id text not null,
    numero     int  not null,
    pai_id     text,
    origem     text not null check (origem in ('cliente', 'equipe')),
    tipo       text not null,
    autor      text,
    texto      text check (char_length(texto) <= 4000),
    criado_em  timestamptz not null default now()
);
create index if not exists ap_retornos_projeto on ap_retornos (projeto_id, numero);

alter table ap_publicadas enable row level security;
alter table ap_retornos   enable row level security;

drop policy if exists "ap_publicadas: somente autenticado" on ap_publicadas;
drop policy if exists "ap_retornos: somente autenticado"   on ap_retornos;
create policy "ap_publicadas: somente autenticado" on ap_publicadas
    for all to authenticated using (true) with check (true);
create policy "ap_retornos: somente autenticado" on ap_retornos
    for all to authenticated using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- A PORTA DO CLIENTE
--
-- `set search_path = public` é obrigatório em função definer — sem ele, quem
-- cria um schema no caminho de busca planta uma tabela falsa e a função lê
-- dela com privilégio elevado (mesma nota do Chronos).
-- ═══════════════════════════════════════════════════════════════════════════

-- A última versão publicada daquele link: cliente por token ou apelido,
-- projeto por id ou apelido. Junto, a aprovação dela e o fio visível.
create or replace function ap_apresentacao(p_cliente text, p_projeto text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    with p as (
        select * from ap_publicadas
         where (cliente_token = p_cliente or cliente_apelido = p_cliente)
           and (projeto_id = p_projeto or projeto_apelido = p_projeto)
         order by numero desc
         limit 1
    ), r as (
        select ap_retornos.* from ap_retornos join p using (projeto_id, numero)
    )
    select case when not exists (select 1 from p) then null else
        (select visao from p) || jsonb_build_object(
            'nuvem', true,
            'aprovacao', (
                select jsonb_build_object('quem_nome', autor, 'criado_em', criado_em)
                  from r where tipo = 'aprovacao' order by criado_em limit 1),
            'comentarios', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', id, 'pai_id', pai_id, 'origem', origem, 'tipo', tipo,
                           'autor', autor, 'texto', texto, 'criado_em', criado_em)
                       order by criado_em)
                  from r where tipo <> 'aprovacao'), '[]'::jsonb)
        )
    end;
$$;

-- O "aprovo" e o pedido de ajuste. As recusas são as mesmas do modo local
-- (db/local.js): versão velha, já aprovada, sem nome, ajuste sem texto.
create or replace function ap_registrar_retorno(
    p_cliente text, p_projeto text, p_numero int, p_tipo text, p_nome text, p_texto text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v     ap_publicadas;
    nome  text := nullif(trim(coalesce(p_nome, '')), '');
    texto text := nullif(trim(coalesce(p_texto, '')), '');
    nova  ap_retornos;
begin
    select * into v from ap_publicadas
     where (cliente_token = p_cliente or cliente_apelido = p_cliente)
       and (projeto_id = p_projeto or projeto_apelido = p_projeto)
     order by numero desc
     limit 1;
    if not found then
        raise exception 'Este link não está mais disponível.';
    end if;
    if v.numero <> p_numero then
        raise exception 'A equipe publicou uma versão mais nova desta apresentação. Recarregue a página para ver.';
    end if;
    if p_tipo not in ('aprovacao', 'ajuste') then
        raise exception 'Pedido inválido.';
    end if;
    if nome is null then
        raise exception '%', case when p_tipo = 'aprovacao'
            then 'Escreva seu nome para registrar a aprovação.'
            else 'Escreva seu nome para a equipe saber quem pediu.' end;
    end if;
    if p_tipo = 'ajuste' and texto is null then
        raise exception 'Escreva o que você quer que mude.';
    end if;
    if exists (select 1 from ap_retornos
                where projeto_id = v.projeto_id and numero = v.numero and tipo = 'aprovacao') then
        raise exception '%', case when p_tipo = 'aprovacao'
            then 'Esta versão já foi aprovada.'
            else 'Esta versão já foi aprovada — ela não muda mais. Fale com a equipe se precisar de algo.' end;
    end if;

    insert into ap_retornos (projeto_id, numero, origem, tipo, autor, texto)
    values (v.projeto_id, v.numero, 'cliente', p_tipo, left(nome, 120), left(texto, 4000))
    returning * into nova;
    return to_jsonb(nova);
end;
$$;

revoke all on function ap_apresentacao(text, text) from public;
revoke all on function ap_registrar_retorno(text, text, int, text, text, text) from public;
grant execute on function ap_apresentacao(text, text) to anon, authenticated;
grant execute on function ap_registrar_retorno(text, text, int, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- OS ARQUIVOS
--
-- Público para leitura por endereço; envio e troca só pela equipe logada.
-- Sem política de select: ninguém lista o bucket. Teto de 50 MB por arquivo —
-- a mídia aqui é a de apresentação (imagem, vinheta), não o master de vídeo.
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit)
values ('apollo', 'apollo', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "apollo: equipe envia"   on storage.objects;
drop policy if exists "apollo: equipe atualiza" on storage.objects;
create policy "apollo: equipe envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'apollo');
create policy "apollo: equipe atualiza" on storage.objects
    for update to authenticated using (bucket_id = 'apollo');
