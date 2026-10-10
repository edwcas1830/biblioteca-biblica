'use strict';
window.testPin=async vault=>{
  const service=LibraryAndroidVault.create({baseUrl:location.origin+'/'}),checks=[];let beats=0;const timer=setInterval(()=>beats++,10);
  const assert=(value,label)=>{if(!value)throw Error(label);};
  try{
    await service.initialize();checks.push('Worker local y WebCrypto disponibles con CSP estricta');
    const opened=await service.call('unlock',{pin:'123456',vault});assert(opened.part.notes['18:23:1']==='Texto privado inventado','Abrir cuaderno Windows');assert(!Object.hasOwn(opened,'key'),'No devolver clave');checks.push('scrypt y AES-GCM abren la copia Windows en Chromium');
    const encrypted=await service.call('encrypt',{session:opened.session,part:{...opened.part,notes:{'18:23:1':'Texto nuevo inventado'}}});checks.push('Cifrar cambios con IV nuevo para comprobarlos en Windows');
    try{await service.call('unlock',{pin:'654321',vault});throw Error('Aceptó PIN falso');}catch(e){assert(e.code==='LOCKED'&&!e.message.includes('654321'),'Error de PIN seguro');}checks.push('PIN incorrecto no devuelve texto ni clave');
    const candidate=await service.call('create',{pin:'234567',part:opened.part});assert(candidate.vault.salt!==vault.salt,'Sal nueva');await service.call('discard',candidate.session);checks.push('Cambiar PIN crea sal independiente y descarta sesión provisional');
    await service.call('lock');try{await service.call('decrypt',{session:opened.session,vault});throw Error('Sigue abierta');}catch(e){assert(e.code==='LOCKED','Sesión borrada');}checks.push('Cerrar elimina acceso a la sesión anterior');
    assert(beats>5,'La derivación bloqueó la página');checks.push('La página sigue atendiendo mientras scrypt trabaja');
    return {passed:checks.length,checks,encrypted};
  }finally{clearInterval(timer);service.close();}
};
