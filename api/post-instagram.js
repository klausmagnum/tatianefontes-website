// Robô: pega a manchete mais nova do Portal Contábeis, gera a arte,
// escreve a legenda e publica no Instagram. Roda 2x/dia (cron).
import { Redis } from '@upstash/redis';

const FEED = 'https://www.contabeis.com.br/rss/noticias/';
const GRAPH = 'https://graph.instagram.com';
const TAGS = ['VOCÊ SABIA?', 'FIQUE POR DENTRO', 'ATENÇÃO', 'NOVIDADE', 'IMPORTANTE'];
const BGS = ['plain', 'chart', 'grid', 'bars', 'dots', 'coins'];
const HASHTAGS = '#contabilidade #contabil #impostoderenda #tributario #reformatributaria #empreendedorismo #contadornatal #assessoriacontabil #natalrn #simplesnacional #gestaofinanceira #mei';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    console.log('[CRON] Iniciando postagem Instagram...');

    // rate limit: máximo 1 postagem a cada 5 minutos para evitar spam
    const lastPostTime = await redis.get('ig_last_post_time');
    if (lastPostTime && Date.now() - Number(lastPostTime) < 300000) {
      console.log('[CRON] Rate limit ativo, bloqueado');
      return res.status(429).json({ ok: false, error: 'rate limited - máximo 1 postagem a cada 5 minutos' });
    }
    console.log('[CRON] Rate limit OK');

    console.log('[CRON] Buscando token...');
    const token = await getToken();
    console.log('[CRON] Token obtido:', token ? 'SIM' : 'NÃO');

    console.log('[CRON] Buscando ID do usuário...');
    const igId = await getIgUserId(token);
    console.log('[CRON] ID do usuário:', igId);

    console.log('[CRON] Buscando feed RSS...');
    const items = await fetchFeed();
    console.log('[CRON] Feed obtido:', items.length, 'notícias');

    // acha a notícia mais nova ainda não postada
    let chosen = null;
    for (const it of items) {
      const alreadyPosted = await redis.sismember('ig_posted', it.id);
      console.log('[CRON] Verificando notícia:', it.id, '- Já postada?', alreadyPosted);
      if (!alreadyPosted) { chosen = it; break; }
    }
    if (!chosen) {
      console.log('[CRON] Nenhuma notícia nova encontrada');
      return res.status(200).json({ ok: true, skipped: 'nenhuma notícia nova' });
    }
    console.log('[CRON] Notícia escolhida:', chosen.title);

    // estilo sorteado (fundo + cor + pílula)
    const variant = Math.floor(Math.random() * 4);
    const bg = BGS[Math.floor(Math.random() * BGS.length)];
    const tag = TAGS[Math.floor(Math.random() * TAGS.length)];
    console.log('[CRON] Estilo definido:', { variant, bg, tag });

    const base = 'https://www.tatianefontes.com';
    console.log('[CRON] Base URL:', base);

    // busca foto do Pexels baseado na manchete
    let photoUrl = '';
    try {
      const keyword = extractKeyword(chosen.title);
      console.log('[CRON] Keyword extraída:', keyword);
      const photoRes = await fetch(`${base}/api/photo?q=${encodeURIComponent(keyword)}`);
      const photoData = await photoRes.json();
      if (photoData.ok && photoData.photo) photoUrl = photoData.photo;
      console.log('[CRON] Foto obtida:', photoUrl ? 'SIM' : 'NÃO');
    } catch (e) {
      console.log('[CRON] Erro ao buscar foto:', e.message);
    }

    const imgUrl = `${base}/api/card?` + new URLSearchParams({
      t: chosen.title, s: chosen.desc, tag, v: String(variant), bg,
      p: photoUrl || '',
    }).toString();
    console.log('[CRON] Imagem URL gerada');

    const caption = buildCaption(chosen);
    console.log('[CRON] Caption gerada');

    console.log('[CRON] Criando mídia no Instagram...');
    const creationId = await igCreateMedia(igId, token, imgUrl, caption);
    console.log('[CRON] Mídia criada:', creationId);

    // aguarda processamento da imagem (Instagram precisa de tempo)
    console.log('[CRON] Aguardando 2s...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('[CRON] Publicando mídia...');
    const mediaId = await igPublish(igId, token, creationId);
    console.log('[CRON] Mídia publicada:', mediaId);

    console.log('[CRON] Salvando no Redis...');
    await redis.sadd('ig_posted', chosen.id);
    await redis.set('ig_last_post_time', Date.now());
    console.log('[CRON] Salvo no Redis com sucesso!');

    return res.status(200).json({ ok: true, posted: chosen.title, mediaId, style: { variant, bg, tag } });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}

