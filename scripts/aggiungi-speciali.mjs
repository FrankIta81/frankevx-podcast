// Aggiunge gli SPECIALI al podcast, prendendo l'audio dai video sulla scrivania.
//
// PERCHE SEPARATO DA raccogli.mjs
// Gli speciali non stanno su punto-ev-media: stanno in
// ~/Desktop/FRANKEVX/1 - SPECIALI, una cartella per episodio, e il loro audio
// si ricava dal video 16:9 gia' montato — che e' gia' a -14 LUFS, cioe' il
// livello che i podcast vogliono.
//
// La data di uscita e' quella nel nome della cartella ("4 - Cybercab - 2026-09-01").
// Le cartelle con DA DECIDERE si saltano: un episodio che non e' uscito non va
// nel podcast.
//
// USO
//   node scripts/aggiungi-speciali.mjs

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoPubblici, abbina } from './lib/youtube.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPECIALI = join(homedir(), 'Desktop', 'FRANKEVX', '1 - SPECIALI');

const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

mkdirSync(join(RADICE, 'audio'), { recursive: true });
mkdirSync(join(RADICE, 'episodi'), { recursive: true });

const cartelle = readdirSync(SPECIALI)
  .filter((d) => statSync(join(SPECIALI, d)).isDirectory());

const suYouTube = await videoPubblici();
console.log(`\n  ${cartelle.length} cartelle di speciali · ${suYouTube.length} video pubblici sul canale\n`);

for (const c of cartelle) {
  const data = c.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!data) { console.log(`  – ${c}: senza data di uscita, salto`); continue; }

  const dentro = readdirSync(join(SPECIALI, c));
  const video = dentro.find((f) => f.endsWith('.mp4') && /16-9/.test(f));
  if (!video) { console.log(`  ✗ ${c}: nessun video 16:9`); continue; }

  const tag = `speciale-${data}`;
  const mp3 = join(RADICE, 'audio', `${tag}.mp3`);
  if (!existsSync(mp3)) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(SPECIALI, c, video),
      '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', mp3]);
  }

  const durata = Math.round(Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', mp3]).trim()));

  /**
   * Titolo, descrizione e data li detta YOUTUBE, non la cartella: la cartella ha
   * la data prevista e il titolo di lavorazione, che quasi sempre cambiano.
   * Se sul canale il video non c'e', l'episodio non e' uscito e non si pubblica.
   */
  const suCanale = abbina(suYouTube, durata, data);
  if (!suCanale) { console.log(`  – ${c}: non ancora pubblicato su YouTube, salto`); continue; }
  const uscita = suCanale.data;

  let titolo = suCanale.titolo;
  let descrizione = suCanale.descrizione.split(/\n\s*(?:CAPITOLI|Capitoli|FONTI|Fonti)\s*\n/)[0].trim();

  /**
   * Titolo e descrizione esistono gia', ma OGNI EPISODIO LI IMPAGINA DIVERSO:
   * i primi hanno testi-pubblicazione.txt con le cornici a caratteri, gli ultimi
   * un youtube.json pulito. Si prova in ordine, dal piu' affidabile al piu'
   * fragile, e si tiene il primo che risponde.
   */
  // 1. youtube.json: e' fatto apposta, quando c'e' vince su tutto
  const yj = dentro.find((f) => f === 'youtube.json');
  if (yj) {
    const y = JSON.parse(readFileSync(join(SPECIALI, c, yj), 'utf8'));
    if (y.titolo) titolo = y.titolo;
    if (y.descrizione) descrizione = y.descrizione.split(/\n\s*CAPITOLI/)[0].trim();
  }

  // 2. i testi di pubblicazione. Due impaginazioni, viste in sei episodi:
  //    A)  --- YOUTUBE (titolo) ---        B)  TITOLO (79/100)
  //        <riga>                              <riga>
  //        --- YOUTUBE (descrizione) ---       DESCRIZIONE
  //        <paragrafi>                         <paragrafi>
  //    In entrambe la descrizione finisce dove comincia un'altra sezione.
  const txt = dentro.find((f) => /testi.*pubblicazione/i.test(f));
  if (txt) {
    const t = readFileSync(join(SPECIALI, c, txt), 'utf8');
    const grezzo = c.replace(/^\d+ - /, '').replace(/ - \d{4}-\d{2}-\d{2}$/, '');

    if (titolo === grezzo) {
      const tit = t.match(/---\s*YOUTUBE \(titolo\)\s*---\s*\n+(.+)/)
        || t.match(/\nTITOLO(?: YOUTUBE)?[^\n]*\n+(.+)/);
      if (tit) titolo = tit[1].trim();
    }

    if (!descrizione) {
      const des = t.match(/---\s*YOUTUBE \(descrizione\)\s*---\s*\n+([\s\S]+?)\n\s*(?:Capitoli|CAPITOLI|Fonti|FONTI|---|╔|═══|#\w)/)
        || t.match(/\nDESCRIZIONE[^\n]*\n+([\s\S]+?)\n\s*(?:Capitoli|CAPITOLI|Fonti|FONTI|TAG|HASHTAG|──|╔|═══|#\w)/);
      if (des) descrizione = des[1].trim();
    }
  }

  // 3. il copione, ultima spiaggia: il sottotitolo e' una descrizione gia' scritta bene
  if (!descrizione) {
    const cj = dentro.find((f) => f === 'copione.json');
    if (cj) {
      const k = JSON.parse(readFileSync(join(SPECIALI, c, cj), 'utf8'));
      if (k.sottotitolo) descrizione = k.sottotitolo;
      if (k.titolo && titolo === c.replace(/^\d+ - /, '').replace(/ - \d{4}-\d{2}-\d{2}$/, ''))
        titolo = String(k.titolo).replace(/\n/g, ' ');
    }
  }

  // le righe spezzate a mano a 80 colonne, nel podcast, vanno riunite
  descrizione = descrizione
    .replace(/^[\s_=—–-]{6,}\s*/, '')
    .replace(/([^\n])\n(?!\n|[·•\-])/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();


  writeFileSync(join(RADICE, 'episodi', `${tag}.json`), JSON.stringify({
    tag, tipo: 'speciale', data: uscita, titolo, video: suCanale.id, descrizione, notizie: [],
    durata, audio: `audio/${tag}.mp3`,
  }, null, 1) + '\n');

  const m = Math.floor(durata / 60), s = durata % 60;
  console.log(`  ✓ ${uscita}  ${m}:${String(s).padStart(2, '0')}  ${titolo.slice(0, 56)}`);
}
console.log();
