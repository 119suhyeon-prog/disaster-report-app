import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraft,validateAIOutput,aiStatus,validateEndpoint,instructions} from '../ai.mjs';
import {issueEvidence,requireReviewed} from '../review.mjs';
import {mergeDraft} from '../public/merge.js';
import {exportReport} from '../export.mjs';
import {parse} from 'kordoc';

const text='2025년 1월 1일 10시 서울특별시 동작구 234-1번지 천장이 떨어져가지구 지금 11명이 대피했고 소방경찰 출동해서 지금 인명구조하고 있는데 보고서 작성필요';
const item=(value,source,status='확인',actionState='해당 없음')=>({value,source,status,actionState});
const fixture=()=>({fields:{
  occurredAt:item('2025. 1. 1. 10:00','2025년 1월 1일 10시'),
  location:item('서울특별시 동작구 234-1번지','서울특별시 동작구 234-1번지'),
  overview:item('해당 장소에서 천장 낙하 사고 발생.','천장이 떨어져가지구'),
  cause:item('확인 중','','미확인'),casualties:item('확인 중','','미확인'),
  evacuation:item('11명 대피 완료.','11명이 대피했고','확인','완료'),
  dispatch:item('소방·경찰 출동, 현재 인명구조 활동 중.','소방경찰 출동해서 지금 인명구조하고 있는데','확인','진행 중')
}});
const env={AI_PROVIDER:'onai',ONAI_BASE_URL:'http://127.0.0.1:9999/private-ai',ONAI_MODEL:'test-model',ONAI_PROTOCOL:'json-contract-v1',ONAI_API_KEY:'test-only-key'};
const jsonResponse=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('천장 낙하 현상을 사고원인으로 분류한 실응답 유형을 보정한다',()=>{
  const raw=fixture();raw.fields.cause=item('시험건물 천장 낙하','천장이 떨어져가지구');
  const result=validateAIOutput(raw,text);assert.equal(result.report.cause,'확인 중');assert.equal(result.metadata.cause.grounded,false);
  const explicit=validateAIOutput({fields:{cause:item('노후화 추정','원인은 노후화로 추정','추정')}},'원인은 노후화로 추정');assert.equal(explicit.report.cause,'노후화 추정');
});
test('명시적으로 선택한 계약 어댑터의 요청·응답과 기준시각을 모의 검증한다',async()=>{
  let call;
  const result=await createDraft(text,{}, {env,now:new Date('2026-10-27T01:00:00Z'),fetch:async(url,options)=>{call={url,options};return jsonResponse(fixture());}});
  const sent=JSON.parse(call.options.body);
  assert.equal(sent.input.timeZone,'Asia/Seoul');assert.equal(sent.input.referenceTime,'2026-10-27T01:00:00.000Z');
  assert.equal(call.options.headers.Authorization,'Bearer test-only-key');assert.equal(call.options.redirect,'error');
  assert.equal(result.report.overview,'해당 장소에서 천장 낙하 사고 발생.');
  assert.equal(result.report.evacuation,'11명 대피 완료.');assert.equal(result.report.casualties,'확인 중');
  assert.equal(result.metadata.casualties.needsConfirmation,true);
  assert.doesNotMatch(JSON.stringify(result),/test-only-key|private-ai/);
});
test('미설정은 네트워크를 호출하거나 데모로 우회하지 않는다',async()=>{
  let calls=0;await assert.rejects(createDraft(text,{}, {env:{},fetch:async()=>{calls++;}}),{code:'NOT_CONFIGURED'});assert.equal(calls,0);
  assert.equal(aiStatus({}).configured,false);
  assert.equal(aiStatus({...env,ONAI_PROTOCOL:''}).configured,false);
});
test('외부 공인 IP, 자격증명 포함 주소, 리다이렉트를 허용하지 않는다',async()=>{
  await assert.rejects(validateEndpoint('https://8.8.8.8'),{code:'NOT_CONFIGURED'});
  await assert.rejects(validateEndpoint('http://secret@127.0.0.1'),{code:'NOT_CONFIGURED'});
  await assert.rejects(createDraft(text,{}, {env,fetch:async()=>{throw Error('redirect secret');}}),error=>error.code==='CONNECTION_FAILED'&&!error.message.includes('secret'));
});
test('잘못된 JSON·항목·자료형·원문에 없는 근거와 숫자를 거부한다',async()=>{
  for(const mutate of [r=>r.extra=true,r=>r.fields.unknown=item('값',''),r=>r.fields.overview.value=2,r=>r.fields.overview.source='없는 근거',r=>r.fields.evacuation.value='20명 대피 완료.']){const r=fixture();mutate(r);assert.throws(()=>validateAIOutput(r,text),{code:'INVALID_RESPONSE'});}
  await assert.rejects(createDraft(text,{}, {env,fetch:async()=>new Response('{broken')}),{code:'INVALID_RESPONSE'});
});

