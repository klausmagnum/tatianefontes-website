// Vercel Serverless Function — busca as últimas notícias do Portal Contábeis (RSS)
// Endpoint: /api/noticias
export default async function handler(req, res) {
  const FEED = 'https://www.contabeis.com.br/rss/noticias/';
  try {
    const r = await fetch(FEED, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TatianeFontesSite/1.0)' },
    });
    if (!r.ok) throw new Error('feed HTTP ' + r.status);
    const xml = await r.text();

    const clean = (s) =>
      (s || '')
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;|&#8216;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/&#8230;/g, '…')
        .replace(/\s+/g, ' ')
        .trim();

    const tag = (block, name) => {
      const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
      return m ? m[1] : '';
    };

    const items = [];
    const blocks = xml.split(/<item[\s>]/i).slice(1);
    for (const b of blocks) {
      const title = clean(tag(b, 'title'));
      const link = clean(tag(b, 'link'));
      const pubDate = clean(tag(b, 'pubDate'));
      let desc = clean(tag(b, 'description'));
      if (desc.length > 165) desc = desc.slice(0, 162).trim() + '…';
      if (title && link) items.push({ title, link, pubDate, desc });
      if (items.length >= 8) break;
    }

    if (!items.length) throw new Error('nenhum item encontrado');

    // cache na borda do Vercel: 30 min, revalida em segundo plano por mais 1h
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    // devolve 200 com ok:false para o site mostrar o fallback sem quebrar
    return res.status(200).json({ ok: false, error: String(err && err.message || err), items: [] });
  }
}
