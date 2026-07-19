// Busca foto no Pexels, redimensiona para 1080x1080 e retorna com overlay.
import https from 'https';
import { Redis } from '@upstash/redis';

const PEXELS_KEY = process.env.PEXELS_API_KEY;
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const q = (req.query && req.query.q) || 'contabilidade';
    const cached = await redis.get(`photo:${q}`);
    if (cached) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(cached);
    }

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1`;
    const img = await new Promise((ok, fail) => {
      https.get(url, { headers: { 'Authorization': PEXELS_KEY } }, (r) => {
        let body = '';
        r.on('data', d => body += d);
        r.on('end', () => {
          try {
            const j = JSON.parse(body);
            if (j.photos && j.photos[0]) {
              ok({ src: j.photos[0].src.large, id: j.photos[0].id });
            } else {
              fail('nenhuma foto');
            }
          } catch (e) { fail(e); }
        });
      }).on('error', fail);
    });

    const result = JSON.stringify({ ok: true, photo: img.src, photoId: img.id });
    await redis.setex(`photo:${q}`, 86400, result);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(result);
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
