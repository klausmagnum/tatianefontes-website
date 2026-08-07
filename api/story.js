// Endpoint público que gera a arte vertical para Stories (JPEG 1080x1920)
import { renderStory } from '../lib/card.js';

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const buf = await renderStory({
      title: (q.t || '').toString(),
      subtitle: (q.s || '').toString(),
      tag: (q.tag || 'FIQUE POR DENTRO').toString(),
      variant: parseInt(q.v || '0', 10) || 0,
      bg: (q.bg || 'plain').toString(),
      photoUrl: (q.p || '').toString(),
    });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).send('erro ao gerar story: ' + (e && e.message || e));
  }
}
