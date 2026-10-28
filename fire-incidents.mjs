import {timeLabels,nfdsTimeLabels} from './public/fire-model.js';
import {NfdsFireAdapter,NFDS_SOURCE} from './nfds-fire.mjs';
const SOURCE='로컬 가상 데이터 · 실제 화재 아님';
const time=raw=>({raw,precision:raw.length===22?'minute':'second',approximate:false});
const event=(id,name,address,times,updatedAt='2026-10-28T10:30:00+09:00')=>({id,name,address,region:'가상시',type:'화재',status:'진압 중',mock:true,source:SOURCE,updatedAt,times:Object.fromEntries(Object.entries(times).map(([key,value])=>[key,time(value)]))});
const base=[
  event('mock-001','가상 한빛창고 화재','가상시 가상동 123번지 한빛창고',{occurredAt:'2026-10-28T10:00+09:00',reportedAt:'2026-10-28T10:03+09:00',orderedAt:'2026-10-28T10:04+09:00',dispatchedAt:'2026-10-28T10:05+09:00',arrivedAt:'2026-10-28T10:12+09:00'}),
  event('mock-002','가상 새빛상가 화재','가상시 가상동 456번지 새빛상가',{occurredAt:'2026-10-28T10:15+09:00',reportedAt:'2026-10-28T10:18+09:00',dispatchedAt:'2026-10-28T10:20+09:00'}),
  {...event('mock-003','가상 별빛공장 신고 접수','가상시 시험동 77번지 별빛공장',{reportedAt:'2026-10-28T09:30+09:00'}),status:'신고 접수'},
  event('mock-004','가상 자정창고 화재','가상시 야간동 12번지 자정창고',{occurredAt:'2026-10-27T23:58+09:00',reportedAt:'2026-10-28T00:01+09:00',dispatchedAt:'2026-10-28T00:03+09:00',arrivedAt:'2026-10-28T00:10+09:00'}),
  event('mock-001','가상 한빛창고 화재','가상시 가상동 123번지 한빛창고',{occurredAt:'2026-10-28T10:00+09:00',reportedAt:'2026-10-28T10:03+09:00',orderedAt:'2026-10-28T10:04+09:00',dispatchedAt:'2026-10-28T10:05+09:00',arrivedAt:'2026-10-28T10:12+09:00'},'2026-10-28T10:29:00+09:00')
];
export class FireError extends Error{constructor(code,message){super(message);this.code=code;}}
export function validateIncidents(rows){
  if(!Array.isArray(rows)||rows.length>3000)throw new FireError('FIRE_INVALID','화재현황 응답 구조가 올바르지 않습니다.');
  for(const r of rows){
    if(!r||['id','name','address','region','type','status','source'].some(k=>typeof r[k]!=='string'||!r[k]||r[k].length>1000)||typeof r.mock!=='boolean'||!r.times||typeof r.times!=='object'||Array.isArray(r.times)||(r.updatedAt!==null&&!Number.isFinite(Date.parse(r.updatedAt))))throw new FireError('FIRE_INVALID','화재현황 사건 구조가 올바르지 않습니다.');
    if(r.sourceTime&&(typeof r.sourceTime.raw!=='string'||!r.sourceTime.raw||r.sourceTime.raw.length>80||!nfdsTimeLabels.includes(r.sourceTime.label)||r.sourceTime.dateKnown!==false||r.sourceTime.kind!=='unclassified'))throw new FireError('FIRE_INVALID','의미 미확인 시각 구조가 올바르지 않습니다.');
    const inferred=r.sourceTime?.dateInference;
    if(inferred){const iso=/^\d{4}-\d{2}-\d{2}$/;if(!iso.test(inferred.date)||!iso.test(inferred.anchorDate)||!Number.isInteger(inferred.dayOffset)||inferred.dayOffset<0||inferred.dayOffset>3000||inferred.timeZone!=='Asia/Seoul'||inferred.method!=='descending-clock-rollover'||!Number.isInteger(inferred.originalIndex)||inferred.originalIndex<0||inferred.originalIndex>=3000||!Number.isFinite(Date.parse(inferred.date))||Date.parse(inferred.anchorDate)-Date.parse(inferred.date)!==inferred.dayOffset*86400000)throw new FireError('FIRE_INVALID','NFDS 추정 날짜 구조가 올바르지 않습니다.');}
    for(const [key,t]of Object.entries(r.times))if(!Object.hasOwn(timeLabels,key)||!t||!['minute','second'].includes(t.precision)||typeof t.raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?\+09:00$/.test(t.raw)||!Number.isFinite(Date.parse(t.raw))||typeof t.approximate!=='boolean'||t.precision!==(t.raw.slice(0,-6).length===16?'minute':'second'))throw new FireError('FIRE_INVALID','시각의 종류·정밀도·시간대를 확인해 주세요.');
  }
  const content=row=>{const copy=structuredClone(row);if(copy.sourceTime?.dateInference)copy.sourceTime.dateInference.originalIndex=0;return JSON.stringify(copy);};
  const unique=new Map();for(const row of rows){const old=unique.get(row.id);if(!old||Date.parse(old.updatedAt)<Date.parse(row.updatedAt))unique.set(row.id,structuredClone(row));else if(content(old)!==content(row)&&row.updatedAt===null)throw new FireError('FIRE_INVALID','동일 NFDS 식별자에 서로 다른 사건 정보가 있어 반영하지 않았습니다.');}
  return [...unique.values()];
}
export function searchIncidents(rows,query={}){
  const q=String(query.keyword||'').trim(),memo=String(query.memo||'').trim();
  if(q.length>200||memo.length>12000)throw new FireError('FIRE_QUERY','검색어가 너무 깁니다.');
  const from=query.from?Date.parse(query.from+'+09:00'):null,to=query.to?Date.parse(query.to+'+09:00'):null;
  if((query.from&&!Number.isFinite(from))||(query.to&&!Number.isFinite(to))||(from!==null&&to!==null&&from>to))throw new FireError('FIRE_QUERY','검색 시작·종료 시각을 확인해 주세요.');
  if(memo&&/천장|교통사고|낙하|붕괴/.test(memo)&&!/화재|불이|불났|불남|불꽃|연기/.test(memo))return {incidents:[],notice:'화재로 명시되지 않은 사고 메모입니다. 화재 사건과 자동 연결하지 않았습니다.'};
  const tokens=[...new Set((memo.match(/[가-힣\d-]+/g)||[]).filter(t=>t.length>1&&!/^(지금|에서|발생|화재|화재가|있어|확인|보고서|작성|필요)$/.test(t)))];
  const memoDate=memo.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const date=memoDate?`${memoDate[1]}-${memoDate[2].padStart(2,'0')}-${memoDate[3].padStart(2,'0')}`:null;
  const ranked=[];
  for(const r of rows){
    if(query.region&&r.region!==query.region)continue;
    const haystack=`${r.address} ${r.name}`;
    if(q&&!haystack.includes(q))continue;
    const relevant=Object.values(r.times).map(t=>Date.parse(t.raw));
    if((from!==null||to!==null)&&!relevant.some(t=>(from===null||t>=from)&&(to===null||t<=to)))continue;
    const reasons=[];let rank=0;
    if(q){reasons.push('검색어 일치');rank+=5;}
    const addressTokens=tokens.filter(t=>haystack.includes(t));
    if(memo&&!addressTokens.length&&!date)continue;
    for(const token of addressTokens){reasons.push(`${token} 일치`);rank+=token.endsWith('동')?3:2;}
    if(date&&Object.values(r.times).some(t=>t.raw.startsWith(date))){reasons.push('메모의 날짜 일치');rank++;}else if(date&&r.sourceTime?.dateInference){if(date===r.sourceTime.dateInference.date){reasons.push('메모 날짜와 추정 날짜 일치 (원본 날짜 미확인)');rank++;}else reasons.push('메모 날짜와 추정 날짜 다름 · 담당자 확인 필요');}else if(date&&r.sourceTime)reasons.push('메모 날짜와 비교 불가 · 사건 날짜 미제공');else if(date&&memo)continue;
    if(from!==null||to!==null)reasons.push('검색 시간 범위 내 (제공된 시각 중 하나)');
    ranked.push({...r,reasons:reasons.length?reasons:['조건에 해당하는 후보 · 담당자 선택 필요'],rank});
  }
  return {incidents:ranked.sort((a,b)=>b.rank-a.rank).map(({rank,...r})=>r),notice:'시각 범위는 제공된 각 단계 시각 중 하나를 기준으로 검색합니다. 발생시각이 없으면 발생일시에 넣지 않습니다.'};
}
export class OfficialFireAdapter{
  async fetch(){throw new FireError('FIRE_NOT_CONFIGURED','공식 API 연결 미설정: 사건 단위 API 사용 조건·응답 규격·각 일시의 의미 확인이 필요합니다.');}
}
export class MockFireAdapter{
  async fetch(scenario){
    if(scenario==='failure')throw new FireError('FIRE_CONNECTION','가상 연결 실패 시험입니다. 가상 목록으로 자동 전환하지 않습니다.');
    if(scenario==='empty')return [];
    const rows=structuredClone(base);
    if(scenario==='revised')rows.push(event('mock-001','가상 한빛창고 화재','가상시 가상동 123번지 한빛창고',{occurredAt:'2026-10-28T09:57+09:00',reportedAt:'2026-10-28T10:03+09:00',orderedAt:'2026-10-28T10:04+09:00',dispatchedAt:'2026-10-28T10:05+09:00',arrivedAt:'2026-10-28T10:12+09:00'},'2026-10-28T10:45:00+09:00'));
    return rows;
  }
}
export function createFireService({official=new OfficialFireAdapter(),mock=new MockFireAdapter(),nfds=new NfdsFireAdapter(),timeoutMs=15000}={}){
  let active=false,last=0;
  return async query=>{
    if(!query||!['mock','official','nfds'].includes(query.mode)||!['normal','revised','empty','failure'].includes(query.scenario||'normal'))throw new FireError('FIRE_QUERY','조회 모드와 시험 시나리오를 확인해 주세요.');
    if(active||Date.now()-last<300)throw new FireError('FIRE_RATE','중복 조회입니다. 잠시 후 수동 새로고침해 주세요.');
    active=true;last=Date.now();let timer;const controller=new AbortController();
    try{
      const payload=await Promise.race([(query.mode==='mock'?mock:query.mode==='nfds'?nfds:official).fetch(query.scenario||'normal',{signal:controller.signal,sidoCode:query.sidoCode||''}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new FireError('FIRE_TIMEOUT','화재현황 조회 시간이 초과됐습니다.'));},timeoutMs);})]);
      const rows=query.mode==='nfds'?payload.incidents:payload;
      const normalized=validateIncidents(rows);
      if(query.mode!=='mock'&&normalized.some(row=>row.mock))throw new FireError('FIRE_INVALID','실제 조회 결과에 가상 사건이 포함되어 적용하지 않았습니다.');
      // 조회 당시 한국 날짜와 전국 원본 목록으로 계산한 추정 날짜는 원본 시각 종류와 구분한다.
      const live=query.mode==='nfds';const result=searchIncidents(normalized,live?{...query,region:'',from:'',to:''}:query);
      if(live){for(const row of result.incidents)row.reasons.push(row.sourceTime?.dateInference?'현재 한국 날짜·최신순 목록 가정으로 날짜 추정 · 시각 종류 미확인':'날짜 추정 불가 · 시각 종류 미확인');result.notice='현재 한국 날짜를 첫 행에 붙이고 전국 원본 목록의 시각이 증가하는 지점마다 D-1, D-2로 날짜를 역추적합니다. 최신순 목록이라는 가정에 따른 추정이며 발생일시로 확정하지 않습니다. 현재 제공 목록만 조회하며 기간 검색은 지원하지 않습니다. 자동 갱신 없음 · 60초 캐시(공식 갱신 주기 아님).';}
      return {...result,mode:query.mode,fetchedAt:live?payload.fetchedAt:new Date().toISOString(),source:query.mode==='mock'?SOURCE:live?NFDS_SOURCE:'공식 연결 어댑터',automaticRefresh:false,...(live?{cached:payload.cached,dataAsOf:payload.dataAsOf,dateInferenceAnchor:payload.dateInferenceAnchor}:{})};
    }finally{clearTimeout(timer);active=false;}
  };
}
