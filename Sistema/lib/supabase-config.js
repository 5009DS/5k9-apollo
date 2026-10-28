/* ═══════════════════════════════════════════════════════════════════════════
   CONEXÃO COM O BANCO — as mesmas chaves do 5K9 Forms e do Chronos.

   O Apollo mora no projeto Supabase do Forms, com prefixo `ap_` (README,
   "Onde ele mora no ecossistema"). Copiadas de
   `Chronos/5K9 Chronos/Sistema/lib/supabase-config.js` — se mudarem lá, mudam
   aqui.

   Por enquanto só a publicação usa o banco (lib/nuvem.js, db/nuvem.sql): o
   resto do Apollo continua em modo local. A chave `anon` é pública por
   natureza; quem protege os dados é o RLS e as duas funções da porta do
   cliente, como no Chronos.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SUPABASE_URL  = 'https://dppgtlclpgdvxhnnulgf.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcGd0bGNscGdkdnhobm51bGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzcyNjUsImV4cCI6MjEwMTgxMzI2NX0.31Z-UOk4RUYBz4WtqNYmktiocgBIryTe6bChj9DHZiA';

/** Há banco configurado? Sem ele, publicar fica só neste navegador. */
export const CONFIGURADO = !!(SUPABASE_URL && SUPABASE_ANON);
