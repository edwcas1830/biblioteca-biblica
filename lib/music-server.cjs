'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),core=require('../app/music-core.js');
class MusicServer{
 constructor(appRoot){this.root=appRoot;this.nonce=crypto.randomBytes(24).toString('hex');this.server=null;this.origin=null;this.starting=null;}
 async start(){if(this.origin)return this.origin;if(this.starting)return this.starting;this.starting=new Promise((resolve,reject)=>{this.server=http.createServer((req,res)=>this.handle(req,res));this.server.once('error',reject);this.server.listen(0,'127.0.0.1',()=>{this.origin='http://127.0.0.1:'+this.server.address().port;resolve(this.origin);});});try{return await this.starting;}finally{this.starting=null;}}
 async player(input){const media=core.parse(input);await this.start();const u=new URL('/'+this.nonce+'/player',this.origin);if(media.video)u.searchParams.set('video',media.video);if(media.list)u.searchParams.set('list',media.list);return {src:u.href,origin:this.origin,media};}
 handle(req,res){let url;try{url=new URL(req.url,this.origin);}catch{res.writeHead(400);res.end();return;}if(req.method!=='GET'||req.headers.host!==new URL(this.origin).host||!url.pathname.startsWith('/'+this.nonce+'/')){res.writeHead(404);res.end();return;}
  const resource=url.pathname.slice(this.nonce.length+2),assets={player:['player.html','text/html; charset=utf-8'],'player.js':['player.js','text/javascript; charset=utf-8'],'player.css':['player.css','text/css; charset=utf-8']};if(!Object.hasOwn(assets,resource)){res.writeHead(404);res.end();return;}
  if(resource==='player'){try{const video=url.searchParams.get('video')||'',list=url.searchParams.get('list')||'';const normalized=core.parse('https://www.youtube.com/'+(video?'watch?v='+video+(list?'&list='+list:''):'playlist?list='+list));if(normalized.video!==video||normalized.list!==list)throw new Error('Parámetros inválidos');}catch{res.writeHead(400);res.end();return;}}
  const [file,type]=assets[resource];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'none'; script-src 'self' https://www.youtube.com; style-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src https://www.youtube.com; img-src https://i.ytimg.com; object-src 'none'; base-uri 'none'; form-action 'none'"});res.end(fs.readFileSync(path.join(this.root,'app','music',file)));
 }
 stop(){this.server?.close();this.server?.closeAllConnections();this.server=null;this.origin=null;}
}
module.exports={MusicServer};
