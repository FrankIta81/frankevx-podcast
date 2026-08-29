# IL PUNTO EV — il podcast

Il canale YouTube, in audio, su Spotify e su tutte le app dei podcast.
**Nessun caricamento a mano**: gli episodi esistono già, qui se ne prende l'audio
e si riscrive il feed RSS che le piattaforme leggono da sole.

    https://frankita81.github.io/frankevx-podcast/feed.xml

## Come funziona

| passo | chi lo fa |
|---|---|
| la striscia quotidiana | **da sola**, ogni sera alle 21:30 (`.github/workflows/aggiorna.yml`) |
| gli speciali | **a mano dal Mac**, dopo la pubblicazione su YouTube |

```bash
node scripts/raccogli.mjs            # le puntate del Punto EV che mancano
node scripts/aggiungi-speciali.mjs   # gli speciali usciti (video 16:9 dalla scrivania)
node scripts/genera-feed.mjs         # riscrive feed.xml
```

## La regola che tiene in piedi tutto

⚠️ **Il canale YouTube è la fonte di verità.** Titolo, descrizione e data di
ogni episodio si prendono da lì, non dai file di lavorazione. Le cartelle e le
release hanno la data *prevista* e il titolo *di lavorazione*, e quasi sempre
cambiano: lo speciale sui prezzi in cartella si chiama «STESSA PRESA» ed era
datato 29/08, su YouTube è uscito come «Quanto costa DAVVERO ricaricare l'auto
elettrica?»; il Cybercab, previsto per il 1° settembre, è uscito il 27 agosto.

Ne discende il resto:
- **quello che sul canale non c'è, non è uscito** e non entra nel podcast. È così
  che le release di prova (`-prova`, `-v2`, `-2`) restano fuori da sole;
- **una puntata per giornata**: fra i rifacimenti dello stesso giorno vince quello
  riconosciuto sul canale;
- l'aggancio si fa **per titolo**, non per durata. ⚠️ La durata sembra comoda e non
  lo è: i notiziari stanno tutti fra 50 e 85 secondi, e il 29 agosto la puntata si
  era agganciata allo Short di uno speciale che durava uguale.

## ⚠️ Il GUID non si tocca mai

È il numero di targa dell'episodio. Se cambia, le app lo mostrano come episodio
**nuovo** e chi ascolta se lo ritrova due volte. Di norma è il tag della release.

I **sette episodi che erano già su Spotify** (sei del febbraio 2025 e lo speciale
sul noleggio sociale) portano il guid che avevano su anchor.fm, ripreso tale e
quale da `scripts/importa-anchor.mjs`: è l'unica cosa che dice a Spotify «questo
ce l'hai già». Stessa ragione per `pubDate`, che conserva l'ora originale.

## Il passaggio a Spotify

Il podcast oggi è ospitato su Spotify for Creators. Per spostarlo qui senza
perdere iscritti e ascolti si usa il **reindirizzamento RSS 301** dal pannello di
Spotify for Creators, incollando l'indirizzo qui sopra alla voce *URL del nuovo
host*. Il passaggio è **definitivo** e può richiedere fino a 7 giorni.

## Le copertine

`python3 scripts/copertine.py` — la miniatura del video **intera** dentro un
quadrato 1400×1400, su un fondo ricavato sfocando la miniatura stessa.

⚠️ **Non si ritaglia.** Le miniature sono 9:16 (la striscia) o 16:9 (gli
speciali) e le app dei podcast vogliono un quadrato: un taglio centrale perde
metà del testo — sulle copertine degli speciali il viso sta da una parte e la
scritta dall'altra, e ne butterebbe via una.

Chi non ha miniatura tiene quella del programma (`copertina-podcast.jpg`, 3000×3000).

## Cosa serve

- `gh` autenticato, per scaricare le release di `punto-ev-media`
- `ffmpeg` e `ffprobe`
- le credenziali YouTube di `~/Progetti/frankevx-speciali/.secrets/`
  (in GitHub Actions arrivano dai segreti `YT_CLIENT_SECRET` e `YT_TOKEN`)
