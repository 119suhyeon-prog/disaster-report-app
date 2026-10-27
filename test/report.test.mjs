import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDraft,sample,validateReport,buildMarkdown,emptyReport} from '../report.mjs';
test('가상 상황의 시각·장소와 불확실성을 유지한다',()=>{const {report:r}=extractDraft(sample);assert.equal(r.occurredAt,'2026년 10월 27일 14시 10분경');assert.equal(r.location,'가상시 가상동 물류창고');assert.match(r.casualties,/신고 없음/);assert.doesNotMatch(r.casualties,/0명/);assert.match(r.evacuation,/전원 대피 여부는 확인 중/);assert.match(r.plan,/예정/);assert.equal(r.personnel,'');});
test('구조화 항목 입력과 XML 특수 문자를 보존한다',()=>{const {report:r}=extractDraft('제목: 시험 <긴급> & 점검\n장소: 가상동\n인명피해: 부상자 2명, 사망·실종 확인 중');assert.equal(r.location,'가상동');assert.match(buildMarkdown(r),/&lt;긴급&gt; &amp; 점검/);assert.match(r.casualties,/사망·실종 확인 중/);});
test('미입력 인원에 0이나 예시 데이터를 넣지 않는다',()=>{const md=buildMarkdown(emptyReport());assert.match(md,/인명피해: 확인 중/);assert.doesNotMatch(md,/00담당|00:00|0\.0\./);});
test('추가 입력 인원을 임의로 더하지 않는다',()=>{const {report:r}=extractDraft('부상자 2명 추가 확인.');assert.equal(r.casualties,'부상자 2명 추가 확인.');});
test('상대 날짜를 임의로 확정하지 않는다',()=>{const {report:r}=extractDraft('어제 조금 전 가상동에서 화재 발생.');assert.equal(r.occurredAt,'');});
test('잘못된 입력과 과도한 입력은 거부한다',()=>{assert.throws(()=>extractDraft(''));assert.throws(()=>validateReport({title:10}));assert.throws(()=>validateReport({overview:'가'.repeat(1501)}));});
