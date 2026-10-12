"""Diccionarios de las Sociedades Bíblicas Unidas en español (CC BY-SA 4.0) como módulos libres de la app.
Fuente: https://github.com/ubsicap/ubs-open-license (dictionaries/greek y dictionaries/hebrew, JSON en español).
Uso: python scripts/preparar-ubs-espanol.py <carpeta con griego-es.json, hebreo-es.json y LICENCIA-griego.md>
Agrega (o reemplaza) los módulos ubs-griego y ubs-hebreo en app/data/free-package sin tocar los demás.
CONSENSO-BIBLIAS.md: contenido de estudio en español para la edición de Google Play, licencia verificada.
"""
import gzip, hashlib, json, re, sys, unicodedata
from pathlib import Path

origen = Path(sys.argv[1])
destino = Path(__file__).resolve().parents[1] / 'app/data/free-package'
LIBROS = ['Gn', 'Éx', 'Lv', 'Nm', 'Dt', 'Jos', 'Jue', 'Rt', '1 S', '2 S', '1 R', '2 R', '1 Cr', '2 Cr', 'Esd', 'Neh', 'Est', 'Job', 'Sal', 'Pr', 'Ec', 'Cnt', 'Is', 'Jer', 'Lm', 'Ez', 'Dn', 'Os', 'Jl', 'Am', 'Abd', 'Jon', 'Miq', 'Nah', 'Hab', 'Sof', 'Hag', 'Zac', 'Mal', 'Mt', 'Mr', 'Lc', 'Jn', 'Hch', 'Ro', '1 Co', '2 Co', 'Gá', 'Ef', 'Fil', 'Col', '1 Ts', '2 Ts', '1 Ti', '2 Ti', 'Tit', 'Flm', 'He', 'Stg', '1 P', '2 P', '1 Jn', '2 Jn', '3 Jn', 'Jud', 'Ap']
# Partes de la oración: la fuente las trae en francés (griego) o en inglés (hebreo).
PALABRAS = {'verbe': 'verbo', 'nom': 'sustantivo', 'f.': 'femenino', 'm.': 'masculino', 'n.': 'neutro', 'm./f.': 'masculino o femenino',
            'm./n.': 'masculino o neutro', 'f./n.': 'femenino o neutro', 'adjc.': 'adjetivo', 'advb.': 'adverbio', 'conj.': 'conjunción',
            'prep.': 'preposición', 'gen.': 'genitivo', 'acc.': 'acusativo', 'dat.': 'dativo', 'part.': 'partícula', 'pdem.': 'pronombre demostrativo',
            'pirg.': 'pronombre interrogativo', 'pprs.': 'pronombre personal', 'prel.': 'pronombre relativo', 'ppos.': 'pronombre posesivo',
            'prfl.': 'pronombre reflexivo', 'pidf.': 'pronombre indefinido', 'prec.': 'pronombre recíproco', 'intj.': 'interjección',
            'anum.': 'adjetivo numeral', 'artc.': 'artículo'}
HEBREO = {'noun m': 'sustantivo masculino', 'name': 'nombre propio', 'verb': 'verbo', 'noun f': 'sustantivo femenino', 'adj': 'adjetivo',
          'noun c': 'sustantivo común', 'adv': 'adverbio', 'noun': 'sustantivo', 'intj': 'interjección', 'inter': 'interrogativo',
          'pers.pron': 'pronombre personal', 'dem.pron': 'pronombre demostrativo', 'conj': 'conjunción', 'prep': 'preposición',
          'noun f pl': 'sustantivo femenino plural', 'neg': 'negación', 'inter.pron': 'pronombre interrogativo', 'noun m du': 'sustantivo masculino dual',
          'noun m pl': 'sustantivo masculino plural', '': ''}

def parte(p):
    if p in HEBREO: return HEBREO[p]
    p = p.replace('emprunt araméen', 'préstamo arameo').replace('suivi par inf.', 'seguido de infinitivo').replace('avec', 'con').replace(' ou ', ' o ')
    return re.sub(r'[A-Za-zé./]+', lambda m: PALABRAS.get(m.group(0), m.group(0)), p)

def cita(codigo):
    m = re.match(r'(\d{3})(\d{3})(\d{3})', codigo or '')
    if not m: return ''
    b, c, v = (int(x) for x in m.groups())
    return f'{LIBROS[b - 1]} {c}:{v}' if 1 <= b <= 66 else ''

def limpiar(t):
    t = re.sub(r'\{L:([^<}]*)<[^>]*>\}', r'\1', t or '')
    t = re.sub(r'\{S:(\d+)\}', lambda m: cita(m.group(1)), t)
    t = re.sub(r'\{N:\d+\}', '', t)
    t = re.sub(r'\{A:([^}]*)\}', r'\1', t)
    t = re.sub(r'\{D:([^}]*)\}', r'el dominio semántico \1', t)
    t = re.sub(r'\{[A-Z]:([^}]*)\}', r'\1', t)  # cualquier otra marca: queda solo su texto
    return re.sub(r'[ \t]+', ' ', t).strip()

def rtf(s): return '{\\rtf1\\ansi ' + s.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', '\\par ') + '}'

