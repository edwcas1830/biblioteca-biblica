const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const root=path.join(__dirname,'..'),vendor=path.join(root,'app','vendor');await fs.mkdir(vendor,{recursive:true});
  const zip=path.dirname(require.resolve('jszip/package.json'));
  await fs.copyFile(path.join(zip,'dist','jszip.min.js'),path.join(vendor,'jszip.min.js'));
  await fs.copyFile(path.join(zip,'LICENSE.markdown'),path.join(vendor,'JSZIP-LICENSE.md'));
  await fs.copyFile(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'LICENSE'),path.join(vendor,'PDFJS-LICENSE.txt'));
  console.log('Lectores DOCX y PDF locales preparados.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
