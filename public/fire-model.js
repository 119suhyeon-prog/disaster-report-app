export const timeLabels={occurredAt:'사고 발생시각',reportedAt:'119 신고접수시각',orderedAt:'출동지령시각',dispatchedAt:'출동시각',arrivedAt:'현장 도착시각',controlledAt:'진압시각',endedAt:'상황 종료시각'};
// NFDS 화면에 게시된 시도 선택값. 행의 lawSidoCd와 같은 코드 체계라고 가정하지 않는다.
export const nfdsRegions=[['11','서울'],['26','부산'],['27','대구'],['28','인천'],['29','광주'],['30','대전'],['31','울산'],['36','세종'],['41','경기'],['42','강원'],['43','충북'],['44','충남'],['45','전북'],['46','전남'],['47','경북'],['48','경남'],['50','제주']];
export function formatFireTime(time){return time?time.raw.replace('T',' ').replace(/\+09:00$/,'')+(time.approximate?'경':''):'';}
export const nfdsTimeLabels=['NFDS 표시 일시 (날짜·종류 미확인)','NFDS 표시 일시 (날짜 추정·종류 미확인)'];
export function formatNfdsTime(time){const inferred=time?.dateInference;return inferred?`${inferred.date} ${time.raw} (${inferred.dayOffset===0?'D-day':'D-'+inferred.dayOffset})`:time?.raw||'';}
export function buildFirePlan(incident,current,imports={}){
  const proposed={};
  if(incident.times.occurredAt)proposed.occurredAt=formatFireTime(incident.times.occurredAt);
  const tag=`[${incident.mock?'가상 사건':'출처 자료'}: ${incident.name} / ${incident.id}]`;
  const entries=Object.entries(timeLabels).filter(([key])=>incident.times[key]);
  const lines=entries.map(([key,label])=>`${formatFireTime(incident.times[key])} ${label}`);
  if(incident.sourceTime)lines.push(`${incident.sourceTime.dateInference?incident.sourceTime.dateInference.date+' ':''}${incident.sourceTime.raw}`);
  // 같은 사건·단계의 이전 가져오기 문장만 교체 후보로 만든다. 직접 작성한 줄은 보존한다.
  const retained=(current.timeline||'').split('\n').filter(line=>!entries.some(([,label])=>line.endsWith(` ${label} ${tag}`))&&!(incident.sourceTime&&nfdsTimeLabels.some(label=>line.endsWith(` ${label} ${tag}`)))&&!(imports[incident.id]||[]).includes(line));
  const clean=line=>line.replace(/\s*\[(?:가상 사건|출처 자료):[^\]\n]*\]\s*$/,'').replace(/\s*\(D-(?:day|\d+)\)\s*/g,' ').replace(/\s*NFDS 표시 일시 \((?:날짜·종류 미확인|날짜 추정·종류 미확인)\)/g,'').trim();
  if(lines.length)proposed.timeline=[...new Set([...retained.map(clean),...lines].filter(Boolean))].join('\n');
  return Object.entries(proposed).map(([key,value])=>({key,value,previous:current[key]||'',label:key==='occurredAt'?'발생일시':'시간대별 조치사항',changed:(current[key]||'')!==value,...(key==='timeline'?{importLines:lines}:{})}));
}
