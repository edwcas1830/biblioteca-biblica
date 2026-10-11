/** Contract v1. Rejections carry BridgeError; successes keep Electron's payload shapes. */
export type ErrorCode = 'VALIDATION'|'UNAVAILABLE'|'NOT_FOUND'|'CANCELLED'|'LOCKED'|'CONFLICT'|'QUOTA'|'STORAGE'|'CORRUPT'|'INTERNAL';
export interface BridgeError extends Error { name:'BridgeError'; code:ErrorCode; operation:string; }
export type JSONValue = null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export interface Ref { book:number; chapter:number; verse?:number; endVerse?:number; }
export interface ReadingDay { title?:string; sourceText?:string; readings?:Ref[]; [key:string]:unknown; }
export interface Plan { id:string; days:number; entries:(ReadingDay|Ref[])[]; dayIds?:string[]; completed:number[]; [key:string]:unknown; }
/** Full v1 renderer state: extra devotional/guide/appearance fields survive round trips. */
export interface PersonalState { version:1; position:Ref; notes:Record<string,string>; highlights:Record<string,string>; plans:Plan[]; devotionals:JSONValue[]; privacyEnabled?:boolean; privateLocked?:boolean; privateVault?:Vault; [key:string]:unknown; }
export interface Vault { v:1; salt:string; iv:string; tag:string; data:string; }
export interface BootstrapInput { legacy:string|null; initial:PersonalState; legacyValid?:boolean; }
export interface BootstrapResult { state:PersonalState; migrated:boolean; backup?:string|null; }
export interface RestoreInput { state:PersonalState; privateVault?:Vault; pin?:string; }
export interface ModuleInfo { id:string; tipo:'biblia'|'diccionario'|'comentario'; rol:string; titulo:string; sha256?:string; licencia?:string; atribucion?:string; iaPermitida?:boolean; [key:string]:unknown; }
export interface Catalog { modules:ModuleInfo[]; warnings:string[]; versions:string[]; dictionaryGroups:string[][]; }
export interface Book { name:string; chapters:number[]; }
export interface Verse extends Ref { verse:number; endVerse?:number; reference:string; text:string; html:string; strong?:string[]; alignment?:boolean; }
export interface Chapter { module:string; revision:string; title:string; verses:Verse[]; }
export interface SearchResult { module:string; revision:string; count:number; results:(Ref & {text:string; reference?:string})[]; }
export interface Entry { title?:string; label?:string; module?:string; revision?:string; text:string; html:string; }
export interface Source { kind:string; module:string; title:string; reference:string; revision:string; text:string; license?:string; attribution?:string; origin?:string; licenseUrl?:string; }
export interface AiStatus { connected:boolean; waiting:boolean; secure:boolean; authorizationUrl?:string; requiresCode?:boolean; expiresAt?:number; }
export interface PersonalAiStatus { available:boolean; enabled:boolean; providers:{id:string; installed:boolean; connected?:boolean; session?:string}[]; }
export interface AiPrepared { id:string; prompt:string; sources:Source[]; notices:string[]; [key:string]:unknown; }
export interface AiReply extends Partial<ActionReply> { text:string; model:string; structured:boolean; citations:(Ref & {text?:string})[]; sources:Source[]; allowLiving?:boolean; sections?:Record<'brief'|'context'|'meaning'|'keywords'|'connections'|'prayer',string>; keywords?:{code:string; label:string}[]; sourceIds?:number[]; followups?:string[]; living?:string; [key:string]:unknown; }
export interface AiSelection extends Ref { module?:string; comment?:string; scope?:'verse'|'chapter'|'book'|'general'; includeBible?:boolean; includeComment?:boolean; task?:string; action?:StudyAction; ref?:Ref; question?:string; study?:boolean; history?:string; allowLiving?:boolean; series?:JSONValue; }
export interface YoutubeStatus { personal:boolean; connected:boolean; secure:boolean; }
export interface UpdateState { status:string; [key:string]:unknown; }
export interface CircleStatus { connected:boolean; [key:string]:unknown; }
export type CircleSelection = {kind:'reading'; plan:string; day:string}|{kind:'prayer'; id:string}|{kind:'message'; text:string; ref:Ref};
export interface CirclePreview {kind:'reading'|'prayer'|'message'; object?:string; value:{title:string; text:string; completed:boolean; refs:Ref[]};}
export interface GraphicsResult { places:JSONValue[]; land:JSONValue; events:JSONValue[]; epochs:JSONValue[]; outline:JSONValue; harmonies:JSONValue; }
export interface Person { id:string; name:string; original?:string; lookup?:string; ambiguous?:boolean; parents:unknown[]; }
export interface ScanResult { folder:string; items:({token:string; original:string; status:string; reason?:string} & Record<string,unknown>)[]; }
export interface PdfRecord { text:string; page:number; kind:string; spans:{text:string; bold?:boolean; italic?:boolean}[]; [key:string]:unknown; }
export interface PdfResult { records:PdfRecord[]; title:string; subtitle:string; pages:number; indexTitles:Record<string,string>; warnings:string[]; }
/** App-private paths returned by BibliaPlataforma.elegirArchivosTraspaso; never SAF URIs. */
export interface TransferSelection { carpeta:'traspaso-entrante'; archivos:{nombre:string; ruta:string; bytes:number}[]; }
export interface TransferSummary {
  conteos:{diasPlan:number; diasCompletados:number; devocionales:number; oraciones?:number; estadoCifrado:boolean};
  modulos:{id:string; tipo:'biblia'|'comentario'|'diccionario'; titulo:string}[];
  modoPersonal:boolean; versionPaquete:string; bytes:number; conservaPin:boolean;
}
export interface TransferReview { token:string; expiresAt:number; resumen:TransferSummary; requiereConfirmacion:true; }
export interface TransferResult { instalado:true; resumen:TransferSummary; respaldo:string; requiereRecarga:true; }
export interface Capabilities { version:1; platform:'web'|'android'|'desktop'; storage:'none'|'indexeddb'|'sqlite'; nativeVerified:boolean; operations:Record<keyof Omit<LibraryBridge,'getCapabilities'>,{available:boolean; reason?:string}>; }
export type Unsubscribe = () => void;
export interface LibraryBridge {
  getCapabilities():Promise<Capabilities>;
  bootstrap(data:BootstrapInput):Promise<BootstrapResult>;
  savePersonal(state:PersonalState):Promise<PersonalState>;
  privacyStatus():Promise<{enabled:boolean; locked:boolean; retryAt:number}>;
  unlock(pin:string):Promise<PersonalState>; lockPrivate():Promise<PersonalState>;
  setPin(pin:string):Promise<PersonalState>; disablePin():Promise<PersonalState>;
  exportBackup():Promise<PersonalState>; restoreBackup(data:RestoreInput):Promise<PersonalState>;
  catalog():Promise<Catalog>; metadata():Promise<Book[]>;
  chapter(data:Ref & {module?:string; strong?:boolean}):Promise<Chapter>;
  search(data:{module?:string; query:string; mode?:'text'|'word'|'strong'}):Promise<SearchResult>;
  comments(data:Ref & {module:string}):Promise<{module:string; revision:string; entries:Entry[]}>;
  dictionary(data:{group:string; query:string}):Promise<{entries:Entry[]}>;
  connections(data:Ref & {comment?:string}):Promise<{items:(Ref & {endBook:number; endChapter:number; score:number|null; sources:string[]})[]; license:string; title:string}>;
  compare(data:Ref & {modules:string[]}):Promise<{versions:{module:string; title:string; revision:string}[]; rows:{verse:number; cells:(Verse|null)[]}[]; notice:string}>;
  studySources():Promise<JSONValue[]>;
  graphicsChapter(data:Ref):Promise<GraphicsResult>;
  graphicsChronology(data:{query?:string; kind?:'events'|'kings'; all?:boolean; book?:number; chapter?:number}):Promise<{count:number; items:JSONValue[]}>;
  graphicsPeople(data:{query?:string}):Promise<{count:number; items:Person[]}>;
  graphicsGenealogy(data:{id:string}):Promise<{person:Person; groups:{kind:string; items:Person[]}[]}>;
  readPdf(bytes:Uint8Array):Promise<PdfResult>;
  moduleScan(data?:{choose?:boolean}):Promise<ScanResult|null>;
  moduleInstall(tokens:string[]):Promise<{installed:string[]; count:number; backup:string|null}>;
  aiStatus():Promise<AiStatus>; aiConnect(data?:{code?:string}):Promise<AiStatus>;
  aiDisconnect():Promise<AiStatus>; aiModels():Promise<{id:string; name:string; paid?:boolean; via?:'openrouter'; pricing?:{currency:'USD'; prompt:number; completion:number; inputPerMillion:number; outputPerMillion:number; checkedAt:number}}[]>;
  aiPrepare(data:AiSelection):Promise<AiPrepared>;
  aiAsk(data:{id:string; action?:StudyAction; provider?:string; model:string; allowData?:boolean; paid?:{confirmed:true; maxCostUsd:number}}):Promise<AiReply>;
  /** One OpenRouter background; uses account credits, never the free text model list. */
  aiImage(data:{prompt:string; aspect:'4:5'|'1:1'|'9:16'}):Promise<{dataUrl:string; model:string}>;
  aiCopy(data:{id:string; provider?:string}):Promise<{copied:boolean; opened:boolean}>;
  aiTextCopy(text:string):Promise<boolean>; aiCancel():Promise<boolean>;
  onAiProgress(callback:(value:{id:string; text:string})=>void):Unsubscribe;
  onAiState(callback:(value:AiStatus)=>void):Unsubscribe;
  aiPersonalStatus():Promise<PersonalAiStatus>; aiPersonalEnable(value:boolean):Promise<PersonalAiStatus>;
  aiPersonalLogin(provider:string):Promise<{instructions:boolean}>;
  aiGeminiKey(key:string|null):Promise<PersonalAiStatus>; aiGeminiModels():Promise<{id:string; name:string}[]>;
  readerFullscreen(value?:boolean):Promise<boolean>; onFullscreen(callback:(value:boolean)=>void):Unsubscribe;
  musicPlayer(url:string):Promise<{src:string; origin:string; media:{url:string; video?:string; list?:string}}>;
  musicExternal(url:string):Promise<void>; onMusicPause(callback:()=>void):Unsubscribe;
  youtubeStatus():Promise<YoutubeStatus>; youtubeKey(key:string):Promise<YoutubeStatus>; youtubeRemoveKey():Promise<YoutubeStatus>;
  youtubeSearch(data:{query:string; type?:'video'|'playlist'}):Promise<{id:string; type:string; title:string; channel:string; thumbnail:string; url:string}[]>;
  youtubeExternal(query:string):Promise<void>; youtubeCloud():Promise<void>;
  circleStatus():Promise<CircleStatus>; circleSync():Promise<CircleStatus>;
  circleConnect(data:{name:string; code?:string}):Promise<CircleStatus|null>;
  circlePreview(data:CircleSelection):Promise<CirclePreview>; circleShare(data:{selection:CircleSelection; preview:string}):Promise<CircleStatus>;
  circleRecovery():Promise<string>; circleResolve(data:{object:string; id:string}):Promise<CircleStatus>;
  circleReading(data:{object:string; id:string}):Promise<CircleStatus>; circleLeave():Promise<CircleStatus>; circleCopyCode():Promise<boolean>;
  getUpdateState():Promise<UpdateState>; checkForUpdates():Promise<UpdateState>;
  downloadUpdate():Promise<UpdateState>; installUpdate():Promise<UpdateState>;
  onUpdateState(callback:(value:UpdateState)=>void):Unsubscribe;
  /** Mobile additions. Available only when registered by the platform integration. */
  playVoice(data:{text:string; lang?:string; voice?:string; rate?:number}):Promise<void>;
  stopVoice():Promise<void>; voiceOptions():Promise<{id:string; name:string; lang:string; localService?:boolean}[]>;
  shareText(data:{text:string; title?:string}):Promise<{completed:boolean}>;
  transferScan(data:TransferSelection):Promise<TransferReview>;
  transferInstall(data:{token:string; confirmado:true}):Promise<TransferResult>;
}
declare global { interface Window { libraryDesktop:LibraryBridge; } }

export type StudyAction = 'contexto'|'exegesis'|'paralelos'|'originales'|'dios'|'vida'|'pregunta';
export interface ActionReply { action:StudyAction; brief:string; texto:string; interpretacion:string; conexiones:string; fuentes:{sourceId:number; ref?:Ref; modulo?:string; strong?:string; extracto:string; title?:string; license?:string; attribution?:string}[]; seguimientos:[string,string,string]; }
