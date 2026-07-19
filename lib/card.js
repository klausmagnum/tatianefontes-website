// Gera a arte (JPEG 1080x1080) do post do Instagram a partir de uma manchete.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

// registra as fontes (uma vez)
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const reg = (file, name) =>
    GlobalFonts.registerFromPath(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)), name);
  reg('Poppins-Bold.ttf', 'Poppins Bold');
  reg('Poppins-SemiBold.ttf', 'Poppins SemiBold');
  reg('Poppins-Regular.ttf', 'Poppins Regular');
  fontsReady = true;
}

// carrega a logo branca do escritório (uma vez)
let logoImg = null;
async function ensureLogo() {
  if (logoImg) return logoImg;
  logoImg = await loadImage(fileURLToPath(new URL('../assets/logo-white.png', import.meta.url)));
  return logoImg;
}

const NAVY = '#242b43';
const NAVY_DEEP = '#171d30';
const BLUE = '#5f83c8';
const ROSE = '#e6b3cc';

// variações sutis de cor (mantêm a marca navy, mas o post nunca fica idêntico)
const VARIANTS = [
  { g3: '#2b3760', glow: '95,131,200', pill: ['#5f83c8', '#8f6fb0'], bar: ['#5f83c8', '#e6b3cc'] },
  { g3: '#243a63', glow: '80,110,200', pill: ['#4a6bb0', '#6f8fd0'], bar: ['#4a6bb0', '#9db8ea'] },
  { g3: '#26384f', glow: '90,150,170', pill: ['#3d8f99', '#5f83c8'], bar: ['#3d8f99', '#7fd0e0'] },
  { g3: '#33305e', glow: '150,120,200', pill: ['#7c6ba0', '#c48fb0'], bar: ['#7c6ba0', '#e6b3cc'] },
];
const TAGS = ['VOCÊ SABIA?', 'FIQUE POR DENTRO', 'ATENÇÃO', 'NOVIDADE', 'IMPORTANTE'];

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCard({ title = '', subtitle = '', tag = 'FIQUE POR DENTRO', variant = 0, bg = 'plain' } = {}) {
  ensureFonts();
  const logo = await ensureLogo();
  const V = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // fundo: gradiente navy (tom de destaque varia)
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, NAVY_DEEP);
  g.addColorStop(0.55, NAVY);
  g.addColorStop(1, V.g3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // glow suave (canto sup. direito)
  const rg = ctx.createRadialGradient(S * 0.85, S * 0.12, 0, S * 0.85, S * 0.12, 620);
  rg.addColorStop(0, `rgba(${V.glow},0.35)`);
  rg.addColorStop(1, `rgba(${V.glow},0)`);
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);

  // fundo temático (bem sutil, "apagado pelo azul")
  drawTheme(ctx, S, V, bg);

  const PAD = 96;

  // ---- topo: logo real do escritório ----
  ctx.textBaseline = 'alphabetic';
  const logoH = 156;
  const logoW = logo.width * (logoH / logo.height);
  ctx.drawImage(logo, PAD, PAD - 18, logoW, logoH);

  // ---- tag/pílula (clickbait) ----
  const tagY = 300;
  ctx.font = '700 26px "Poppins Bold"';
  const tagW = ctx.measureText(tag).width + 56;
  const pg = ctx.createLinearGradient(PAD, 0, PAD + tagW, 0);
  pg.addColorStop(0, V.pill[0]);
  pg.addColorStop(1, V.pill[1]);
  ctx.fillStyle = pg;
  roundRect(ctx, PAD, tagY, tagW, 58, 29);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tag, PAD + 28, tagY + 39);

  // ---- manchete + resumo (auto-ajuste, sem invadir o rodapé) ----
  const maxW = S - PAD * 2;
  const topText = tagY + 58 + 56;   // topo da 1ª linha da manchete
  const accentY = S - 196;          // barra de destaque (posição fixa)
  const hasSub = subtitle && subtitle.trim().length > 0;
  const subFont = 37, subLH = subFont * 1.34, subMaxLines = 3, gap = 30;
  const reserve = hasSub ? subMaxLines * subLH + gap : 0;
  const headlineAreaBottom = accentY - 24 - reserve;

  // manchete grande (reduz o tamanho até caber)
  let size = 84, lines = [];
  while (size >= 40) {
    ctx.font = `700 ${size}px "Poppins Bold"`;
    lines = wrap(ctx, title, maxW);
    const lh0 = size * 1.14;
    if (topText + lines.length * lh0 <= headlineAreaBottom && lines.length <= 5) break;
    size -= 3;
  }
  const lh = size * 1.14;
  ctx.font = `700 ${size}px "Poppins Bold"`;
  ctx.fillStyle = '#ffffff';
  lines.forEach((ln, i) => ctx.fillText(ln, PAD, topText + i * lh + size * 0.80));
  const headlineBottom = topText + lines.length * lh;

  // resumo (letras menores) — limitado para nunca cruzar a barra
  if (hasSub) {
    ctx.font = `400 ${subFont}px "Poppins Regular"`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    const subTop = headlineBottom + gap;
    const fit = Math.max(1, Math.min(subMaxLines, Math.floor((accentY - 24 - subTop) / subLH)));
    let sub = wrap(ctx, subtitle.trim(), maxW);
    if (sub.length > fit) {
      sub = sub.slice(0, fit);
      let last = sub[fit - 1];
      while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
      sub[fit - 1] = last.replace(/[\s.,;:]+$/, '') + '…';
    }
    sub.forEach((ln, j) => ctx.fillText(ln, PAD, subTop + j * subLH + subFont * 0.80));
  }

  // ---- barra de destaque (posição fixa) ----
  const barGrad = ctx.createLinearGradient(PAD, 0, PAD + 120, 0);
  barGrad.addColorStop(0, V.bar[0]);
  barGrad.addColorStop(1, V.bar[1]);
  ctx.fillStyle = barGrad;
  roundRect(ctx, PAD, accentY, 120, 8, 4);
  ctx.fill();

  // ---- rodapé: CTA + fonte ----
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px "Poppins SemiBold"';
  ctx.fillText('Saiba mais no nosso site', PAD, S - 130);
  ctx.fillStyle = BLUE;
  ctx.font = '700 34px "Poppins Bold"';
  // seta desenhada (a fonte não tem o glifo "→")
  const ay = S - 98;
  ctx.beginPath();
  ctx.moveTo(PAD, ay);
  ctx.lineTo(PAD + 26, ay);
  ctx.moveTo(PAD + 17, ay - 9);
  ctx.lineTo(PAD + 27, ay);
  ctx.lineTo(PAD + 17, ay + 9);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillText('tatianefontes.com', PAD + 46, S - 86);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '400 22px "Poppins Regular"';
  ctx.textAlign = 'right';
  ctx.fillText('Fonte: Portal Contábeis', S - PAD, S - 60);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/jpeg', 92);
}

