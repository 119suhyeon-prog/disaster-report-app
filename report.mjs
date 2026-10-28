import {applyReportConventions} from './report-enrichment.mjs';
import {requiredValueValid,explicitRequiredFields} from './public/required-rules.js';
export {explicitRequiredFields};
export const sections = [
  ['기본정보', [['title','제목'],['number','보고번호'],['recipient','수신'],['issuedAt','시행일시'],['receivedAt','접수일시'],['department','발신부서'],['author','담당자 성명'],['contact','담당자 연락처']]],
  ['1. 발생개요', [['occurredAt','발생일시'],['location','장소'],['cause','사고원인'],['overview','사고개요']]],
  ['2. 피해상황', [['casualties','인명피해'],['property','재산피해'],['otherDamage','그 밖의 피해']]],
  ['3. 동원사항', [['personnel','인력'],['equipment','장비']]],
  ['4. 조치사항', [['notification','상황전파'],['dispatch','현장파견'],['alert','재난문자방송'],['evacuation','인명대피']]],
  ['5. 시간대별 조치사항', [['timeline','시간대별 조치사항']]],
  ['6. 지원 및 협조사항', [['support','지원 및 협조사항']]],
  ['7. 향후 전망 및 대책', [['plan','향후 전망 및 대책']]],
];
export const fields = sections.flatMap(([,items])=>items);
export const requiredFields = ['occurredAt','location','overview','casualties','receivedAt','author','contact'];
export const missingRequired = report => fields.filter(([key])=>requiredFields.includes(key)&&!requiredValueValid(key,report[key]));
export function requireComplete(report) {
  const missing=missingRequired(report);
  if(missing.length) throw Error(`필수 정보를 입력해 주세요: ${missing.map(([,label])=>label).join(', ')}`);
}
export const emptyReport = () => Object.fromEntries(fields.map(([key])=>[key,'']));
export const sample = '2026년 10월 27일 14시 10분경 가상시 가상동 물류창고에서 화재 발생. 소방이 진화 중이며 사고원인은 확인 중. 현재까지 인명피해 신고 없음. 직원들은 대피했다고 하나 전원 대피 여부는 확인 중. 소방차 8대 출동. 시청 재난부서에 상황 전파 완료. 향후 추가 피해 여부를 확인할 예정.';
export function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('보고서 데이터가 올바르지 않습니다.');
  const report=emptyReport();
  for (const [key,label] of fields) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${label}: 문자열을 입력해 주세요.`);
    report[key]=(input[key]??'').trim();
    if(report[key].length>1500) throw new Error(`${label}: 1,500자 이내로 작성해 주세요.`);
  }
  if(Object.values(report).join('').length>12000) throw new Error('보고서 전체 내용은 12,000자 이내로 작성해 주세요.');
  return report;
}
// AI 미연결 상태의 결정적 규칙 기반 추출기. 모호한 수치의 합산/추정은 하지 않는다.
export function extractDraft(text) {
  if(typeof text!=='string'||!text.trim()||text.length>12000) throw new Error('상황을 1~12,000자로 입력해 주세요.');
  const result=emptyReport(), sources={};
  const assign=(key,value)=>{result[key]=value.trim();sources[key]=value.trim();};
  const labels=new Map(fields.map(([key,label])=>[label,key]));
  labels.set('일시','occurredAt');labels.set('발생장소','location');
  const unlabeled=[];
  for(const line of text.split(/\n/).filter(x=>x.trim())) {
    const m=line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
    if(m&&labels.has(m[1].trim())) assign(labels.get(m[1].trim()),m[2]);
    else unlabeled.push(line);
  }
  const prose=unlabeled.join('\n');
  if(prose) {
    assign('overview',prose);
    const date=prose.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:오전|오후)?\s*\d{1,2}시\s*(?:\d{1,2}분)?\s*(?:경|쯤)?/);
    if(date) assign('occurredAt',date[0]);
    const place=prose.match(/([^.!?\n]*?)에서\s*(?:화재|폭발|붕괴|사고|침수)/);
    if(place) {const clean=place[1].replace(date?.[0]??'\u0000','').trim();if(clean) assign('location',clean);}
    const rules=[['cause',/원인/],['casualties',/인명피해|사망|실종|부상|다친/],['property',/재산피해|피해액/],['personnel',/소방\s*\d+명|경찰\s*\d+명|인력/],['equipment',/소방차|구급차|장비/],['notification',/전파|통보/],['dispatch',/현장파견|현장 파견/],['alert',/재난문자/],['evacuation',/대피/],['support',/지원 요청|협조 요청/],['plan',/예정|향후|계획/]];
    for(const sentence of prose.split(/(?<=[.!?])\s+|\n/).filter(Boolean)) {
      for(const [key,pattern] of rules) if(pattern.test(sentence)) {
        const value=result[key]?`${result[key]}\n${sentence}`:sentence;assign(key,value);
      }
    }
  }
  return applyReportConventions({report:result,sources},text);
}
export const escapeHtml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\n','<br>');
// 원본의 표·행 구조를 유지하고 본문 셀의 내용만 교체한다.
export function buildMarkdown(report) {
  const val=key=>escapeHtml(report[key]||'확인 중');
  const optional=key=>escapeHtml(report[key]||(key==='number'?'-':'미입력'));
  const body=[
    '1. 발생개요',
    `가. 일 시: ${val('occurredAt')}`,`나. 장 소: ${val('location')}`,`다. 사고원인: ${val('cause')}`,`라. 사고개요: ${val('overview')}`,
    '2. 피해상황',`가. 인명피해: ${val('casualties')}`,'※ 별첨: 사망자ㆍ실종자ㆍ환자 인적사항, 환자상태, 이송병원',`나. 재산피해: ${val('property')}`,`다. 그 밖의 피해: ${val('otherDamage')}`,
    '3. 동원사항',`가. 인력: ${val('personnel')}`,`나. 장비: ${val('equipment')}`,
    '4. 조치사항',`가. 상황전파: ${val('notification')}`,`나. 현장파견: ${val('dispatch')}`,'※ 파견 안한 경우 사유 기재',`다. 재난문자방송: ${val('alert')}`,'※ 재난문자 송출 안한 경우 사유 기재',`라. 인명대피: ${val('evacuation')}`,'※ 대피 안한 경우 사유 기재',
    '5. 시간대별 조치사항',optional('timeline'),'6. 지원 및 협조사항',optional('support'),'7. 향후 전망 및 대책',optional('plan')
  ];
  return `<table>\n<tr><th>■ 재난 및 안전관리 기본법 시행규칙 [별지 제1호서식] &lt;개정 2012.12.6&gt;</th></tr>\n<tr><td>재난상황 보고서</td></tr>\n<tr><td><table>\n<tr><th>즉시 보고 제 ${optional('number')} 호</th></tr>\n</table></td></tr>\n<tr><td></td></tr>\n<tr><td>수신: ${optional('recipient')}<br>시행일시: ${optional('issuedAt')} 접수일시: ${optional('receivedAt')}<br>발신부서: ${optional('department')} 담당자 성명: ${optional('author')}<br>담당자 연락처: ${optional('contact')}<br>제목: ${optional('title')}</td></tr>\n<tr><td>${body.join('<br>')}</td></tr>\n<tr><td></td></tr>\n<tr><td>작성방법</td></tr>\n<tr><td>1. 사망자ㆍ실종자 인적사항은 붙임자료로 제출할 수 있습니다.<br>2. ⑤란부터 ⑦란까지는 필요한 경우에만 작성할 수 있습니다.</td></tr>\n<tr><td>210mm×297mm[백상지 80g/㎡(재활용품)]</td></tr>\n</table>`;
}
