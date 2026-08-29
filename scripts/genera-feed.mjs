// Costruisce il feed RSS del podcast dagli episodi raccolti.
//
// PERCHE ESISTE
// Finche' il podcast e' ospitato su Spotify for Creators, ogni puntata va
// caricata a mano: con un episodio al giorno e' insostenibile. Con un feed
// nostro, Spotify (e Apple, e tutti gli altri) vanno a leggere qui e il podcast
// si aggiorna da solo.
//
// COME SI USA
//   node scripts/genera-feed.mjs        scrive feed.xml
//
// ⚠️ IL GUID NON SI TOCCA MAI. E' il numero di targa dell'episodio: se cambia,
// le app lo mostrano come un episodio NUOVO e chi ascolta se lo ritrova due
// volte. Di norma e' il tag della release, che non cambia mai; per i sette
// episodi che erano gia' su Spotify e' il guid che avevano LI', ripreso tale e
// quale da importa-anchor.mjs — e' l'unica cosa che dice a Spotify "questo l'hai
// gia'". Stessa ragione per pubDate: si conserva l'ora originale.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.PODCAST_BASE || 'https://frankita81.github.io/frankevx-podcast';

const PROGRAMMA = {
  titolo: 'IL PUNTO EV',
  sottotitolo: 'Tre notizie dal mondo dell\'auto elettrica, ogni giorno, in circa un minuto.',
  descrizione:
    "Tre notizie dal mondo dell'auto elettrica, ogni giorno, in circa un minuto. " +
    "IL PUNTO EV è la striscia quotidiana di Frank, dal canale FrankEVX: prezzi, " +
    "ricarica, mercato e novità, raccontati senza hype e con le fonti in chiaro.\n\n" +
    "Ogni tanto esce uno SPECIALE: un argomento solo, verificato riga per riga, in sette minuti.",
  autore: 'Frank',   // ⚠️ mai il nome per esteso: qui e in ogni cosa pubblica
  email: 'frankevx@gmail.com',
  sito: 'https://www.youtube.com/@FrankEVX',
  lingua: 'it-it',
  categoria: 'Technology',
  sottocategoria: 'News',
  copertina: `${BASE}/copertina-podcast.jpg`,
};

/** Il minimo indispensabile per non rompere l'XML. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** RFC 2822, che e' l'unico formato che tutte le app leggono senza discutere. */
const dataRss = (iso, ora = '06:40:00') => {
  const d = new Date(`${iso}T${ora}+02:00`);
  const p = (n) => String(n).padStart(2, '0');
  return `${GIORNI[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT`;
};

// La copertina per episodio la fa scripts/copertine.py: la miniatura del video
// INTERA dentro un quadrato, su un fondo che riprende i suoi colori.
// ⚠️ Non si ritaglia: sulle copertine degli speciali il viso sta da una parte e
// la scritta dall'altra, e un taglio quadrato ne butterebbe via una.
// Chi non ha miniatura tiene quella del programma.

const durata = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), q = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(q)}` : `${p(m)}:${p(q)}`;
};

const cartella = join(RADICE, 'episodi');
const episodi = existsSync(cartella)
  ? readdirSync(cartella).filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(cartella, f), 'utf8')))
      .sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : 0))
  : [];

const voce = (e) => {
  const peso = existsSync(join(RADICE, e.audio)) ? readFileSync(join(RADICE, e.audio)).length : 0;
  // le tre notizie del giorno diventano le note dell'episodio: erano gia' scritte
  const note = [e.descrizione, e.notizie?.length ? '\n\nIn questa puntata:\n' + e.notizie.map((n) => `• ${n}`).join('\n') : '']
    .filter(Boolean).join('');
  // i titoli degli speciali arrivano da YouTube gia' scritti per il pubblico:
  // il prefisso serve solo a distinguerli dalla striscia quotidiana nell'elenco
  const titolo = e.tipo === 'speciale' ? `SPECIALE · ${e.titolo}` : e.titolo;
  return `    <item>
      <title>${esc(titolo)}</title>
      <description><![CDATA[${note}]]></description>
      <itunes:summary><![CDATA[${note}]]></itunes:summary>
      <pubDate>${e.pubDate || dataRss(e.data, e.tipo === 'speciale' ? '12:00:00' : '06:40:00')}</pubDate>
      <enclosure url="${BASE}/${e.audio}" length="${peso}" type="audio/mpeg"/>
      <guid isPermaLink="false">${esc(e.guid || e.tag)}</guid>
      <itunes:duration>${durata(e.durata)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>${e.copertina ? `
      <itunes:image href="${BASE}/${e.copertina}"/>` : ''}
    </item>`;
};

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(PROGRAMMA.titolo)}</title>
    <link>${esc(PROGRAMMA.sito)}</link>
    <language>${PROGRAMMA.lingua}</language>
    <copyright>${esc(PROGRAMMA.autore)}</copyright>
    <description><![CDATA[${PROGRAMMA.descrizione}]]></description>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>${esc(PROGRAMMA.autore)}</itunes:author>
    <itunes:subtitle>${esc(PROGRAMMA.sottotitolo)}</itunes:subtitle>
    <itunes:summary><![CDATA[${PROGRAMMA.descrizione}]]></itunes:summary>
    <itunes:owner>
      <itunes:name>${esc(PROGRAMMA.autore)}</itunes:name>
      <itunes:email>${esc(PROGRAMMA.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${PROGRAMMA.copertina}"/>
    <itunes:category text="${PROGRAMMA.categoria}">
      <itunes:category text="${PROGRAMMA.sottocategoria}"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
${episodi.map(voce).join('\n')}
  </channel>
</rss>
`;

writeFileSync(join(RADICE, 'feed.xml'), feed);
const speciali = episodi.filter((e) => e.tipo === 'speciale').length;
console.log(`\n  feed.xml scritto · ${episodi.length} episodi (${speciali} speciali)`);
console.log(`  indirizzo: ${BASE}/feed.xml\n`);
