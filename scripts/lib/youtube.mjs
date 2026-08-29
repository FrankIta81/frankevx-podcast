// Cosa e' DAVVERO uscito sul canale, e con che titolo.
//
// PERCHE ESISTE
// Le cartelle degli speciali hanno la data PREVISTA e il titolo di lavorazione:
// lo speciale prezzi in cartella si chiama "STESSA PRESA" ed e' datato 29/08, ma
// su YouTube e' uscito col titolo "Quanto costa DAVVERO ricaricare l'auto
// elettrica?". Il Cybercab, previsto per il 1 settembre, e' uscito il 27 agosto.
// Un podcast che copiasse la cartella pubblicherebbe titoli e date sbagliate.
//
// Quindi si guarda il canale. L'abbinamento fra cartella e video si fa sulla
// DURATA (±4 secondi): e' l'unica cosa che non cambia fra il file montato e il
// video caricato, mentre il titolo cambia sempre.
//
// Un episodio che sul canale non c'e' NON entra nel podcast: non e' ancora uscito.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { google } from 'googleapis';

const SEGRETI = join(homedir(), 'Progetti', 'frankevx-speciali', '.secrets');

/** Le stesse credenziali che usa carica-youtube.mjs: nessun consenso nuovo da dare. */
function accesso() {
  const cs = join(SEGRETI, 'client_secret.json'), tk = join(SEGRETI, 'token.json');
  if (!existsSync(cs) || !existsSync(tk)) return null;
  const c = JSON.parse(readFileSync(cs, 'utf8'));
  const k = c.installed || c.web;
  const cl = new google.auth.OAuth2(k.client_id, k.client_secret, k.redirect_uris?.[0] || 'http://localhost:8723');
  cl.setCredentials(JSON.parse(readFileSync(tk, 'utf8')));
  return google.youtube({ version: 'v3', auth: cl });
}

/** "PT6M58S" -> 418 */
const secondi = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

/**
 * I video PUBBLICI del canale, con durata, data e descrizione.
 * Gli "unlisted" restano fuori: sono le prove di caricamento.
 */
export async function videoPubblici() {
  if (process.env.PODCAST_SENZA_CANALE) return [];   // per provare il giro di Actions
  const yt = accesso();
  if (!yt) return [];

  const ch = await yt.channels.list({ part: 'contentDetails', mine: true });
  const lista = ch.data.items[0].contentDetails.relatedPlaylists.uploads;

  const id = [];
  let pagina;
  do {
    const r = await yt.playlistItems.list({ part: 'contentDetails', playlistId: lista, maxResults: 50, pageToken: pagina });
    id.push(...r.data.items.map((i) => i.contentDetails.videoId));
    pagina = r.data.nextPageToken;
  } while (pagina && id.length < 300);

  const video = [];
  for (let i = 0; i < id.length; i += 50) {
    const r = await yt.videos.list({ part: 'snippet,contentDetails,status', id: id.slice(i, i + 50).join(',') });
    for (const v of r.data.items) {
      if (v.status?.privacyStatus !== 'public') continue;
      video.push({
        id: v.id,
        titolo: v.snippet.title,
        descrizione: v.snippet.description || '',
        data: (v.snippet.publishedAt || '').slice(0, 10),
        durata: secondi(v.contentDetails?.duration),
      });
    }
  }
  return video;
}

/**
 * Il video che corrisponde a un file di durata nota, o null se non e' uscito.
 *
 * ⚠️ La durata da sola non basta: il canale ha 285 video e in cinque anni una
 * durata di 6:15 ricapita. Al primo giro un video del 2023 si e' preso il posto
 * dello speciale sul noleggio sociale. Quindi si guarda anche la data: il video
 * deve essere uscito INTORNO a quando l'episodio era previsto.
 */
export const abbina = (video, durata, prevista, giorni = 25, tolleranza = 4) => {
  const giorno = 86400000;
  const centro = prevista ? new Date(`${prevista}T12:00:00Z`).getTime() : null;
  const vicini = video.filter((v) => {
    if (Math.abs(v.durata - durata) > tolleranza) return false;
    if (!centro) return true;
    return Math.abs(new Date(`${v.data}T12:00:00Z`).getTime() - centro) <= giorni * giorno;
  });
  if (!vicini.length) return null;
  return vicini.sort((a, b) => Math.abs(a.durata - durata) - Math.abs(b.durata - durata))[0];
};

/** Via accenti, punteggiatura e maiuscole: due titoli si somigliano o no. */
const piatto = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Il video che porta questo titolo, se c'e'.
 *
 * ⚠️ Piu' preciso della durata, e va provato per primo: il 29 agosto il Punto EV
 * durava 53 secondi esatti come lo Short dello speciale uscito lo stesso giorno,
 * e l'abbinamento a durata aveva preso quello sbagliato. Il titolo invece e'
 * quello che lo script di pubblicazione ha scritto su YouTube: combacia.
 */
export const abbinaTitolo = (video, titolo) => {
  if (!titolo) return null;
  const a = piatto(titolo);
  if (a.length < 12) return null;
  return video.find((v) => piatto(v.titolo) === a)
    || video.find((v) => piatto(v.titolo).startsWith(a.slice(0, 40)))
    || null;
};

/**
 * L'unico video di quel giorno che puo' essere una puntata della striscia:
 * dura fra 40 e 100 secondi e nessun altro episodio se l'e' gia' preso.
 *
 * Serve per le prime puntate, quelle di fine luglio, dove il titolo salvato in
 * casa non e' quello finito su YouTube: erano ancora scritti a mano.
 */
export const abbinaGiorno = (video, data, presi = new Set()) => {
  const g = video.filter((v) => v.data === data && v.durata >= 40 && v.durata <= 100
    && !presi.has(v.id) && !eUnoShort(v));
  return g.length === 1 ? g[0] : null;
};

/**
 * Uno Short non e' un episodio del podcast: e' il traino social di qualcos'altro,
 * dura meno di un minuto e in audio da solo non dice niente.
 * Si riconosce dall'hashtag, che sui verticali c'e' sempre.
 */
export const eUnoShort = (v) =>
  /#shorts?\b/i.test(v.titolo) || /#shorts?\b/i.test((v.descrizione || '').slice(0, 400));
