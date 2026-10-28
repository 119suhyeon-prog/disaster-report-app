import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
process.env.VERCEL='1';process.env.VERCEL_URL='test-app.example.test';
process.env.TEST_ACCESS_TOKEN='local-test-access-token-only-123456';
process.env.REVIEW_SIGNING_KEY='local-test-signing-key-only-123456789';
process.env.AI_PROVIDER='openai';delete process.env.OPENAI_API_KEY;
const {default:handler}=await import('../api/index.mjs');
async function request(route,{method='GET',authorized=true,body,origin,host='test-app.example.test'}={}){
  const req=Readable.from([]);req.url=`/api/index?__route=${route}`;req.method=method;req.body=body;req.headers={host,...(authorized?{authorization:`Bearer ${process.env.TEST_ACCESS_TOKEN}`}:{})};
  if(body!==undefined)req.headers['content-type']='application/json';if(origin)req.headers.origin=origin;
  const res={headers:{},status:200,setHeader(k,v){this.headers[k]=v;},writeHead(status,headers={}){this.status=status;Object.assign(this.headers,headers);},end(data){this.data=data;}};
  await handler(req,res);return res;
}
test('Vercel rewrite·인증·공개 health·허용 도메인을 검증한다',async()=>{
  assert.equal((await request('health',{authorized:false})).status,200);
  assert.equal((await request('schema',{authorized:false})).status,401);
  const schema=await request('schema');assert.equal(schema.status,200);assert.equal(JSON.parse(schema.data).ai.mode,'openai');assert.doesNotMatch(schema.data,/local-test-access|local-test-signing/);
  assert.equal((await request('schema',{host:'evil.example.test'})).status,403);
});
test('HTTPS 같은 출처를 허용하고 타 출처와 미설정 AI를 차단한다',async()=>{
  assert.equal((await request('draft',{method:'POST',body:{text:'가상 사고'},origin:'https://other.example.test'})).status,403);
  const res=await request('draft',{method:'POST',body:{text:'가상 사고'},origin:'https://test-app.example.test'});assert.equal(res.status,503);assert.equal(JSON.parse(res.data).code,'NOT_CONFIGURED');
});
test('Vercel이 파싱한 body로 필수 확인과 실제 HWPX 생성이 동작한다',async()=>{
  const {emptyReport,requiredFields}=await import('../report.mjs');
  const report=emptyReport();for(const field of requiredFields)report[field]='확인 중';report.overview='가상 배포 시험';
  const blocked=await request('export',{method:'POST',body:{report}});assert.equal(blocked.status,400);
  const result=await request('export',{method:'POST',body:{report,confirmedFields:requiredFields},origin:'https://test-app.example.test'});
  assert.equal(result.status,200);assert.ok(Buffer.isBuffer(result.data));assert.ok(result.data.length>1000);assert.equal(result.data.subarray(0,2).toString(),'PK');
});
