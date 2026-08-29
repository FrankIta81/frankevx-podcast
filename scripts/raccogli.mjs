// Scarica le puntate pubblicate e ne ricava l'audio per il podcast.
//
// PERCHE ESISTE
// Il podcast non e' un lavoro in piu': gli episodi ESISTONO GIA'. Ogni puntata
// del Punto EV pubblicata su punto-ev-media porta con se' il video, la
// copertina, il titolo (seo.json) e le tre notizie del giorno (notizie.json).
// Qui si prende quella roba e se ne ricava un episodio audio.
//
// USO
//   node scripts/raccogli.mjs            aggiunge solo le puntate che mancano
//   node scripts/raccogli.mjs --tutte    rifa' tutto da capo

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoPubblici, abbinaTitolo, abbinaGiorno, eUnoShort } from './lib/youtube.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TUTTE = process.argv.includes('--tutte');
const TEMP = join(RADICE, '.temp');

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

mkdirSync(TEMP, { recursive: true });
mkdirSync(join(RADICE, 'audio'), { recursive: true });
mkdirSync(join(RADICE, 'episodi'), { recursive: true });

const release = sh('gh', ['release', 'list', '--repo', 'FrankIta81/punto-ev-media', '--limit', '300'])
  .split('\n').map((r) => r.split('\t')[0]).filter((t) => t?.startsWith('punto-ev-'));

/**
 * ⚠️ Le release sono PIU' delle puntate uscite: dello stesso giorno ci sono
 * "-prova", "-v2", "-v3", "-2" — i rifacimenti. Il canale YouTube dice quale
 * delle versioni e' quella andata in onda: si abbina sulla durata, dentro la
 * giornata. Una release che sul canale non trova nessuno era una prova.
 */
const suYouTube = await videoPubblici();
/**
 * ⚠️ Il canale si legge SE ci sono le credenziali. In GitHub Actions non ci
 * sono di proposito: il repo e' pubblico e le chiavi non ci devono stare. Senza
 * canale si lavora coi dati che la release porta con se' — titolo da seo.json,
 * data dal tag — e non si scarta niente: buttare una puntata vera perche' non
 * si e' potuto controllare sarebbe il danno peggiore. Il giro preciso si rifa'
 * dal Mac, dove le credenziali ci sono.
 */
const conCanale = suYouTube.length > 0;

console.log(`\n  ${release.length} release del Punto EV` +
  (conCanale ? ` · ${suYouTube.length} video pubblici sul canale\n`
             : `\n  ⚠️ canale non leggibile (mancano le credenziali): titoli e date da quello che c'e' in casa\n`));

let nuovi = 0;
for (const tag of release) {
  /**
   * ⚠️ Il tag della release NON e' sempre una data: ci sono "punto-ev-30lug",
   * "punto-ev-2026-08-13-2" e "punto-ev-2026-08-02-v3" — le prove e i
   * rifacimenti di una puntata gia' fatta. La data si pesca dov'e', e chi non
   * ce l'ha si chiede a GitHub quando e' stato pubblicato.
   */
  let data = /(\d{4}-\d{2}-\d{2})/.exec(tag)?.[1];
  if (!data) {
    try {
      data = JSON.parse(sh('gh', ['release', 'view', tag, '--repo', 'FrankIta81/punto-ev-media',
        '--json', 'publishedAt'])).publishedAt.slice(0, 10);
    } catch { console.log(`  ✗ ${tag}: senza data, salto`); continue; }
  }
  const mp3 = join(RADICE, 'audio', `${tag}.mp3`);
  if (existsSync(mp3) && !TUTTE) continue;

  const dir = join(TEMP, tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    sh('gh', ['release', 'download', tag, '--repo', 'FrankIta81/punto-ev-media', '--dir', dir, '--clobber']);
  } catch { console.log(`  ✗ ${tag}: non scaricabile`); continue; }

  const video = join(dir, `${tag}.mp4`);
  if (!existsSync(video)) { console.log(`  ✗ ${tag}: manca il video`); continue; }

  // 128 kbps mono-compatibile: un minuto di parlato pesa meno di un megabyte
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vn', '-c:a', 'libmp3lame',
    '-b:a', '128k', '-ar', '44100', mp3]);

  // titolo, didascalia e le tre notizie: sono gia' scritti, si copiano e basta
  const seo = existsSync(join(dir, 'seo.json')) ? JSON.parse(readFileSync(join(dir, 'seo.json'), 'utf8')) : {};
  const nz = existsSync(join(dir, 'notizie.json')) ? JSON.parse(readFileSync(join(dir, 'notizie.json'), 'utf8')) : {};
  const titoli = (nz.notizie ?? []).map((n) => n.titoloItaliano || n.titolo).filter(Boolean);
  const durata = Math.round(Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', mp3]).trim()));

  /**
   * La puntata sul canale, cercata PER TITOLO: seo.titoloYouTube e' la stringa
   * che lo script di pubblicazione ha scritto su YouTube, quindi combacia.
   *
   * ⚠️ NON si cerca per durata. Provato: i notiziari stanno tutti fra 50 e 85
   * secondi e le collisioni sono continue — il 29 agosto la puntata si e'
   * agganciata allo Short di uno speciale, e otto puntate vere sono finite sullo
   * stesso video, che il controllo dei doppioni ha poi buttato via.
   *
   * Se il titolo non trova nessuno si tiene comunque l'episodio, coi dati che
   * abbiamo in casa: una puntata in meno e' peggio di un titolo imperfetto.
   */
  const trovato = abbinaTitolo(suYouTube, seo.titoloYouTube);
  const suCanale = trovato && !eUnoShort(trovato) ? trovato : null;

  writeFileSync(join(RADICE, 'episodi', `${tag}.json`), JSON.stringify({
    tag, tipo: 'punto-ev', data: suCanale?.data || data, video: suCanale?.id || null,
    titolo: suCanale?.titolo || seo.titoloYouTube || `Il punto EV — ${data}`,
    descrizione: (suCanale?.descrizione || seo.didascalia || '').split(/\n\s*(?:FONTI|Fonti)\s*\n/)[0].trim(),
    notizie: titoli,
    durata,
    audio: `audio/${tag}.mp3`,
  }, null, 1) + '\n');

  rmSync(dir, { recursive: true, force: true });
  nuovi++;
  console.log(`  ${suCanale ? '✓' : '·'} ${suCanale?.data || data}  ${String(durata).padStart(3)}s  ${(suCanale?.titolo || seo.titoloYouTube || '').slice(0, 56)}`);
}

