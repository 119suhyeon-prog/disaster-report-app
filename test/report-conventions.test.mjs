import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDraft,emptyReport,requireComplete,requiredFields} from '../report.mjs';
import {createDraft,validateAIOutput} from '../ai.mjs';
import {extractPersonnel,resolveJurisdiction} from '../report-enrichment.mjs';
import {mergeDraft} from '../public/merge.js';
import {buildFirePlan} from '../public/fire-model.js';
const memo='2026년 10월 28일 10시 서울특별시 동작구 사당동 주택에서 화재 발생. 소방 30명, 경찰 5명 출동. 인명피해 확인 중.';
test('지역·동·재난유형 제목, 시도와 행정안전부 수신, 기관별 인원만 작성한다',async()=>{
  const result=await createDraft(memo,{}, {env:{AI_PROVIDER:'rules-demo'}});
  assert.equal(result.report.title,'서울특별시 동작구 사당동 주택화재');assert.equal(result.report.recipient,'서울특별시, 행정안전부');assert.equal(result.report.personnel,'소방 30명, 경찰 5명');
});
test('공개 시군구 대응표로 시도를 찾고 동명이거나 모호하면 확정하지 않는다',()=>{
  for(const [input,expected]of [['동작구 사당동','서울특별시'],['수원시 팔달구 인계동','경기도'],['고흥군','전남광주통합특별시'],['제주시','제주특별자치도'],['경상남도 고성군','경상남도']])assert.equal(resolveJurisdiction(input).province,expected);
  for(const input of ['중구','고성군','광주시','서울특별시 부산광역시'])assert.equal(resolveJurisdiction(input).province,'');
});
test('제목에 사고 현상을 과장하지 않고 동·인원을 만들어 넣지 않는다',()=>{
  const result=extractDraft('동작구에서 천장이 떨어졌어. 소방경찰 출동.');assert.match(result.report.title,/천장 낙하/);assert.doesNotMatch(result.report.title,/붕괴|사당동/);assert.equal(result.report.personnel,'');
});
test('별도로 지정한 제목·수신과 사용자 직접 편집은 자동 덮어쓰지 않는다',()=>{
  const result=extractDraft('제목: 담당자 지정 제목\n수신: 담당자 지정 수신\n'+memo);assert.equal(result.report.title,'담당자 지정 제목');assert.equal(result.report.recipient,'담당자 지정 수신');
  const merged=mergeDraft({title:'직접 수정',recipient:'직접 수신'},{},new Set(['title','recipient']),extractDraft(memo).report,{});assert.equal(merged.report.title,'직접 수정');assert.equal(merged.pending.filter(r=>['title','recipient'].includes(r.key)).length,2);
});
test('동원인력에서 장소·장비·부상 인원·예정·추가 인원을 임의 합산하지 않는다',()=>{
  assert.equal(extractPersonnel('시험동 소방관 약 20명과 경찰관 3명 현장 활동. 소방차 8대.'),'소방 약 20명, 경찰 3명');
  assert.equal(extractPersonnel('소방대원 2명 부상. 경찰 3명 출동 예정.'),'');assert.equal(extractPersonnel('소방 10명. 추가 소방 2명.'),'소방 10명');assert.equal(extractPersonnel('소방 10명, 소방 20명.'),'소방 인원 확인 중');
});
test('AI 결과에도 같은 제목·수신·인력 형식을 적용한다',()=>{
  const result=validateAIOutput({fields:{location:{value:'서울특별시 동작구 사당동',source:'서울특별시 동작구 사당동',status:'확인',actionState:'해당 없음'},personnel:{value:'현장 소방 30명, 경찰 5명 출동',source:memo,status:'확인',actionState:'진행 중'}}},memo);
  assert.equal(result.report.title,'서울특별시 동작구 사당동 주택화재');assert.equal(result.report.personnel,'소방 30명, 경찰 5명');
});
test('접수일시·담당자·연락처를 필수로 검사하고 확인 중만으로 통과하지 않는다',()=>{
  const report=emptyReport();for(const field of requiredFields)report[field]='확인 중';assert.throws(()=>requireComplete(report),/접수일시.*담당자 성명.*담당자 연락처/);
  Object.assign(report,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});assert.doesNotThrow(()=>requireComplete(report));report.contact=' ';assert.throws(()=>requireComplete(report),/담당자 연락처/);
});
test('시간대별 본문에서 식별자·D-day·NFDS 설명을 없애고 갱신 추적은 메타데이터로 유지한다',()=>{
  const incident={id:'mock-001',name:'가상 화재',mock:true,times:{},sourceTime:{raw:'23:59',label:'NFDS 표시 일시 (날짜 추정·종류 미확인)',dateInference:{date:'2026-10-27',dayOffset:1}}};
  const plans=buildFirePlan(incident,{timeline:'직접 작성\n2026-10-27 23:58 (D-1) NFDS 표시 일시 (날짜 추정·종류 미확인) [가상 사건: 가상 화재 / mock-001]'});
  assert.equal(plans[0].value,'직접 작성\n2026-10-27 23:59');assert.deepEqual(plans[0].importLines,['2026-10-27 23:59']);assert.doesNotMatch(plans[0].value,/mock-001|NFDS|D-1/);
});
