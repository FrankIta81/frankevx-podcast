// Porta nel feed nuovo i 7 episodi che stanno gia' su Spotify.
//
// PERCHE E' DELICATO
// Il podcast oggi vive su Spotify for Creators (anchor.fm). Quando il feed passa
// al nostro, quei 7 episodi devono restare gli STESSI episodi: se cambiano guid,
// Spotify li considera nuovi e chi ascolta se li ritrova doppi in cima.
// Quindi si copiano guid, data e testi TALI E QUALI dal feed vecchio.
//
// Uno dei 7 (lo speciale sul noleggio sociale, caricato a mano il 21/08/2026) e'
// gia' fra i nostri episodi: li' non si aggiunge niente, si adotta il suo guid.
//
// USO
//   node scripts/importa-anchor.mjs

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const VECCHIO = process.env.FEED_VECCHIO || 'https://anchor.fm/s/101379608/podcast/rss';

mkdirSync(join(RADICE, 'audio'), { recursive: true });

const xml = execFileSync('curl', ['-sL', VECCHIO], { encoding: 'utf8', maxBuffer: 1 << 26 });
const pezzo = (t, s) => {
  const m = new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`).exec(s);
  return m ? m[1].trim() : '';
};

const voci = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
console.log(`\n  ${voci.length} episodi nel feed vecchio\n`);

// quello che abbiamo gia': si riconosce dalla durata, come per gli speciali
const nostri = readdirSync(join(RADICE, 'episodi')).filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(RADICE, 'episodi', f), 'utf8')) }));

for (const v of voci) {
  const titolo = pezzo('title', v);
  const guid = pezzo('guid', v);
  const url = /<enclosure url="([^"]+)"/.exec(v)?.[1];
  if (!url) { console.log(`  ✗ ${titolo.slice(0, 50)}: senza audio`); continue; }

  const durata = pezzo('itunes:duration', v).split(':').reverse()
    .reduce((t, n, i) => t + Number(n) * 60 ** i, 0);

  // gia' nostro? allora si adotta solo il guid, e l'episodio resta uno
  const gemello = nostri.find((n) => durata && Math.abs(n.durata - durata) <= 4);
  if (gemello) {
    const dove = join(RADICE, 'episodi', gemello.file);
    writeFileSync(dove, JSON.stringify({ ...gemello, file: undefined, guid }, null, 1) + '\n');
    console.log(`  = ${titolo.slice(0, 46)}\n      e' gia' nostro (${gemello.tag}): ne prende il guid`);
    continue;
  }

  const tag = `archivio-${guid.slice(0, 8)}`;
  const mp3 = join(RADICE, 'audio', `${tag}.mp3`);
  if (!existsSync(mp3)) execFileSync('curl', ['-sL', url, '-o', mp3]);

  const vero = Math.round(Number(execFileSync('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
    { encoding: 'utf8' }).trim()));

  writeFileSync(join(RADICE, 'episodi', `${tag}.json`), JSON.stringify({
    tag, guid, tipo: 'archivio',
    data: new Date(pezzo('pubDate', v)).toISOString().slice(0, 10),
    pubDate: pezzo('pubDate', v),          // ⚠️ l'ora esatta si conserva com'era
    titolo,
    descrizione: pezzo('description', v).replace(/<[^>]+>/g, '').trim(),
    notizie: [], durata: vero, audio: `audio/${tag}.mp3`, copertina: null,
  }, null, 1) + '\n');

  const m = Math.floor(vero / 60), s = vero % 60;
  console.log(`  ✓ ${m}:${String(s).padStart(2, '0')}  ${titolo.slice(0, 56)}`);
}
console.log();
