import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sections,fields,sample,extractDraft,requiredFields} from './report.mjs';
process.env.KORDOC_OFFLINE='1';
const {exportReport}=await import('./export.mjs');
const host=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||3210);
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function body(req){let total=0,chunks=[];for await(const chunk of req){total+=chunk.length;if(total>100000)throw Error('요청이 너무 큽니다.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
let exporting=false;
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  if(!allowedHosts.has(req.headers.host)){json(res,403,{error:'로컬 주소로 접속해 주세요.'});return;}
  try {
    const path=new URL(req.url,`http://${req.headers.host}`).pathname;
    if(req.method==='GET'&&staticFiles[path]){const [name,type]=staticFiles[path];res.writeHead(200,{'Content-Type':type});res.end(await readFile(fileURLToPath(new URL(`./public/${name}`,import.meta.url))));return;}
    if(req.method==='GET'&&path==='/api/schema'){json(res,200,{sections,fields,sample,requiredFields,mode:'rules-demo'});return;}
    if(req.method!=='POST'){json(res,404,{error:'요청한 경로가 없습니다.'});return;}
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){json(res,403,{error:'허용되지 않은 요청입니다.'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON 요청만 지원합니다.'});return;}
    const data=await body(req);
    if(path==='/api/draft'){json(res,200,extractDraft(data.text));return;}
    if(path==='/api/export'){
      if(exporting){json(res,429,{error:'다른 문서를 생성 중입니다. 잠시 후 다시 시도해 주세요.'});return;}
      exporting=true;
      try{const bytes=await exportReport(data.report);res.writeHead(200,{'Content-Type':'application/hwp+zip','Content-Disposition':"attachment; filename=disaster-report.hwpx; filename*=UTF-8''%EC%9E%AC%EB%82%9C%EC%83%81%ED%99%A9%EB%B3%B4%EA%B3%A0%EC%84%9C.hwpx",'Content-Length':bytes.length});res.end(bytes);}finally{exporting=false;}return;
    }
    json(res,404,{error:'요청한 경로가 없습니다.'});
  }catch(error){json(res,400,{error:error instanceof SyntaxError?'입력 형식을 확인해 주세요.':error.message||'처리 중 오류가 발생했습니다.'});}
});
server.requestTimeout=30000;
server.listen(port,host,()=>console.log(`상황이음 로컬 시제품: http://127.0.0.1:${port}\n규칙 기반 데모 · 외부 AI 전송 없음 · 종료: Ctrl+C`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`${port} 포트가 사용 중입니다. 기존 실행 창을 확인해 주세요.`:error.message);process.exitCode=1;});
