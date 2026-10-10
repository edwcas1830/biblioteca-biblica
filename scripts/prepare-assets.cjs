const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const root=path.join(__dirname,'..'),vendor=path.join(root,'app','vendor');await fs.mkdir(vendor,{recursive:true});
  const zip=path.dirname(require.resolve('jszip/package.json'));
  await fs.copyFile(path.join(zip,'dist','jszip.min.js'),path.join(vendor,'jszip.min.js'));
  await fs.copyFile(path.join(zip,'LICENSE.markdown'),path.join(vendor,'JSZIP-LICENSE.md'));
  const pdf=path.dirname(require.resolve('pdfjs-dist/package.json')),pdfVendor=path.join(vendor,'pdfjs');
  await fs.copyFile(path.join(pdf,'LICENSE'),path.join(vendor,'PDFJS-LICENSE.txt'));
  await fs.mkdir(pdfVendor,{recursive:true});
  for(const file of ['pdf.mjs','pdf.worker.mjs'])await fs.copyFile(path.join(pdf,'build',file),path.join(pdfVendor,file));
  for(const dir of ['cmaps','standard_fonts','wasm'])await fs.cp(path.join(pdf,dir),path.join(pdfVendor,dir),{recursive:true});
  await fs.copyFile(path.join(pdf,'LICENSE'),path.join(pdfVendor,'LICENSE.txt'));
  await fs.writeFile(path.join(pdfVendor,'VERSION.json'),JSON.stringify({package:'pdfjs-dist',version:require('pdfjs-dist/package.json').version,license:'Apache-2.0'})+'\n');
  console.log('Lectores DOCX y PDF locales preparados.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
