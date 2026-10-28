import test from 'node:test';
import assert from 'node:assert/strict';
import {inferNfdsDates,normalizeNfdsPayload,NfdsFireAdapter,seoulDate} from '../nfds-fire.mjs';
import {validateIncidents} from '../fire-incidents.mjs';
import {buildFirePlan} from '../public/fire-model.js';
const rows=times=>times.map((raw,index)=>({id:'synthetic-'+index,sourceTime:raw===null?undefined:{raw,label:'NFDS 표시 일시 (날짜·종류 미확인)',dateKnown:false,kind:'unclassified'}}));
const now=Date.parse('2026-10-28T02:00:00Z');
test('현재 한국 날짜를 첫 행에 붙이고 두 번의 시각 역전에서 D-1·D-2를 계산한다',()=>{
  const result=inferNfdsDates(rows(['10:30','00:10','23:50','23:50','00:05','22:00']),{now});
  assert.deepEqual(result.map(r=>r.sourceTime.dateInference.date),['2026-10-28','2026-10-28','2026-10-27','2026-10-27','2026-10-27','2026-10-26']);
  assert.deepEqual(result.map(r=>r.sourceTime.dateInference.dayOffset),[0,0,1,1,1,2]);assert.equal(result[2].sourceTime.raw,'23:50');assert.equal(result[2].sourceTime.dateKnown,false);
});
test('서버 UTC 날짜가 아닌 Asia/Seoul의 오늘을 사용한다',()=>{
  assert.equal(seoulDate(Date.parse('2026-10-27T15:01:00Z')),'2026-10-28');
  assert.equal(inferNfdsDates(rows(['00:01','23:59']),{now:Date.parse('2026-10-27T15:01:00Z')})[1].sourceTime.dateInference.date,'2026-10-27');
});
test('월·연도 경계 및 윤년, 초 정밀도를 보존한다',()=>{
  for(const [anchor,expected]of [['2027-01-01','2026-12-31'],['2026-03-01','2026-02-28'],['2024-03-01','2024-02-29']]){
    const result=inferNfdsDates(rows(['00:00:10','23:59:59']),{now:Date.parse(anchor+'T02:00:00Z')});assert.equal(result[1].sourceTime.dateInference.date,expected);assert.equal(result[0].sourceTime.raw,'00:00:10');
  }
});
test('시각 누락·잘못된 시각 뒤에서는 날짜를 억지로 이어 붙이지 않는다',()=>{
  for(const invalid of [null,'25:00','12:99','모름']){const result=inferNfdsDates(rows(['10:00',invalid,'23:59']),{now});assert.ok(result[0].sourceTime.dateInference);assert.equal(result[2].sourceTime.dateInference,undefined);assert.match(result[2].dateInferenceNote,/불명확/);}
});
const payload=()=>({nowDate:'2026-10-27 23:59:59',defail:['10:00','00:01','23:59'].map((overDate,index)=>({sidoOvrNum:'synthetic-'+index,lawSidoCd:index===2?'11':'41',sidoNm:index===2?'서울':'경기',overDate,addr:'가상 시험 주소',progressNm:'출동'}))});
test('원문·추정 기준을 보관하고 날짜를 포함한 참고 내역을 반영하며 수동 값은 유지한다',()=>{
  const result=validateIncidents(normalizeNfdsPayload(payload(),{now}));assert.equal(result[0].dataAsOf,'2026-10-27 23:59:59');assert.equal(result[0].sourceTime.dateInference.anchorDate,'2026-10-28');
  const report={occurredAt:'담당자 확인값',receivedAt:'상황실 접수값',timeline:'직접 작성'};const plan=buildFirePlan(result[2],report);
  assert.equal(plan.length,1);assert.equal(plan[0].key,'timeline');assert.match(plan[0].value,/2026-10-27 23:59/);assert.doesNotMatch(plan[0].value,/날짜 추정|NFDS 표시|D-1/);assert.match(plan[0].value,/직접 작성/);assert.equal(report.occurredAt,'담당자 확인값');
  const invalid=structuredClone(result);invalid[0].sourceTime.dateInference.dayOffset=5;assert.throws(()=>validateIncidents(invalid),{code:'FIRE_INVALID'});
});
test('지역 검색도 전국 목록에서 추정하고 캐시가 자정을 넘으면 새 기준으로 재조회한다',async()=>{
  let clock=Date.parse('2026-10-28T14:59:50Z'),calls=0;const adapter=new NfdsFireAdapter({clock:()=>clock,fetchImpl:async(_url,options)=>{calls++;assert.equal(String(options.body),'sidoCode=');return new Response(JSON.stringify(payload()),{headers:{'content-type':'application/json'}});}});
  const all=await adapter.fetch();const regional=await adapter.fetch('normal',{sidoCode:'11'});assert.equal(regional.cached,true);assert.equal(regional.incidents.length,1);assert.equal(regional.incidents[0].sourceTime.dateInference.date,all.incidents[2].sourceTime.dateInference.date);assert.equal(calls,1);
  clock+=20000;const next=await adapter.fetch('normal',{sidoCode:'11'});assert.equal(calls,2);assert.equal(next.cached,false);assert.equal(next.dateInferenceAnchor,'2026-10-29');assert.equal(next.incidents[0].sourceTime.dateInference.date,'2026-10-28');assert.equal(all.dateInferenceAnchor,'2026-10-28');
});
test('같은 사건의 동일한 중복 행은 목록 순번이 달라도 한 건으로 정리한다',()=>{
  const input=payload();input.defail=[input.defail[0],{...input.defail[0]}];
  assert.equal(validateIncidents(normalizeNfdsPayload(input,{now})).length,1);
});