// monograma TF em linhas finas brancas
function drawMonogram(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.055;
  ctx.lineCap = 'round';
  const u = s / 120;
  const L = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x + x1 * u, y + y1 * u);
    ctx.lineTo(x + x2 * u, y + y2 * u);
    ctx.stroke();
  };
  L(20, 14, 100, 14); // barra superior
  L(50, 14, 50, 110); // T
  L(70, 14, 70, 110); // F vertical
  L(70, 60, 96, 60);  // F braço
  ctx.restore();
}

// fundos temáticos desenhados (finanças/escritório), bem sutis sobre o navy
function drawTheme(ctx, S, V, bg) {
  if (!bg || bg === 'plain') return;
  ctx.save();
  if (bg === 'grid') {
    // malha tipo planilha
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= S; x += 66) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
    for (let y = 0; y <= S; y += 66) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  } else if (bg === 'dots') {
    // pontos (rede/dados)
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 46; y < S; y += 56) for (let x = 46; x < S; x += 56) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  } else if (bg === 'chart') {
    // gráfico de linha ascendente + área (crescimento)
    const pts = [[0, S * 0.80], [S * 0.22, S * 0.72], [S * 0.42, S * 0.76], [S * 0.62, S * 0.60], [S * 0.82, S * 0.64], [S, S * 0.46]];
    const path = () => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i], [px, py] = pts[i - 1]; ctx.bezierCurveTo(px + (x - px) / 2, py, px + (x - px) / 2, y, x, y); }
    };
    path(); ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.closePath();
    ctx.fillStyle = `rgba(${V.glow},0.10)`; ctx.fill();
    path(); ctx.strokeStyle = `rgba(${V.glow},0.30)`; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  } else if (bg === 'bars') {
    // barras crescentes (rodapé direito)
    const n = 6, bw = 78, gap = 34; let x = S - (n * (bw + gap)) + gap - 40;
    ctx.fillStyle = `rgba(${V.glow},0.12)`;
    for (let i = 0; i < n; i++) { const h = 110 + i * 78; roundRect(ctx, x, S - h - 40, bw, h, 14); ctx.fill(); x += bw + gap; }
  } else if (bg === 'coins') {
    // círculos/anéis (moedas)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    const circ = [[S * 0.82, S * 0.30, 150], [S * 0.90, S * 0.62, 90], [S * 0.70, S * 0.52, 54]];
    for (const [cx, cy, r] of circ) { ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
