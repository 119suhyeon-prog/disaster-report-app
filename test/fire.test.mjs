import test from 'node:test';
import assert from 'node:assert/strict';
import {MockFireAdapter,OfficialFireAdapter,validateIncidents,searchIncidents,createFireService} from '../fire-incidents.mjs';
import {buildFirePlan,formatFireTime} from '../public/fire-model.js';
const rows=()=>new MockFireAdapter().fetch('normal').then(validateIncidents);
test('중복 사건은 최신 자료 한 건으로 정리한다',async()=>{const events=await rows();assert.equal(events.length,4);assert.equal(events.filter(r=>r.id==='mock-001').length,1);});
test('주소 검색과 메모 기반 후보에 이유를 표시하고 같은 동의 사건을 확정하지 않는다',async()=>{
  const events=await rows();assert.equal(searchIncidents(events,{keyword:'가상동 123번지'}).incidents.length,1);
  const result=searchIncidents(events,{memo:'2026년 10월 28일 가상시 가상동 화재 발생'});assert.ok(result.incidents.length>=2);assert.ok(result.incidents[0].reasons.some(r=>r.includes('일치')));assert.equal(result.selected,undefined);
});
test('화재가 아닌 천장 낙하와 검색 결과 없음을 구분한다',async()=>{
  assert.equal(searchIncidents(await rows(),{memo:'가상시 가상동에서 천장이 떨어졌어'}).incidents.length,0);
  assert.equal(searchIncidents(await rows(),{keyword:'존재하지않는가상건물'}).incidents.length,0);
});
test('시각 종류를 보존하고 신고접수만으로 발생·상황실 접수시각을 채우지 않는다',async()=>{
  const event=(await rows()).find(r=>r.id==='mock-003');const current={occurredAt:'',receivedAt:''};
  assert.deepEqual(Object.keys(event.times),['reportedAt']);const plans=buildFirePlan(event,current);assert.deepEqual(plans.map(p=>p.key),['timeline']);assert.match(plans[0].value,/119 신고접수시각/);assert.equal(current.occurredAt,'');assert.equal(current.receivedAt,'');assert.doesNotMatch(plans[0].value,/사고 발생시각/);
});
test('발생·신고·출동·도착시각을 각각 보존하고 분 정밀도에 초를 추가하지 않는다',async()=>{
  const event=(await rows())[0];const plans=buildFirePlan(event,{});assert.equal(plans.find(p=>p.key==='occurredAt').value,'2026-10-28 10:00');
  for(const label of ['사고 발생시각','119 신고접수시각','출동지령시각','출동시각','현장 도착시각'])assert.match(plans.find(p=>p.key==='timeline').value,new RegExp(label));
  assert.equal(formatFireTime(event.times.occurredAt),'2026-10-28 10:00');
});
test('자정 전 발생·자정 후 출동과 검색 범위를 올바르게 처리한다',async()=>{
  const events=await rows();const r=searchIncidents(events,{keyword:'자정',from:'2026-10-28T00:00',to:'2026-10-28T00:15'});assert.equal(r.incidents.length,1);
  const plans=buildFirePlan(r.incidents[0],{});assert.equal(plans[0].value,'2026-10-27 23:58');assert.match(plans[1].value,/2026-10-28 00:03 출동시각/);
  assert.throws(()=>searchIncidents(events,{from:'2026-10-29T00:00',to:'2026-10-28T00:00'}));
});
test('정정 조회는 원본 보고서를 바꾸지 않고 비교 후보를 만든다',async()=>{
  const original={occurredAt:'담당자가 직접 확인한 시각',timeline:'담당자 조치'};
  const revision=validateIncidents(await new MockFireAdapter().fetch('revised'))[0];const plans=buildFirePlan(revision,original);
  assert.equal(original.occurredAt,'담당자가 직접 확인한 시각');assert.equal(plans[0].previous,original.occurredAt);assert.equal(plans[0].value,'2026-10-28 09:57');assert.match(plans[1].value,/담당자 조치/);
  const applied=Object.fromEntries(plans.map(p=>[p.key,p.value]));assert.ok(buildFirePlan(revision,applied).every(p=>!p.changed));
});

test('동일 사건의 정정은 이전 가져오기 시각을 교체 후보로 만들고 직접 작성한 줄은 보존한다',async()=>{
  const original=(await rows())[0];const before=Object.fromEntries(buildFirePlan(original,{timeline:'담당자 직접 작성'}).map(p=>[p.key,p.value]));
  const revision=validateIncidents(await new MockFireAdapter().fetch('revised'))[0];
  const imports={[original.id]:buildFirePlan(original,{timeline:'담당자 직접 작성'}).find(p=>p.key==='timeline').importLines};const updated=buildFirePlan(revision,before,imports).find(p=>p.key==='timeline');
  assert.match(updated.value,/담당자 직접 작성/);assert.match(updated.value,/09:57 사고 발생시각/);
  assert.doesNotMatch(updated.value,/10:00 사고 발생시각/);assert.match(updated.previous,/10:00 사고 발생시각/);
});

test('가져온 발생일시와 신고·출동 내역이 기존 HWPX의 해당 항목에 들어간다',async()=>{
  const {emptyReport}=await import('../report.mjs');const {exportReport}=await import('../export.mjs');const {parse}=await import('kordoc');
  process.env.KORDOC_OFFLINE='1';
  const report=emptyReport();Object.assign(report,Object.fromEntries(buildFirePlan((await rows())[0],report).map(p=>[p.key,p.value])),{location:'가상시 가상동 123번지',overview:'가상 화재 시험',casualties:'확인 중'});
  Object.assign(report,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});const output=await parse(await exportReport(report),{keepLayoutTables:true});assert.equal(output.success,true);
  assert.match(output.markdown,/1\. 발생개요\s+가\. 일 시: 2026-10-28 10:00/);assert.match(output.markdown,/시간대별 조치사항[\s\S]*10:03 119 신고접수시각/);
  assert.doesNotMatch(output.markdown,/접수일시: 2026-10-28 10:03/);
});
test('응답 구조·잘못된 정밀도·알 수 없는 시각 종류를 거부한다',async()=>{
  const events=await rows();events[0].times.fake=events[0].times.occurredAt;assert.throws(()=>validateIncidents(events),{code:'FIRE_INVALID'});
  const seconds=await rows();seconds[0].times.occurredAt.precision='second';assert.throws(()=>validateIncidents(seconds),{code:'FIRE_INVALID'});
});
test('공식 연결 미설정과 가상 실패는 가상 자료로 자동 우회하지 않는다',async()=>{
  await assert.rejects(new OfficialFireAdapter().fetch(),{code:'FIRE_NOT_CONFIGURED'});
  await assert.rejects(createFireService()({mode:'official'}),{code:'FIRE_NOT_CONFIGURED'});
  await assert.rejects(createFireService()({mode:'mock',scenario:'failure'}),{code:'FIRE_CONNECTION'});
  assert.equal((await createFireService()({mode:'mock',scenario:'empty'})).incidents.length,0);
});
test('타임아웃과 중복 조회 제한, 조회 시각 및 가상 출처를 반환한다',async()=>{
  const service=createFireService();const result=await service({mode:'mock'});assert.equal(result.automaticRefresh,false);assert.match(result.source,/가상/);assert.ok(Date.parse(result.fetchedAt));
  await assert.rejects(service({mode:'mock'}),{code:'FIRE_RATE'});
  await assert.rejects(createFireService({official:{fetch:()=>new Promise(()=>{})},timeoutMs:10})({mode:'official'}),{code:'FIRE_TIMEOUT'});
});
