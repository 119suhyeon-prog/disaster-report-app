import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'kordoc';
import JSZip from 'jszip';
import {exportReport} from '../export.mjs';
import {emptyReport,extractDraft,sample} from '../report.mjs';
process.env.KORDOC_OFFLINE='1';
const template=new URL('../templates/report.hwpx',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('가상 사고를 원본 표에 반영하고 원본을 변경하지 않는다',async()=>{
  const before=hash(await readFile(template));
  const report=extractDraft(sample).report;
  report.title='가상 사고 <긴급> & 확인';
  report.timeline='14:10 신고 접수\n14:15 현장 도착';
  Object.assign(report,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});const bytes=await exportReport(report);
  const parsed=await parse(bytes,{keepLayoutTables:true});
  assert.equal(parsed.success,true);
  assert.match(parsed.markdown,/현재까지 인명피해 신고 없음/);
  assert.match(parsed.markdown,/14:15 현장 도착/);
  assert.doesNotMatch(parsed.markdown,/00담당부서|00:00|0\.0\./);
  const zip=await JSZip.loadAsync(bytes);
  const xml=await zip.file('Contents/section0.xml').async('string');
  assert.doesNotMatch(xml,/<hp:linesegarray/);
  assert.match(xml,/가상 사고 &lt;긴급&gt; &amp; 확인/);
  assert.equal(hash(await readFile(template)),before);
});
test('필수 정보가 없는 보고서 다운로드를 서버에서도 거부한다',async()=>{
  await assert.rejects(exportReport(emptyReport()),/필수 정보를 입력/);
  const r=extractDraft(sample).report;r.location='   ';
  await assert.rejects(exportReport(r),/장소/);
});
test('확인 중 상태를 명시하면 필수 입력으로 인정한다',async()=>{
  const r=extractDraft(sample).report;Object.assign(r,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});r.casualties='확인 중';
  const parsed=await parse(await exportReport(r));
  assert.equal(parsed.success,true);assert.match(parsed.markdown,/인명피해: 확인 중/);
});
