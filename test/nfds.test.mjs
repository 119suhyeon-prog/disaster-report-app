import test from 'node:test';
import assert from 'node:assert/strict';
import {NfdsFireAdapter,normalizeNfdsPayload,NFDS_URL} from '../nfds-fire.mjs';
import {validateIncidents,createFireService} from '../fire-incidents.mjs';
import {buildFirePlan} from '../public/fire-model.js';
// 실제 사건·주소를 저장하지 않는다. NFDS에서 확인한 키를 사용하는 합성 응답.
const fixture=()=>({nowDate:'2026-10-28 11:12:38',map:[{sidoOvrNum:'test-only',lawSidoCd:'11',lawGunguCd:'000'}],defail:[{sidoOvrNum:'test-only',lawSidoCd:'11',sidoNm:'서울',cntrNm:'가상소방서',overDate:'11:12',addr:'가상시 시험동 1번지',progressStat:'B',progressNm:'출동',frfalTypeCd:'',dethNum:0,injuNum:0,expMount:'0'}]});
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});

test('NFDS는 map을 사건 상세로 오인하지 않고 defail을 정규화한다',()=>{
  const rows=validateIncidents(normalizeNfdsPayload(fixture()));assert.equal(rows.length,1);assert.equal(rows[0].station,'가상소방서');assert.equal(rows[0].mock,false);assert.equal(rows[0].updatedAt,null);assert.equal(rows[0].sourceTime.raw,'11:12');
  assert.deepEqual(rows[0].times,{});assert.equal(rows[0].dataAsOf,'2026-10-28 11:12:38');assert.equal(rows[0].casualties,undefined);
});
test('NFDS 발생일시와 장소 제안은 기존 수동 값을 보존한다',()=>{
 const event=normalizeNfdsPayload(fixture())[0], report={occurredAt:'담당자 확인값',location:'기존 장소',receivedAt:'접수값',timeline:'직접 작성'};
 const plans=buildFirePlan(event,report);assert.deepEqual(plans.map(p=>p.key),['occurredAt','location']);assert.ok(plans[0].value.endsWith('11:12 (추정)'));assert.equal(plans[0].inferred,true);assert.equal(plans[0].previous,'담당자 확인값');assert.equal(plans[1].value,'가상시 시험동 1번지');assert.equal(plans[1].previous,'기존 장소');assert.equal(report.timeline,'직접 작성');assert.equal(report.receivedAt,'접수값');
 delete event.sourceTime.dateInference;event.address='주소 미제공';assert.deepEqual(buildFirePlan(event,report),[]);
});

test('확인된 잔불정리·감시 표시, 빈 관할, 미제공 시각을 처리한다',()=>{
  const input=fixture();Object.assign(input.defail[0],{progressStat:'H',progressNm:undefined,cntrNm:null,overDate:null});
  const row=validateIncidents(normalizeNfdsPayload(input))[0];assert.equal(row.status,'잔불감시');assert.equal(row.sourceTime,undefined);assert.match(row.station,/미제공/);
});
test('NFDS POST form 요청은 지역 코드만 전송하고 쿠키·메모·AI 키를 전송하지 않는다',async()=>{
  let request;const adapter=new NfdsFireAdapter({fetchImpl:async(url,options)=>{request={url,...options};return response(fixture());}});
  await adapter.fetch('normal',{sidoCode:'11'});assert.equal(request.url,NFDS_URL);assert.equal(request.method,'POST');assert.equal(String(request.body),'sidoCode=');assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');assert.equal(request.headers.Authorization,undefined);assert.equal(request.headers.Cookie,undefined);
  await assert.rejects(adapter.fetch('normal',{sidoCode:'not-a-region'}),{code:'FIRE_QUERY'});
});
test('60초 캐시는 원본 조회시각을 보존하고 만료 후 오류를 오래된 성공으로 대체하지 않는다',async()=>{
  let now=100000,calls=0;const adapter=new NfdsFireAdapter({clock:()=>now,fetchImpl:async()=>{calls++;if(calls>1)throw Error('network failed');return response(fixture());}});
  const first=await adapter.fetch(),cached=await adapter.fetch();assert.equal(calls,1);assert.equal(cached.cached,true);assert.equal(first.fetchedAt,cached.fetchedAt);
  now+=61000;await assert.rejects(adapter.fetch(),{code:'FIRE_CONNECTION'});
});
test('NFDS HTTP 오류, HTML, 잘못된 JSON 및 사건 스키마 변경은 명확히 거부한다',async()=>{
  for(const [reply,code]of [[new Response('denied',{status:403}),'FIRE_CONNECTION'],[new Response('<html>login</html>'),'FIRE_INVALID'],[new Response('oops',{headers:{'content-type':'application/json'}}),'FIRE_INVALID'],[response({map:[]}),'FIRE_INVALID']]){
    await assert.rejects(new NfdsFireAdapter({fetchImpl:async()=>reply}).fetch(),{code});
  }
  const bad=fixture();bad.defail[0].addr={};assert.throws(()=>normalizeNfdsPayload(bad),{code:'FIRE_INVALID'});
  const duplicates=normalizeNfdsPayload(fixture());duplicates.push({...duplicates[0],address:'다른 가상 주소'});assert.throws(()=>validateIncidents(duplicates),{code:'FIRE_INVALID'});
});
test('실제 조회 모드는 기간 검색을 지원한다고 주장하지 않고 메모 날짜를 확정하지 않는다',async()=>{
  const nfds=new NfdsFireAdapter({fetchImpl:async()=>response(fixture())});const service=createFireService({nfds});
  const result=await service({mode:'nfds',memo:'2026년 10월 28일 가상시 시험동 화재',from:'2025-01-01T00:00',to:'2025-01-02T00:00'});
  assert.equal(result.incidents.length,1);assert.match(result.notice,/기간 검색은 지원하지 않습니다/);assert.ok(result.incidents[0].reasons.some(x=>x.includes('추정 날짜')));assert.equal(result.cached,false);assert.equal(result.automaticRefresh,false);
});
test('NFDS 연결 실패 시 가상 어댑터를 호출하지 않는다',async()=>{
  let mockCalls=0;const service=createFireService({nfds:{fetch:async()=>{throw Object.assign(Error('실패'),{code:'FIRE_CONNECTION'});}},mock:{fetch:async()=>{mockCalls++;return [];}}});
  await assert.rejects(service({mode:'nfds'}),{code:'FIRE_CONNECTION'});assert.equal(mockCalls,0);
});
