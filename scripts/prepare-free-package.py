"""Reproducible, licensed data-only public modules; no private e-Sword files.
python scripts/prepare-free-package.py ../../work/v06-data
"""
import gzip,hashlib,json,re,sys,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import quote
source=Path(sys.argv[1]);target=Path(__file__).resolve().parents[1]/'app/data/free-package';target.mkdir(parents=True,exist_ok=True)
usx='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split()
class Plain(HTMLParser):
 def __init__(self):super().__init__();self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ['br','p','h1','h2','h3','li']:self.parts.append('\n')
 def handle_data(self,data):self.parts.append(data)
def plain(s):
 p=Plain();p.feed(s);return ''.join(p.parts).strip()
def rtf(s):return '{\\rtf1\\ansi '+s.replace('\\','\\\\').replace('{','\\{').replace('}','\\}').replace('\n','\\par ')+'}'
modules=[]
attributions={'onbv2008': 'Biblica® Open Nueva Biblia Viva™ · Copyright © 2006, 2008 Biblica, Inc. El original está disponible gratuitamente en www.biblica.com y open.bible. Adaptación de formato SQLite/RTF sin revisar la redacción; conserva rangos unidos y numeración. Sin aval de Biblica a la app.', 'step-greek': 'STEPBible.org / Tyndale House Cambridge · TBESG. Adaptación a SQLite/RTF; conserva lemas, variantes extendidas, transliteración y definiciones en inglés. Sin aval a la app.', 'step-hebrew': 'STEPBible.org / Tyndale House Cambridge · TBESH. Adaptación a SQLite/RTF; conserva lemas y glosas en inglés. Excluye definiciones BDB/Online Bible. Sin aval a la app.'}
def write(id,kind,title,abbr,data,license,url,raw,notice):
 payload=gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0);file=id+'.json.gz';(target/file).write_bytes(payload)
 modules.append(dict(id=id,tipo=kind,rol='version' if kind=='biblia' else 'diccionario',archivo=id+('.bblx' if kind=='biblia' else '.dctx'),titulo=title,abreviatura=abbr,publico=True,iaPermitida=True,atribucion=attributions[id],licenciaUrl="https://creativecommons.org/licenses/"+("by-sa" if id=="onbv2008" else "by")+"/4.0/",licencia=license,origen=url,versificacion='Canon protestante; conserva numeración y rangos unidos de la fuente' if kind=='biblia' else 'Números Strong; variantes extendidas conservadas en cada entrada',dataFile=file,dataSha256=hashlib.sha256(payload).hexdigest(),upstreamSha256=hashlib.sha256(raw).hexdigest(),registros=len(data),sourceNotice=notice))
z=zipfile.ZipFile(source/'nbv-vpl.zip');raw=z.read('spaonbv_vpl.xml');rows=[];merged=0
for v in ET.fromstring(raw):
 numbers=v.attrib['v'].split('-');start=int(numbers[0]);end=int(numbers[-1]);text=''.join(v.itertext()).strip()
 rows.append([usx.index(v.attrib['b'])+1,int(v.attrib['c']),start,end,rtf(text)])
 if end>start:merged+=1
copyright=plain(z.read('spaonbv_about.htm').decode('utf-8-sig'));(target/'ONBV-LICENCIA.txt').write_text(copyright,encoding='utf8')
write('onbv2008','biblia','Biblica® Open Nueva Biblia Viva 2008','ONBV',rows,'CC BY-SA 4.0 · © 2006, 2008 Biblica, Inc.','https://ebible.org/Bible/details.php?id=spaonbv',raw,copyright+'\nThe original Work by its copyright holders is available for free at www.biblica.com and open.bible.\nAdaptación de formato a SQLite/RTF, sin revisar la redacción. Conserva '+str(merged)+' rangos unidos y numeración de la fuente. El VPL oficial ya excluye notas, títulos y formato. Módulo separado CC BY-SA 4.0. No hay aval de Biblica a la app.')
for lang,code in [('greek','TBESG'),('hebrew','TBESH')]:
 raw=(source/f'step-{lang}.txt').read_bytes();lines=raw.decode('utf-8-sig').splitlines();entries=[]
 for line in lines:
  cols=line.split('\t')
  if len(cols)<8 or not re.fullmatch('[HG]\\d{4}',cols[0]):continue
  topic=cols[0][0]+str(int(cols[0][1:]));definition=cols[3]+'\nTransliteración: '+cols[4]+'\nGlosa (inglés): '+cols[6]+'\nIdentificador extendido: '+cols[1]+'\nMorfología de la fuente: '+cols[5]
  if lang=='greek':definition+='\n'+plain(cols[7])
  else:definition+='\nLas definiciones BDB/Online Bible no se incluyen: el encabezado pide permiso adicional.'
  entries.append([topic,rtf(definition)])
 header='\n'.join(lines[:next((i for i,l in enumerate(lines) if re.match('[HG]\\d{4}\\t',l)),60)])
 (target/f'STEP-{lang}-FUENTE.txt').write_text(header,encoding='utf8')
 filename=f'{code} - Translators Brief lexicon of Extended Strongs for '+('Greek' if lang=='greek' else 'Hebrew')+' - STEPBible.org CC BY.txt'
 write('step-'+lang,'diccionario','STEPBible · '+('Griego (definiciones en inglés)' if lang=='greek' else 'Hebreo / arameo (lemas y glosas)'),code,entries,'CC BY 4.0 · STEPBible.org / Tyndale House Cambridge','https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/'+quote(filename),raw,header+'\nAdaptación a texto RTF seguro; conserva variantes extendidas, transliteración y glosa en inglés. '+('Incluye definiciones griegas.' if lang=='greek' else 'Excluye definiciones BDB/Online Bible por el aviso específico del encabezado.'))
(target/'manifest.json').write_text(json.dumps(dict(paquete='libre',fecha='2026-10-09',modulos=modules),ensure_ascii=False,indent=2),encoding='utf8')
print([(m['id'],m['registros']) for m in modules], 'rangos NBV',merged)