rmSync(TEMP, { recursive: true, force: true });
console.log(`\n  ${nuovi} episodi nuovi\n`);

/**
 * ⚠️ Delle release ce n'e' piu' d'una per giorno: "-prova", "-v2", "-2" sono i
 * rifacimenti della stessa puntata, e nel podcast diventerebbero episodi doppi.
 * Ne resta una per giornata: quella riconosciuta sul canale, o in mancanza la
 * release piu' recente (i rifacimenti vengono dopo).
 */
const cartella = join(RADICE, 'episodi');
const leggi = () => readdirSync(cartella).filter((f) => f.startsWith('punto-ev-'))
  .map((f) => ({ f, e: JSON.parse(readFileSync(join(cartella, f), 'utf8')) }));
const butta = (v) => {
  rmSync(join(cartella, v.f), { force: true });
  rmSync(join(RADICE, 'audio', `${v.e.tag}.mp3`), { force: true });
};

/**
 * PASSO 1 — una release per giornata.
 * "-prova", "-v2", "-2" sono rifacimenti della stessa puntata: nel podcast
 * diventerebbero episodi doppi. Vince chi il canale ha riconosciuto per titolo;
 * a pari merito la release piu' recente, che e' l'ultimo rifacimento.
 */
const perGiorno = new Map();
for (const { f, e } of leggi()) {
  const gia = perGiorno.get(e.data);
  if (!gia) { perGiorno.set(e.data, { f, e }); continue; }
  const resta = (e.video && !gia.e.video) ? { f, e }
    : (!e.video && gia.e.video) ? gia
    : (e.tag > gia.e.tag ? { f, e } : gia);
  butta(resta === gia ? { f, e } : gia);
  perGiorno.set(e.data, resta);
  console.log(`  ⌫ ${(resta === gia ? e : gia.e).tag}: stessa giornata di ${resta.e.tag}, tolto`);
}

/**
 * PASSO 2 — recupero per giornata.
 * Le puntate di fine luglio hanno in casa un titolo diverso da quello caricato
 * (allora si scriveva a mano), quindi l'aggancio per titolo non le trova. Se in
 * quel giorno sul canale c'e' UN SOLO video nella durata della striscia, e' quello.
 */
const presi = new Set([...perGiorno.values()].map((v) => v.e.video).filter(Boolean));
for (const { f, e } of conCanale ? perGiorno.values() : []) {
  if (e.video) continue;
  const v = abbinaGiorno(suYouTube, e.data, presi);
  if (!v) continue;
  presi.add(v.id);
  Object.assign(e, { video: v.id, data: v.data, titolo: v.titolo,
    descrizione: (v.descrizione || e.descrizione || '').split(/\n\s*(?:FONTI|Fonti)\s*\n/)[0].trim() });
  writeFileSync(join(cartella, f), JSON.stringify(e, null, 1) + '\n');
  console.log(`  ⟳ ${e.data}: ritrovata sul canale — ${v.titolo.slice(0, 52)}`);
}

/** PASSO 3 — chi sul canale non c'e' non e' mai uscito: fuori dal podcast. */
for (const [giorno, v] of conCanale ? [...perGiorno] : []) {
  if (v.e.video) continue;
  butta(v); perGiorno.delete(giorno);
  console.log(`  ⌫ ${v.e.tag}: mai uscita sul canale, fuori dal podcast`);
}

console.log(`\n  ${perGiorno.size} puntate del Punto EV nel podcast\n`);