def entrada(e, nombre_fuente):
    lineas = [e['Lemma']]
    for b in e.get('BaseForms') or []:
        partes = ', '.join(x for x in (parte(p) for p in b.get('PartsOfSpeech') or []) if x)
        if partes: lineas.append(partes)
        n = 0
        for m in b.get('LEXMeanings') or []:
            for s in m.get('LEXSenses') or []:
                if s.get('LanguageCode') != 'es': continue
                definicion = limpiar(s.get('DefinitionShort') or s.get('DefinitionLong'))
                glosas = [limpiar(g) for g in s.get('Glosses') or [] if limpiar(g)]
                if not definicion and not glosas: continue
                n += 1
                lineas.append(f'{n}. ' + (definicion or ', '.join(glosas)))
                if definicion and glosas: lineas.append('   Glosas: ' + ', '.join(dict.fromkeys(glosas)))
                refs = [r for r in dict.fromkeys(cita(x) for x in m.get('LEXReferences') or []) if r]
                if refs: lineas.append('   Citas: ' + ', '.join(refs[:8]) + (f' (y {len(refs) - 8} más)' if len(refs) > 8 else ''))
    lineas.append('Fuente: ' + nombre_fuente + ' · Sociedades Bíblicas Unidas · CC BY-SA 4.0')
    # NFC: la fuente usa acentos griegos «oxia» (U+1F71…); la forma estándar coincide con lo que escribe el lector.
    return unicodedata.normalize('NFC', '\n'.join(lineas))

def modulo(id, archivo, titulo, abreviatura, nombre_fuente, prefijos):
    crudo = (origen / archivo).read_bytes()
    datos = json.loads(crudo.decode('utf-8'))
    por_codigo = {}
    for e in datos:
        texto = entrada(e, nombre_fuente)
        if texto.count('\n') < 2: continue  # sin ningún sentido en español
        for c in e.get('StrongCodes') or []:
            m = re.fullmatch(r'([GHA])0*(\d+)', c)
            if not m or m.group(1) not in prefijos: continue
            tema = ('H' if m.group(1) == 'A' else m.group(1)) + m.group(2)  # el arameo usa los mismos números H de Strong
            por_codigo.setdefault(tema, []).append(texto)
    registros = [[t, rtf('\n\n'.join(dict.fromkeys(v)))] for t, v in sorted(por_codigo.items(), key=lambda x: (x[0][0], int(x[0][1:])))]
    carga = gzip.compress(json.dumps(registros, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    (destino / (id + '.json.gz')).write_bytes(carga)
    aviso = (f'{nombre_fuente} © Sociedades Bíblicas Unidas. Licencia Creative Commons Atribución-CompartirIgual 4.0 (CC BY-SA 4.0): '
             'https://creativecommons.org/licenses/by-sa/4.0/. Fuente: https://github.com/ubsicap/ubs-open-license.\n'
             'Cambios hechos por Biblioteca Bíblica: se tomó solo el español; se agrupó por número Strong (el arameo con los números H); '
             'se tradujeron al español los nombres de las partes de la oración; las citas codificadas se escribieron con abreviaturas en español '
             '(hasta 8 por sentido); se quitaron las marcas de notas. Este módulo derivado se distribuye con la misma licencia CC BY-SA 4.0. '
             'Las Sociedades Bíblicas Unidas no avalan la app.')
    return dict(id=id, tipo='diccionario', rol='diccionario', archivo=id + '.dctx', titulo=titulo, abreviatura=abreviatura, publico=True, iaPermitida=True,
                atribucion=f'{nombre_fuente} © Sociedades Bíblicas Unidas · CC BY-SA 4.0. Adaptación a SQLite/RTF (solo español, por número Strong). Sin aval de las SBU a la app.',
                licenciaUrl='https://creativecommons.org/licenses/by-sa/4.0/', licencia='CC BY-SA 4.0 · © Sociedades Bíblicas Unidas',
                origen='https://github.com/ubsicap/ubs-open-license/tree/main/dictionaries', versificacion='Números Strong (griego G, hebreo y arameo H)',
                dataFile=id + '.json.gz', dataSha256=hashlib.sha256(carga).hexdigest(), upstreamSha256=hashlib.sha256(crudo).hexdigest(),
                registros=len(registros), sourceNotice=aviso)

nuevos = [
    modulo('ubs-griego', 'griego-es.json', 'Sociedades Bíblicas · Griego del NT (español)', 'UBSG', 'Diccionario del griego del Nuevo Testamento (UBS Greek NT Dictionary v1.0)', 'G'),
    modulo('ubs-hebreo', 'hebreo-es.json', 'Sociedades Bíblicas · Hebreo y arameo (español)', 'UBSH', 'Diccionario del hebreo bíblico (UBS Dictionary of Biblical Hebrew v0.9.3)', 'HA'),
]
(destino / 'UBS-LICENCIA.txt').write_text((origen / 'LICENCIA-griego.md').read_text(encoding='utf-8'), encoding='utf-8')
manifiesto = json.loads((destino / 'manifest.json').read_text(encoding='utf-8'))
otros = [m for m in manifiesto['modulos'] if m['id'] not in ('ubs-griego', 'ubs-hebreo')]
# Los diccionarios en español van antes que STEP (inglés): son los que la app ofrece primero.
i = next((k for k, m in enumerate(otros) if m['tipo'] == 'diccionario'), len(otros))
manifiesto['modulos'] = otros[:i] + nuevos + otros[i:]
(destino / 'manifest.json').write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding='utf-8')
print([(m['id'], m['registros'], round(len((destino / m['dataFile']).read_bytes()) / 1048576, 2)) for m in nuevos])
