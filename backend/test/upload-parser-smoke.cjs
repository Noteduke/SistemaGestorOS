const {createRequire}=require('node:module');
const req=createRequire(require('node:path').join(__dirname,'../package.json'));
const express=req('express'),multer=req('multer'),sharp=req('sharp');
const assert=require('node:assert/strict');
(async()=>{
 const app=express();
 for(const [field,max] of [['logo',2*1024*1024],['screenshot',5*1024*1024]]){
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:max,files:1,fields:field==='logo'?0:5,parts:field==='logo'?1:6},fileFilter:(_r,f,cb)=>cb(['image/png','image/jpeg'].includes(f.mimetype)?null:Error('INVALID_MIME'),true)}).single(field);
  app.post('/'+field,upload,(r,s)=>s.json({bytes:r.file.buffer.length}));
 }
 app.use((e,r,s,n)=>s.status(400).json({error:e.code||e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let count=0;try{
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#ffffff'}}).png().toBuffer();
  for(const [field,max] of [['logo',2*1024*1024],['screenshot',5*1024*1024]]){
   for(const [data,mime,expected] of [[png,'image/png',200],[Buffer.from('invalid'),'text/plain',400],[Buffer.alloc(max+1),'image/png',400]]){
    const form=new FormData();form.append(field,new Blob([data],{type:mime}),'fixture.png');
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/'+field,{method:'POST',body:form});assert.equal(response.status,expected);await response.text();count++;
   }
  }
  console.log(JSON.stringify({passed:count,failed:0,scope:'real HTTP Express/Multer parser, same size/MIME limits; no application authentication or database'}));
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
