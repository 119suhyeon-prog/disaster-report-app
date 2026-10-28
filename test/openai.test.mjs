import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraft,outputSchema} from '../ai.mjs';
import {strictReportSchema,OPENAI_ENDPOINT} from '../openai.mjs';
import {deploymentConfig} from '../access.mjs';

const text='천장이 떨어졌고 11명이 대피했고 인명피해 확인 중';
const output={fields:{overview:{value:'천장 낙하 사고 발생.',source:'천장이 떨어졌고',status:'확인',actionState:'해당 없음'},evacuation:{value:'11명 대피 완료.',source:'11명이 대피했고',status:'확인',actionState:'완료'},casualties:{value:'확인 중',source:'인명피해 확인 중',status:'미확인',actionState:'해당 없음'}},dateInterpretation:''};
const env={AI_PROVIDER:'openai',OPENAI_API_KEY:'mock-not-real-secret',OPENAI_MODEL:'gpt-4.1-mini'};
test('OpenAI 공식 고정 주소에 서버 키·strict 스키마·store false를 보낸다 (모의)',async()=>{
  let call;
  const result=await createDraft(text,{}, {env,fetch:async(url,options)=>{call={url,options};return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));}});
  assert.equal(call.url,OPENAI_ENDPOINT);assert.equal(call.options.headers.Authorization,'Bearer mock-not-real-secret');
  const request=JSON.parse(call.options.body);assert.equal(request.store,false);assert.equal(request.text.format.strict,true);assert.equal(request.max_output_tokens,6000);
  assert.equal(result.mode,'openai');assert.equal(result.report.evacuation,'11명 대피 완료.');assert.equal(result.metadata.overview.origin,'openai');
  assert.doesNotMatch(JSON.stringify(result),/mock-not-real-secret/);
});
test('strict 구조화 출력에서 모든 속성을 required로 지정한다',()=>{
  const strict=strictReportSchema(outputSchema);assert.deepEqual(strict.required,['fields','dateInterpretation']);
  assert.deepEqual(strict.properties.fields.required,Object.keys(strict.properties.fields.properties));
  assert.deepEqual(outputSchema.required,['fields']);
});
test('OpenAI 키 없으면 호출하지 않고 상태 오류를 반환한다',async()=>{
  let called=false;await assert.rejects(createDraft(text,{}, {env:{AI_PROVIDER:'openai'},fetch:()=>{called=true;}}),{code:'NOT_CONFIGURED'});assert.equal(called,false);
});
test('인증 오류·과금 한도·잘린 응답·거부·시간초과를 안전하게 처리한다',async()=>{
  for(const [status,code]of [[401,'AUTH_FAILED'],[429,'RATE_LIMIT'],[500,'CONNECTION_FAILED']]){
    await assert.rejects(createDraft(text,{}, {env,fetch:async()=>new Response('secret upstream details',{status})}),error=>error.code===code&&!error.message.includes('secret'));
  }
  for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'test'}]}]}])await assert.rejects(createDraft(text,{}, {env,fetch:async()=>new Response(JSON.stringify(response))}),{code:'INVALID_RESPONSE'});
  await assert.rejects(createDraft(text,{}, {env,fetch:async()=>{throw new DOMException('test','TimeoutError');}}),{code:'TIMEOUT'});
});
test('공개 배포에서 접속 코드 없이 공통 서명키와 허용 도메인을 검증한다',()=>{
  assert.throws(()=>deploymentConfig({VERCEL:'1'}),/REVIEW_SIGNING_KEY/);
  assert.throws(()=>deploymentConfig({VERCEL:'1',TEST_ACCESS_TOKEN:'a'.repeat(24)}),/REVIEW_SIGNING_KEY/);
  const config=deploymentConfig({VERCEL:'1',TEST_ACCESS_TOKEN:'a'.repeat(24),REVIEW_SIGNING_KEY:'b'.repeat(32),VERCEL_URL:'preview.example.test'});assert.ok(config.origins.has('https://preview.example.test'));
  assert.throws(()=>deploymentConfig({PUBLIC_APP_URL:'http://example.test'}),/HTTPS/);
  assert.doesNotThrow(()=>deploymentConfig({VERCEL:'1',REVIEW_SIGNING_KEY:'b'.repeat(32),VERCEL_URL:'preview.example.test'}));
});