// ---------- token (renova sozinho) ----------
async function getToken() {
  let token = await redis.get('ig_token');
  let ts = await redis.get('ig_token_ts');
  if (!token) {
    token = process.env.IG_ACCESS_TOKEN;
    ts = Date.now();
    await redis.mset({ ig_token: token, ig_token_ts: ts });
  }
  const age = Date.now() - Number(ts || 0);
  if (age > 50 * 24 * 3600 * 1000) {
    try {
      const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
      const j = await r.json();
      if (j.access_token) {
        token = j.access_token;
        await redis.mset({ ig_token: token, ig_token_ts: Date.now() });
      }
    } catch { /* mantém o token atual se a renovação falhar */ }
  }
  return token;
}

async function getIgUserId(token) {
  let id = await redis.get('ig_user_id');
  if (id) return id;
  const r = await fetch(`${GRAPH}/v21.0/me?fields=user_id,username&access_token=${token}`);
  const j = await r.json();
  id = j.user_id || j.id;
  if (!id) throw new Error('me falhou: ' + JSON.stringify(j));
  await redis.set('ig_user_id', id);
  return id;
}

// ---------- publicação ----------
async function igCreateMedia(igId, token, imageUrl, caption) {
  try {
    console.log('[CRON] Tentando criar mídia... URL:', imageUrl.substring(0, 50) + '...');
    const body = new URLSearchParams({ image_url: imageUrl, caption, access_token: token });
    console.log('[CRON] Enviando para Instagram...');
    const r = await fetch(`${GRAPH}/v21.0/${igId}/media`, { method: 'POST', body });
    console.log('[CRON] Resposta recebida:', r.status);
    const j = await r.json();
    console.log('[CRON] JSON parseado:', j);
    if (!r.ok || !j.id) throw new Error('criar mídia: ' + JSON.stringify(j));
    console.log('[CRON] Mídia criada com ID:', j.id);
    return j.id;
  } catch (e) {
    console.log('[CRON] ERRO ao criar mídia:', e.message);
    throw e;
  }
}

async function igPublish(igId, token, creationId) {
  const body = new URLSearchParams({ creation_id: creationId, access_token: token });
  const r = await fetch(`${GRAPH}/v21.0/${igId}/media_publish`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error('publicar: ' + JSON.stringify(j));
  return j.id;
}

// ---------- feed ----------
async function fetchFeed() {
  const r = await fetch(FEED, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TatianeFontesBot/1.0)' } });
  const xml = await r.text();
  const clean = (s) => (s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#8217;|&#8216;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#8230;/g, '…')
    .replace(/\s+/g, ' ').trim();
  const tag = (b, n) => { const m = b.match(new RegExp('<' + n + '[^>]*>([\\s\\S]*?)<\\/' + n + '>', 'i')); return m ? m[1] : ''; };
  const items = [];
  for (const b of xml.split(/<item[\s>]/i).slice(1)) {
    const title = clean(tag(b, 'title'));
    const link = clean(tag(b, 'link'));
    let desc = clean(tag(b, 'description'));
    if (desc.length > 240) desc = desc.slice(0, 237).trim() + '…';
    const idm = link.match(/noticias\/(\d+)\//);
    const id = idm ? idm[1] : link;
    if (title && link) items.push({ id, title, link, desc });
    if (items.length >= 8) break;
  }
  return items;
}

function buildCaption(it) {
  const cta = 'Precisa de ajuda com a contabilidade da sua empresa? Chama a gente no WhatsApp! 👊';
  return [
    it.title,
    it.desc,
    '📲 Leia a matéria completa no nosso site: tatianefontes.com',
    cta,
    'Fonte: Portal Contábeis',
    HASHTAGS,
  ].filter(Boolean).join('\n\n');
}

function extractKeyword(title) {
  // extrai a palavra-chave principal do título para buscar foto relevante
  const words = title.toLowerCase().split(/\s+/);
  const stopwords = ['a', 'o', 'de', 'e', 'é', 'em', 'para', 'como', 'que', 'do', 'da', 'dos', 'das', 'à', 'ao', 'os', 'as', 'mais', 'foi', 'seja', 'ou', 'um', 'uma'];
  let keyword = words.find(w => w.length > 4 && !stopwords.includes(w));
  if (!keyword) keyword = words.find(w => w.length > 3) || 'contabilidade';
  return keyword || 'contabilidade';
}
