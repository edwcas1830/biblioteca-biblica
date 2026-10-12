(function(root){
  'use strict';
  // «Hoy» (CONSENSO-HABITO.md, entrega 2B): versículo del día, 4 pasos cortos (Conexión, Versículo, Devoción,
  // Oración) y el registro de los días. Todo es local: no hay red ni IA aquí. Viaja en state.hoy.
  const LIBROS=['Génesis','Éxodo','Levítico','Números','Deuteronomio','Josué','Jueces','Rut','1 Samuel','2 Samuel','1 Reyes','2 Reyes','1 Crónicas','2 Crónicas','Esdras','Nehemías','Ester','Job','Salmos','Proverbios','Eclesiastés','Cantares','Isaías','Jeremías','Lamentaciones','Ezequiel','Daniel','Oseas','Joel','Amós','Abdías','Jonás','Miqueas','Nahúm','Habacuc','Sofonías','Hageo','Zacarías','Malaquías','Mateo','Marcos','Lucas','Juan','Hechos','Romanos','1 Corintios','2 Corintios','Gálatas','Efesios','Filipenses','Colosenses','1 Tesalonicenses','2 Tesalonicenses','1 Timoteo','2 Timoteo','Tito','Filemón','Hebreos','Santiago','1 Pedro','2 Pedro','1 Juan','2 Juan','3 Juan','Judas','Apocalipsis'];
  // Un versículo por fecha del calendario (366, con el 29 de febrero), elegidos a mano. El 1 de enero abre con
  // «nuevas son cada mañana», diciembre lleva la Navidad (20 al 26) y el 31 cierra con «hago nuevas todas las cosas».
  const VERSICULOS=[
    // Enero
    'Lamentaciones 3:22-23','Jeremías 29:11','Filipenses 4:13','Romanos 8:28','Proverbios 3:5-6','Isaías 41:10','Salmos 23:1','Mateo 11:28','Josué 1:9','Filipenses 4:6-7',
    '2 Timoteo 1:7','Salmos 46:1','Isaías 40:31','Romanos 12:2','Mateo 6:33','Gálatas 5:22-23','Hebreos 11:1','2 Corintios 5:17','Juan 14:6','Efesios 2:8-9',
    'Salmos 119:105','1 Corintios 13:4-5','Romanos 5:8','Proverbios 16:3','Salmos 37:4','Juan 3:16','Juan 16:33','1 Pedro 5:7','Mateo 28:19-20','Salmos 27:1','Isaías 26:3',
    // Febrero
    'Santiago 1:5','Hebreos 13:5','Romanos 15:13','Juan 15:5','Salmos 34:8','Miqueas 6:8','Mateo 5:16','Colosenses 3:23','1 Juan 4:19','Salmos 16:11',
    'Proverbios 4:23','Efesios 4:32','2 Corintios 12:9','Juan 10:10','Isaías 43:2','Deuteronomio 31:6','Salmos 121:1-2','Mateo 6:34','1 Tesalonicenses 5:16-18','Romanos 10:9',
    'Hebreos 12:1-2','Salmos 51:10','Juan 1:1','Juan 1:12','Gálatas 2:20','Efesios 3:20','Salmos 139:14','Proverbios 18:10','Isaías 53:5',
    // Marzo
    '1 Juan 1:9','Mateo 7:7','Santiago 1:2-3','Romanos 8:38-39','Salmos 91:1-2','Josué 24:15','2 Crónicas 7:14','Salmos 103:2','Isaías 55:8-9','Juan 14:27',
    'Mateo 22:37-39','Filipenses 1:6','Colosenses 3:2','Hebreos 4:16','1 Corintios 10:13','Salmos 19:14','Proverbios 22:6','Juan 8:32','Romanos 6:23','Efesios 6:10-11',
    'Salmos 62:5','Sofonías 3:17','Nahúm 1:7','Habacuc 3:17-18','Isaías 9:6','Lucas 1:37','Mateo 5:14','Juan 13:34-35','1 Pedro 2:9','Salmos 118:24','Romanos 12:12',
    // Abril
    'Gálatas 6:9','Efesios 5:1-2','Filipenses 4:8','Colosenses 3:15','1 Timoteo 4:12','2 Timoteo 3:16-17','Tito 3:5','Hebreos 10:23','Santiago 4:8','1 Pedro 1:3',
    '2 Pedro 3:9','1 Juan 4:7-8','Apocalipsis 21:4','Apocalipsis 3:20','Salmos 1:1-2','Salmos 4:8','Salmos 5:3','Salmos 8:3-4','Salmos 9:10','Salmos 18:2',
    'Salmos 25:4-5','Salmos 30:5','Salmos 32:8','Salmos 33:18','Salmos 34:18','Salmos 37:5','Salmos 40:1','Salmos 42:11','Salmos 55:22','Salmos 56:3',
    // Mayo
    'Salmos 63:1','Salmos 73:26','Salmos 84:11','Salmos 86:5','Salmos 90:12','Salmos 95:6','Salmos 100:4-5','Salmos 107:1','Salmos 112:7','Salmos 116:1',
    'Salmos 119:11','Salmos 121:7-8','Salmos 126:5','Salmos 127:1','Salmos 133:1','Salmos 138:8','Salmos 143:8','Salmos 145:18','Salmos 147:3','Salmos 150:6',
    'Proverbios 1:7','Proverbios 2:6','Proverbios 3:7','Proverbios 10:12','Proverbios 11:25','Proverbios 12:25','Proverbios 15:1','Proverbios 16:9','Proverbios 17:17','Proverbios 19:21','Proverbios 27:17',
    // Junio
    'Proverbios 31:30','Eclesiastés 3:1','Eclesiastés 4:9-10','Isaías 1:18','Isaías 12:2','Isaías 30:15','Isaías 30:21','Isaías 40:8','Isaías 40:29','Isaías 43:18-19',
    'Isaías 49:15','Isaías 54:10','Isaías 58:11','Isaías 60:1','Isaías 61:1','Isaías 64:8','Jeremías 17:7','Jeremías 31:3','Jeremías 32:17','Jeremías 33:3',
    'Ezequiel 36:26','Joel 2:13','Malaquías 3:10','Zacarías 4:6','Génesis 1:1','Génesis 1:27','Génesis 12:2','Génesis 28:15','Génesis 50:20','Éxodo 14:14',
    // Julio
    'Éxodo 15:2','Éxodo 33:14','Números 6:24-26','Deuteronomio 6:5','Deuteronomio 7:9','Deuteronomio 30:19','Josué 1:8','Rut 1:16','1 Samuel 16:7','1 Samuel 12:24',
    '2 Samuel 22:31','1 Reyes 8:56','1 Crónicas 16:11','1 Crónicas 29:11','Nehemías 8:10','Ester 4:14','Job 19:25','Job 42:2','Mateo 4:4','Mateo 5:6',
    'Mateo 5:8','Mateo 5:9','Mateo 5:44','Mateo 6:6','Mateo 6:9','Mateo 6:21','Mateo 7:12','Mateo 7:24','Mateo 9:37','Mateo 10:31','Mateo 16:24',
    // Agosto
    'Mateo 17:20','Mateo 18:20','Mateo 19:26','Mateo 24:35','Mateo 25:40','Marcos 1:35','Marcos 9:23','Marcos 10:45','Marcos 11:24','Marcos 12:31',
    'Lucas 2:11','Lucas 6:31','Lucas 6:38','Lucas 12:32','Lucas 15:7','Lucas 19:10','Lucas 23:34','Lucas 24:6','Juan 3:30','Juan 4:14',
    'Juan 6:35','Juan 7:38','Juan 8:12','Juan 10:11','Juan 10:27','Juan 11:25','Juan 14:1','Juan 14:2','Juan 14:15','Juan 14:26','Juan 15:12',
    // Septiembre
    'Juan 15:13','Juan 15:16','Juan 17:17','Juan 20:29','Juan 20:31','Hechos 1:8','Hechos 2:42','Hechos 4:12','Hechos 16:31','Hechos 20:35',
    'Romanos 1:16','Romanos 3:23','Romanos 5:1','Romanos 5:3','Romanos 8:1','Romanos 8:18','Romanos 8:26','Romanos 8:31','Romanos 10:17','Romanos 12:1',
    'Romanos 12:10','Romanos 12:21','Romanos 13:8','Romanos 14:8','1 Corintios 2:9','1 Corintios 6:19','1 Corintios 13:13','1 Corintios 15:57','1 Corintios 15:58','1 Corintios 16:14',
    // Octubre
    '2 Corintios 1:3','2 Corintios 4:16','2 Corintios 4:18','2 Corintios 5:7','2 Corintios 9:7','2 Corintios 10:5','Gálatas 5:1','Gálatas 5:13','Gálatas 6:2','Efesios 1:3',
    'Efesios 2:10','Efesios 3:16','Efesios 4:2','Efesios 4:29','Efesios 6:18','Filipenses 1:21','Filipenses 2:3','Filipenses 2:13','Filipenses 3:14','Filipenses 4:4',
    'Filipenses 4:11','Filipenses 4:19','Colosenses 1:17','Colosenses 2:7','Colosenses 3:12','Colosenses 3:13','Colosenses 3:16','Colosenses 4:2','1 Tesalonicenses 5:11','2 Tesalonicenses 3:3','1 Timoteo 6:6',
    // Noviembre
    '1 Timoteo 6:12','2 Timoteo 2:15','2 Timoteo 4:7','Hebreos 4:12','Hebreos 6:19','Hebreos 10:24','Hebreos 11:6','Hebreos 12:11','Hebreos 13:8','Santiago 1:17',
    'Santiago 1:19','Santiago 1:22','Santiago 4:10','Santiago 5:16','1 Pedro 3:15','1 Pedro 4:8','1 Pedro 4:10','1 Pedro 5:10','2 Pedro 1:3','1 Juan 3:1',
    '1 Juan 3:18','1 Juan 4:4','1 Juan 4:18','1 Juan 5:14','Judas 1:24','Apocalipsis 1:8','Apocalipsis 22:13','Salmos 3:3','Salmos 16:8','Salmos 100:1-2',
    // Diciembre (Navidad del 20 al 26)
    'Salmos 17:8','Salmos 20:7','Salmos 23:4','Salmos 23:6','Salmos 31:24','Salmos 36:9','Salmos 46:10','Salmos 61:2','Salmos 68:19','Salmos 71:5',
    'Salmos 89:1','Salmos 92:1','Salmos 96:1','Salmos 103:12','Salmos 119:18','Salmos 119:114','Salmos 130:5','Salmos 136:1','Salmos 139:23','Isaías 7:14',
    'Gálatas 4:4','Mateo 1:21','Lucas 1:46-47','Lucas 2:14','Juan 1:14','Mateo 2:10','Isaías 25:1','Salmos 65:11','Lamentaciones 3:25','Hebreos 12:28','Apocalipsis 21:5'
  ];
  // Conexión: una pregunta breve para empezar (1 minuto).
  const CONEXION=[
    '¿Dónde viste a Dios ayer?','¿Por qué tres cosas puedes dar gracias hoy?','¿Qué te preocupa esta mañana? Nómbralo y entrégaselo a Dios.',
    '¿A quién podrías animar hoy con una palabra?','¿Qué necesitas de Dios en este día?','¿Qué momento de esta semana te hizo sonreír?',
    'Respira despacio tres veces. ¿Qué hay en tu corazón ahora mismo?','¿Hay alguien a quien necesites perdonar?','¿Qué promesa de Dios quieres recordar hoy?',
    '¿Dónde necesitas paciencia hoy?','¿Qué decisión tienes por delante?','¿Qué te enseñó Dios en un momento difícil?',
    '¿Cómo has visto la fidelidad de Dios este año?','¿Qué puedes soltar hoy para descansar en Dios?','¿A quién tienes en tu corazón para orar?',
    '¿Qué palabra describe cómo te sientes hoy?','¿Qué bendición sencilla das por hecha?','¿Dónde puedes servir a alguien hoy?',
    '¿Qué te robó la paz últimamente?','¿Qué te gustaría que Dios cambiara en ti?','Recuerda una oración que Dios te respondió.',
    '¿En qué área necesitas sabiduría?','¿Qué miedo quieres poner en manos de Dios?','¿Quién fue de bendición para ti esta semana?',
    '¿Qué hábito te acerca a Dios?','¿Qué te distrae de lo importante?','¿Cómo quieres tratar a tu familia hoy?',
    '¿Qué te da esperanza en este momento?','¿Qué conversación necesitas tener con amor?','¿Qué lugar de tu día puedes dedicarle a Dios?',
    '¿Dónde sientes cansancio? Dios conoce tu carga.'
  ];
  // Devoción sin IA: «Lee · Piensa · Aplica» sobre el versículo del día (los devocionales propios llegan cuando Edward los apruebe).
  const PIENSA=[
    ['¿Qué dice este versículo sobre Dios?','¿Qué dice sobre ti?'],
    ['¿Qué palabra te llama más la atención?','¿Por qué crees que hoy te habla esa palabra?'],
    ['¿Hay aquí una promesa para creer?','¿Hay un mandato para obedecer?'],
    ['¿Qué estaba pasando cuando se escribió esto?','¿Se parece en algo a lo que vives hoy?'],
    ['¿Qué te consuela de este pasaje?','¿Qué te desafía?'],
    ['Si tuvieras que decirlo con tus palabras, ¿cómo lo dirías?','¿Qué cambiaría si lo creyeras de verdad?'],
    ['¿Cómo se ve Jesús a la luz de este versículo?','¿Qué te invita a hacer?']
  ];
  const APLICA=[
    'Escribe el versículo en un papel o en tu teléfono y léelo tres veces hoy.','Compártelo con alguien que lo necesite.',
    'Elige una acción concreta, pequeña, que puedas hacer antes de la noche.','Apréndetelo de memoria: repítelo al despertar y al acostarte.',
    'Piensa en una persona a la que puedas servir hoy por este versículo.','Agradécele a Dios en voz alta lo que te mostró.',
    'Anota una pregunta que te deje este pasaje y vuelve a ella mañana.'
  ];
  // Oración: una guía corta que termina en palabras propias.
  const ORACION=[
    'Señor, gracias por tu palabra de hoy. Ayúdame a vivirla en lo pequeño. Te presento lo que me preocupa…',
    'Padre, tú me conoces. Hoy te pido sabiduría para…',
    'Dios, gracias por tu fidelidad. Pongo en tus manos a las personas que amo: …',
    'Jesús, enséñame a amar como tú. Muéstrame a quién necesito escuchar hoy.',
    'Señor, perdóname por… y dame un corazón limpio.',
    'Espíritu Santo, guía mis palabras y mis decisiones de este día.',
    'Padre, te entrego mi cansancio. Renueva mis fuerzas como prometiste.',
    'Señor, gracias por… (nombra tres cosas). Que mi vida te dé gloria.',
    'Dios, oro por quien está pasando un momento difícil: …',
    'Señor, que este versículo eche raíces en mí. Ayúdame a recordarlo cuando…'
  ];
  const PASOS=[
    {id:'conexion',titulo:'Conexión',minutos:1,bit:1},
    {id:'versiculo',titulo:'Versículo',minutos:2,bit:2},
    {id:'devocion',titulo:'Devoción',minutos:3,bit:4},
    {id:'oracion',titulo:'Oración',minutos:2,bit:8}
  ];
  const PROPOSITOS=['leer','estudiar','paz','orar'], TRADICIONES=['evangelica','catolica','otra'];
  const MAX_DIAS=1100, LETRAS=['L','M','M','J','V','S','D'];
  const DIAS_MES=[31,29,31,30,31,30,31,31,30,31,30,31];

  function parsear(ref){
    const m=/^(.+) (\d+):(\d+)(?:-(\d+))?$/.exec(ref);if(!m)return null;
    const book=LIBROS.indexOf(m[1]);if(book<0)return null;
    const r={book,chapter:Number(m[2]),verse:Number(m[3])};if(m[4])r.endVerse=Number(m[4]);return r;
  }
  const dos=n=>String(n).padStart(2,'0');
  // Fecha local del teléfono (no UTC): el día cambia a medianoche de quien lee.
  const clave=(d=new Date())=>d.getFullYear()+'-'+dos(d.getMonth()+1)+'-'+dos(d.getDate());
  const fechaDe=k=>{const [a,m,d]=k.split('-').map(Number);return new Date(a,m-1,d);};
  // Posición en el calendario fijo de 366 días: el 1 de marzo es siempre el día 61, haya o no 29 de febrero.
  function indiceDelAno(d=new Date()){let i=d.getDate()-1;for(let m=0;m<d.getMonth();m++)i+=DIAS_MES[m];return i;}
  const delDia=(d=new Date())=>{const i=indiceDelAno(d),ref=parsear(VERSICULOS[i]);return {...ref,indice:i,cita:VERSICULOS[i]};};
  const conexion=(d=new Date())=>CONEXION[indiceDelAno(d)%CONEXION.length];
  const oracion=(d=new Date())=>ORACION[indiceDelAno(d)%ORACION.length];
  function devocion(d=new Date()){const i=indiceDelAno(d);return {piensa:PIENSA[i%PIENSA.length],aplica:APLICA[(i+3)%APLICA.length]};}

  const vacio=()=>({bienvenida:'',perfil:{proposito:'',meta:4,hora:'',tradicion:''},dias:{},abrirEnHoy:true,ultimoDia:''});
  function validar(entrada){
    const e=vacio();
    if(!entrada||typeof entrada!=='object'||Array.isArray(entrada))return e;
    if(['hecha','saltada'].includes(entrada.bienvenida))e.bienvenida=entrada.bienvenida;
    const p=entrada.perfil||{};
    if(PROPOSITOS.includes(p.proposito))e.perfil.proposito=p.proposito;
    if(Number.isInteger(p.meta)&&p.meta>=1&&p.meta<=7)e.perfil.meta=p.meta;
    if(typeof p.hora==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(p.hora))e.perfil.hora=p.hora;
    if(TRADICIONES.includes(p.tradicion))e.perfil.tradicion=p.tradicion;
    const dias=entrada.dias&&typeof entrada.dias==='object'&&!Array.isArray(entrada.dias)?entrada.dias:{};
    const validos=Object.entries(dias).filter(([k,v])=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isInteger(v)&&v>0&&v<16).sort(([a],[b])=>a<b?1:-1).slice(0,MAX_DIAS);
    for(const [k,v] of validos)e.dias[k]=v;
    e.abrirEnHoy=entrada.abrirEnHoy!==false;
    if(typeof entrada.ultimoDia==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(entrada.ultimoDia))e.ultimoDia=entrada.ultimoDia;
    return e;
  }
  const bitDe=id=>PASOS.find(p=>p.id===id)?.bit||0;
  const hecho=(e,fecha,id)=>!!((e.dias[fecha]||0)&bitDe(id));
  function marcar(e,fecha,id,valor=true){
    const bit=bitDe(id);if(!bit)return e;
    const actual=e.dias[fecha]||0,nuevo=valor?actual|bit:actual&~bit,dias={...e.dias};
    if(nuevo)dias[fecha]=nuevo;else delete dias[fecha];
    return {...e,dias};
  }
  const pasosHechos=(e,fecha)=>PASOS.filter(p=>(e.dias[fecha]||0)&p.bit).length;
  const totalDias=e=>Object.keys(e.dias).length;
  // La semana empieza el lunes. Cada día dice si hubo al menos un paso (sin «perdiste»: el lunes empieza otra).
  function semana(e,hoy=new Date()){
    const lunes=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()-((hoy.getDay()+6)%7)),k=clave(hoy);
    return LETRAS.map((letra,i)=>{const d=new Date(lunes.getFullYear(),lunes.getMonth(),lunes.getDate()+i),f=clave(d);return {fecha:f,letra,hecho:!!e.dias[f],hoy:f===k,futuro:f>k};});
  }
  // Abre «Hoy» la primera vez de cada día (si la persona no lo apagó).
  const abrirPrimero=(e,hoy=new Date())=>e.abrirEnHoy!==false&&e.ultimoDia!==clave(hoy);
  // Avisos: uno por día, los próximos N días, a la hora elegida (fecha local).
  function proximosAvisos(hora,n=14,desde=new Date()){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora||''))return [];
    const [h,mi]=hora.split(':').map(Number),r=[];
    for(let i=0;r.length<n&&i<n+1;i++){const d=new Date(desde.getFullYear(),desde.getMonth(),desde.getDate()+i,h,mi);if(d>desde)r.push({fecha:clave(d),cuando:d,...delDia(d)});}
    return r;
  }
  const api={LIBROS,VERSICULOS,CONEXION,PIENSA,APLICA,ORACION,PASOS,PROPOSITOS,TRADICIONES,parsear,clave,fechaDe,indiceDelAno,delDia,conexion,oracion,devocion,vacio,validar,hecho,marcar,pasosHechos,totalDias,semana,abrirPrimero,proximosAvisos};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HoyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
