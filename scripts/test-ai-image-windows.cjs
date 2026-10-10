'use strict';
// Real hidden Electron + main IPC + sandboxed preload. No account and no generation request.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-image-windows-')),appRoot=path.resolve(__dirname,'..');
const child=spawn(process.execPath,[path.join(__dirname,'smoke-windows.cjs'),'--exe',require('electron'),'--project',appRoot,'--profile',root,'--output',path.join(root,'report'),'--phase','ai-image'],{windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('close',code=>{
  const absolute=path.resolve(root),base=path.resolve(os.tmpdir())+path.sep;
  if(!absolute.startsWith(base)||!path.basename(absolute).startsWith('biblia-image-windows-'))throw Error('Perfil de prueba inválido');
  fs.rmSync(absolute,{recursive:true,force:true,maxRetries:8,retryDelay:100});process.exitCode=code||0;
});
