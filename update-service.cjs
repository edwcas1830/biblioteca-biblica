'use strict';
function createUpdateService({app,updater,enabled,testing=false,notify=()=>{}}){
  let checking=false,downloading=false;
  let state={status:enabled&&app.isPackaged?'idle':'disabled',currentVersion:app.getVersion(),version:'',percent:0,message:enabled?'':'El canal de actualizaciones está pendiente de conectar.'};
  const publish=patch=>{state={...state,...patch};notify({...state});return {...state};};
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;
  updater.on('checking-for-update',()=>publish({status:'checking',message:'Buscando una versión nueva…'}));
  updater.on('update-available',info=>publish({status:'available',version:String(info.version).slice(0,50),percent:0,message:'Hay una versión nueva disponible para tu biblioteca.'}));
  updater.on('update-not-available',()=>publish({status:'current',message:'Tienes la versión más reciente.'}));
  updater.on('download-progress',progress=>publish({status:'downloading',percent:Math.max(0,Math.min(100,Math.round(progress.percent))),message:'Descargando la actualización…'}));
  updater.on('update-downloaded',info=>publish({status:'ready',version:String(info.version).slice(0,50),percent:100,message:'La nueva versión está lista. Puedes instalarla al terminar tu lectura.'}));
  updater.on('error',()=>publish({status:'error',message:'No pudimos completar la actualización. Comprueba tu conexión y vuelve a intentarlo.'}));
  const available=()=>enabled&&app.isPackaged&&!testing;
  async function check(){
    if(!available())return publish({status:'disabled',message:testing?'Comprobación desactivada en las pruebas.':enabled?'Las actualizaciones se comprueban en la app instalada.':'El canal de actualizaciones está pendiente de conectar.'});
    if(checking||downloading||state.status==='ready'||state.status==='available')return {...state};
    checking=true;try{await updater.checkForUpdates();}catch{publish({status:'error',message:'No pudimos consultar nuevas versiones. Comprueba tu conexión y vuelve a intentarlo.'});}finally{checking=false;}
    return {...state};
  }
  async function download(){
    if(!available()||state.status!=='available'||downloading)return {...state};
    downloading=true;publish({status:'downloading',percent:0,message:'Descargando la actualización…'});
    try{await updater.downloadUpdate();}catch{publish({status:'error',message:'No pudimos descargar la actualización. Puedes intentarlo de nuevo.'});}finally{downloading=false;}
    return {...state};
  }
  function install(){if(available()&&state.status==='ready'){updater.quitAndInstall(false,true);return {accepted:true};}return {accepted:false};}
  return {check,download,install,getState:()=>({...state})};
}
module.exports={createUpdateService};