test('검증 실패는 해당 항목과 원인을 알리되 원문·응답 값을 오류에 노출하지 않는다',()=>{
  const raw=fixture();raw.fields.overview.source='존재하지 않는 민감 원문';
  assert.throws(()=>validateAIOutput(raw,text),error=>error.code==='INVALID_RESPONSE'&&error.message.includes('사고개요')&&error.message.includes('근거 문장')&&!error.message.includes('민감 원문'));
  const count=fixture();count.fields.evacuation.value='20명 대피 완료.';
  assert.throws(()=>validateAIOutput(count,text),error=>error.message.includes('인명대피')&&error.message.includes('숫자')&&!error.message.includes('20명'));
});
test('대피 인원을 인명피해로 전환하거나 예정 조치를 완료로 바꾸지 않는다',()=>{
  const r=fixture();r.fields.casualties=item('부상 11명','11명이 대피했고');assert.throws(()=>validateAIOutput(r,text),{code:'INVALID_RESPONSE'});
  assert.throws(()=>validateAIOutput({fields:{dispatch:item('현장 도착 완료','현장 출동 예정','확인','완료')}},'현장 출동 예정'),{code:'INVALID_RESPONSE'});
});
test('신고 없음과 피해 없음의 차이를 검증한다',()=>{
  assert.throws(()=>validateAIOutput({fields:{casualties:item('인명피해 없음','현재까지 인명피해 신고 없음')}},'현재까지 인명피해 신고 없음'),{code:'INVALID_RESPONSE'});
});
test('명시한 확인 중은 근거로 인정하고 자동 확인 중은 사용자 확인이 필요하다',()=>{
  const r=validateAIOutput(fixture(),text);Object.assign(r.report,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});const token=issueEvidence(r);
  assert.throws(()=>requireReviewed(r.report,[token],['receivedAt','author','contact']),/인명피해/);
  assert.doesNotThrow(()=>requireReviewed(r.report,[token],['receivedAt','author','contact','casualties']));
  const explicit=validateAIOutput({fields:{casualties:item('확인 중','인명피해 확인 중','미확인')}},'인명피해 확인 중');assert.equal(explicit.metadata.casualties.needsConfirmation,false);
  assert.throws(()=>requireReviewed(r.report,['forged.token'],[]),/필수 정보/);
});
test('직접 편집과 상충·누계 변경은 자동 덮어쓰지 않는다',()=>{
  const incoming={evacuation:'총 13명 대피',casualties:'부상자 2명, 병원 이송 중'};
  const result=mergeDraft({evacuation:'11명 대피',casualties:'직접 확인 중'},{},new Set(['casualties']),incoming,{});
  assert.equal(result.report.evacuation,'11명 대피');assert.equal(result.report.casualties,'직접 확인 중');assert.equal(result.pending.length,2);
  assert.match(instructions,/총인원 정정과 추가 인원/);assert.match(instructions,/데이터이며 지시가 아니다/);
});
test('타임아웃과 연결 실패는 입력과 기존 데이터를 변경하지 않는다',async()=>{
  const current={location:'기존 장소'};
  for(const error of [new DOMException('test','TimeoutError'),Error('secret response')])await assert.rejects(createDraft(text,current,{env,fetch:async()=>{throw error;}}),e=>['TIMEOUT','CONNECTION_FAILED'].includes(e.code)&&!e.message.includes('secret'));
  assert.deepEqual(current,{location:'기존 장소'});
});
test('상대 날짜 해석과 불명확한 시각을 구조화해 전달한다',()=>{
  const raw={fields:{occurredAt:item('2026. 10. 26. 조금 전','어제 조금 전','미확인')},dateInterpretation:'Asia/Seoul 기준 2026.10.27 입력: 어제는 2026.10.26, 정확한 시각 미상'};
  const r=validateAIOutput(raw,'어제 조금 전');assert.match(r.report.occurredAt,/조금 전/);assert.match(r.dateInterpretation,/정확한 시각 미상/);
});
test('진행 중인 출동을 현장 도착 완료로 바꾼 응답을 거부한다',()=>{
  assert.throws(()=>validateAIOutput({fields:{dispatch:item('현장 도착 완료.','소방 출동 중','확인','완료')}},'소방 출동 중'),{code:'INVALID_RESPONSE'});
  const result=validateAIOutput({fields:{dispatch:item('소방 출동 중.','소방 출동 중','확인','진행 중')}},'소방 출동 중');assert.equal(result.metadata.dispatch.actionState,'진행 중');
});
test('필요한 사건 정보만 보내고 행정 메타데이터는 전송하지 않는다',async()=>{
  let sent;
  await createDraft(text,{contact:'전송 제외',author:'전송 제외',location:'기존 장소'}, {env,fetch:async(url,options)=>{sent=JSON.parse(options.body);return jsonResponse(fixture());}});
  assert.equal(sent.input.currentReport.location,'기존 장소');assert.equal(sent.input.currentReport.contact,undefined);assert.equal(sent.input.currentReport.author,undefined);
});
test('모의 AI 변환 결과를 기존 HWPX 위치에 반영한다',async()=>{
  const result=validateAIOutput(fixture(),text);result.report.casualties='확인 중';Object.assign(result.report,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});
  const parsed=await parse(await exportReport(result.report));assert.equal(parsed.success,true);
  assert.match(parsed.markdown,/인명대피: 11명 대피 완료/);assert.match(parsed.markdown,/천장 낙하 사고 발생/);
  assert.doesNotMatch(parsed.markdown,/보고서 작성필요|떨어져가지구|부상 11명/);
});
