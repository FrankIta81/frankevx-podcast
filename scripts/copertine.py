#!/usr/bin/env python3
"""Fa la copertina quadrata di ogni episodio.

PERCHE NON BASTA RITAGLIARE
Le miniature dei video sono 9:16 (la striscia) o 16:9 (gli speciali), le app dei
podcast vogliono un quadrato. Un ritaglio centrale perde meta' del testo: sulle
copertine degli speciali il viso sta da una parte e la scritta dall'altra, e il
taglio ne butterebbe via una. Quindi la miniatura ci sta DENTRO tutta, su un
fondo che riprende i suoi colori: non si perde niente e non stona.

USO
  python3 scripts/copertine.py            solo quelle che mancano
  python3 scripts/copertine.py --tutte    rifa' tutto
"""
import json, sys, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageFilter

RADICE = Path(__file__).resolve().parent.parent
LATO = 1400                      # il minimo che Apple e Spotify accettano
TUTTE = '--tutte' in sys.argv

SPECIALI = Path.home() / 'Desktop' / 'FRANKEVX' / '1 - SPECIALI'
(RADICE / 'copertine').mkdir(exist_ok=True)


def quadra(img: Image.Image) -> Image.Image:
    """La miniatura intera al centro, sopra una sua versione sfocata e allargata.

    Il fondo nasce dall'immagine stessa: le fasce prendono i suoi colori invece
    di essere due barre nere: si legge come una copertina, non come un ritaglio
    male impaginato.
    """
    img = img.convert('RGB')
    l, a = img.size

    scala = LATO / min(l, a)
    fondo = img.resize((int(l * scala) + 2, int(a * scala) + 2), Image.LANCZOS)
    x, y = (fondo.width - LATO) // 2, (fondo.height - LATO) // 2
    fondo = fondo.crop((x, y, x + LATO, y + LATO)).filter(ImageFilter.GaussianBlur(48))
    fondo = Image.blend(fondo, Image.new('RGB', fondo.size, (6, 14, 18)), 0.45)

    dentro = LATO * 0.92 / max(l, a)
    davanti = img.resize((round(l * dentro), round(a * dentro)), Image.LANCZOS)
    fondo.paste(davanti, ((LATO - davanti.width) // 2, (LATO - davanti.height) // 2))
    return fondo


def sorgente(ep: dict) -> Path | None:
    """La miniatura del video: dalla release per la striscia, dalla cartella per gli speciali."""
    if ep['tipo'] == 'punto-ev':
        with tempfile.TemporaryDirectory() as t:
            r = subprocess.run(['gh', 'release', 'download', ep['tag'], '--repo',
                                'FrankIta81/punto-ev-media', '--pattern', 'copertina.png',
                                '--dir', t, '--clobber'], capture_output=True)
            f = Path(t) / 'copertina.png'
            if r.returncode or not f.exists():
                return None
            fuori = RADICE / '.temp' / f'{ep["tag"]}.png'
            fuori.parent.mkdir(exist_ok=True)
            fuori.write_bytes(f.read_bytes())
            return fuori

    if ep['tipo'] == 'speciale':
        for c in sorted(SPECIALI.iterdir()):
            if not c.is_dir() or ep['data'][-5:] not in c.name and ep['tag'][-10:] not in c.name:
                continue
            for f in sorted(c.rglob('*.png')):
                if 'miniatura' in f.name.lower() or 'copertina' in f.name.lower():
                    return f
    return None


fatte = mancate = 0
for f in sorted((RADICE / 'episodi').glob('*.json')):
    ep = json.loads(f.read_text())
    dove = RADICE / 'copertine' / f'{ep["tag"]}.jpg'
    if dove.exists() and not TUTTE:
        continue

    src = sorgente(ep)
    if not src:
        mancate += 1
        continue

    quadra(Image.open(src)).save(dove, 'JPEG', quality=86, optimize=True)
    ep['copertina'] = f'copertine/{ep["tag"]}.jpg'
    f.write_text(json.dumps(ep, ensure_ascii=False, indent=1) + '\n')
    fatte += 1
    print(f'  ✓ {ep["data"]}  {dove.stat().st_size // 1024} KB  {ep["titolo"][:50]}')

print(f'\n  {fatte} copertine fatte' + (f' · {mancate} episodi senza miniatura (resta quella del programma)' if mancate else '') + '\n')
