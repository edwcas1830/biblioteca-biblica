"""Build only open factual metadata, never photos, OSM shapes or Bible quotations.
Usage: python scripts/prepare-graphics.py ../../work/v06-data
"""
import csv, gzip, hashlib, json, re, sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / 'app/data'
date = '2026-10-09'
osis = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split()
names = dict(zip('Aaron Adam Eve Noah Abraham Isaac Jacob Joseph Moses Joshua Samuel Saul David Solomon Elijah Elisha Isaiah Jeremiah Ezekiel Daniel Jesus Mary Peter Paul John Jerusalem Bethlehem Nazareth Jericho Capernaum Egypt Damascus Galilee Babylon'.split(), 'Aarón Adán Eva Noé Abraham Isaac Jacob José Moisés Josué Samuel Saúl David Salomón Elías Eliseo Isaías Jeremías Ezequiel Daniel Jesús María Pedro Pablo Juan Jerusalén Belén Nazaret Jericó Capernaúm Egipto Damasco Galilea Babilonia'.split()))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(folder, data, title, author, license, url, inputs, changes):
    folder = target / folder
    folder.mkdir(parents=True, exist_ok=True)
    payload = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    (folder / 'data.json.gz').write_bytes(payload)
    manifest = dict(title=title, author=author, license=license, source=url, date=date, file='data.json.gz', sha256=hashlib.sha256(payload).hexdigest(), changes=changes, inputs=[dict(file=p.name, sha256=sha(p)) for p in inputs])
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(folder.name, len(payload))
def label(s):
    base=re.sub(r" \d+$", "", s)
    return names.get(base, base)+s[len(base):]

modern = {r['id']: r for r in map(json.loads, (source/'modern.jsonl').read_text('utf8').splitlines())}
places, chapters = {}, {}
for r in map(json.loads, (source/'ancient.jsonl').read_text('utf8').splitlines()):
    candidates = sorted(r.get('modern_associations', {}).items(), key=lambda p:p[1].get('score', 0), reverse=True)
    # Preserve the preferred identification even when its coordinates cannot be distributed here.
    best = modern.get(candidates[0][0], {}) if candidates else {}
    point = None
    if best.get('lonlat') and best.get('coordinates_source', {}).get('type') != 'osm':
        x,y = map(float,best['lonlat'].split(','))
        if -180 <= x <= 180 and -90 <= y <= 90: point=[round(x,4),round(y,4)]
    refs = []
    for v in r.get('verses', []):
        m = re.fullmatch(r'([\w]+)\.(\d+)\.(\d+)', v['osis'])
        if m and m[1] in osis:
            ref=[osis.index(m[1]), int(m[2]), int(m[3])]; refs.append(ref)
            key=f'{ref[0]}:{ref[1]}'
            if r['id'] not in chapters.setdefault(key,[]): chapters[key].append(r['id'])
    places[r['id']]=dict(id=r['id'], name=label(r['friendly_id']), original=r['friendly_id'], point=point, alternatives=len(candidates), precision=best.get('precision'), coordinateSource=best.get('coordinates_source'), refs=refs, url='https://www.openbible.info/geo/'+r['url_slug'])
save('atlas', dict(places=places, chapters=chapters), 'Lugares bíblicos', 'OpenBible.info', 'CC BY 4.0', 'https://github.com/openbibleinfo/Bible-Geocoding-Data', [source/'ancient.jsonl',source/'modern.jsonl'], 'Índice por capítulo; nombres españoles editoriales de lugares frecuentes; identificación preferida sin afirmar certeza. Sin imágenes, geometrías OSM ni coordenadas procedentes de OSM.')
(target/'atlas/LICENSE.txt').write_bytes((source/'geo-license.txt').read_bytes())
geo=json.loads((source/'ne-land.geojson').read_text('utf8'))
save('natural-earth', geo, 'Mapa base simplificado de tierras', 'Natural Earth', 'Dominio público', 'https://www.naturalearthdata.com/about/terms-of-use/', [source/'ne-land.geojson'], 'Natural Earth 1:110m, sin fronteras políticas; proyección equirectangular para orientación, no navegación.')

base=source/'bibledata'
def rows(kind): return list(csv.DictReader((base/f'BibleData-{kind}.csv').open(encoding='utf-8-sig',newline='')))
bookids={r['usx_code']:int(r['christian_sequence'])-1 for r in rows('Book')}
def reference(s):
    m=re.match(r'([A-Z0-9]+) (\d+):(\d+)',s)
    return [bookids[m[1]],int(m[2]),int(m[3])] if m and m[1] in bookids else None
people={r['person_id']:label(r['person_name']) for r in rows('Person')}
events=[dict(id=r['event_id'], name=r['event_name'], person=people.get(r['person_id'],''), year=r['event_year_ah'], bce=r['bce_year'], ref=reference(r['event_reference_id']), calculation=r['event_year_calculation'], notes=r['event_notes']) for r in rows('Event')]
epochs=[dict(id=r['epoch_id'], name=r['epoch_name'], person=people.get(r['person_id'],''), personId=r['person_id'], kind=r['epoch_type'], start=r['start_year_ah'], end=r['end_year_ah'], ref=reference(r['start_year_reference_id']), notes=r['epoch_notes']) for r in rows('Epoch')]
personChapters={}
for r in rows('PersonVerse'):
    ref=reference(r['reference_id'])
    if ref and r['person_id'] not in personChapters.setdefault(f'{ref[0]}:{ref[1]}',[]):personChapters[f'{ref[0]}:{ref[1]}'].append(r['person_id'])
save('bibledata',dict(events=events,epochs=epochs,personChapters=personChapters), 'Cronología, reyes y profetas', 'Brady Stephenson · BibleData', 'CC BY 4.0', 'https://github.com/BradyStephenson/bible-data', [base/f'BibleData-{n}.csv' for n in ['Book','Event','Epoch','Person','PersonVerse']], 'Metadatos cronológicos AH y referencias; no incluye citas bíblicas del conjunto. Fechas e hipótesis de esta fuente, no consenso histórico; nombres originales conservados.')
(target/'bibledata/LICENSE.txt').write_bytes((base/'LICENSE').read_bytes())
people={}
for r in json.loads((source/'people.json').read_text('utf8')):
    f=r['fields']; people[r['id']]=dict(id=r['id'],name=label(f['name']),original=f['name'],lookup=f['personLookup'],description=f.get('displayTitle',''),ambiguous=bool(f.get('ambiguous')),**{k:f.get(k,[]) for k in ['father','mother','partners','children','siblings']})
save('theographic',dict(people=people), 'Personas y genealogías · módulo separado', 'Robert Rouse · Theographic', 'CC BY-SA 4.0', 'https://github.com/robertrouse/theographic-bible-metadata', [source/'people.json'], 'Adaptación de nombres y relaciones en un módulo independiente bajo CC BY-SA 4.0. Excluye diccionarios, citas, imágenes y fechas no verificadas. Las relaciones y homónimos siguen la fuente.')
(target/'theographic/LICENSE.txt').write_bytes((source/'theographic-LICENSE').read_bytes())
