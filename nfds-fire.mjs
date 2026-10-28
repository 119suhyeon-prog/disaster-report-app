// NFDS 공개 웹 화면용 요청. 외부 활용용 공식 API 계약으로 간주하지 않는다.
export const NFDS_URL='https://www.nfds.go.kr/dashboard/monitorData.do';
export const NFDS_SOURCE='NFDS 화재출동현황 · 공개 화면용 요청 (외부 활용용 공식 API 미확인)';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const optional=(value,max=500)=>{if(value==null)return '';if(typeof value!=='string'||value.length>max)throw fail('FIRE_INVALID','NFDS 사건 필드 형식이 변경되었습니다.');return value.trim();};
export function seoulDate(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function inferNfdsDates(rows,{now=Date.now()}={}){
  const anchorDate=seoulDate(now);let previous=null,dayOffset=0,chainValid=true;
  return rows.map((row,index)=>{
    const raw=row.sourceTime?.raw;const match=typeof raw==='string'&&raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if(!match){chainValid=false;return {...row,dateInferenceNote:'원본 목록에 없거나 해석할 수 없는 시각이 있어 이 행부터 날짜 역추적을 중단했습니다.'};}
    if(!chainValid)return {...row,dateInferenceNote:'앞선 행의 시각이 불명확하여 날짜를 자동 추정하지 않았습니다.'};
    const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0);
    if(previous!==null&&seconds>previous)dayOffset++;
    previous=seconds;
    const date=new Date(Date.parse(anchorDate+'T00:00:00Z')-dayOffset*86400000).toISOString().slice(0,10);
    return {...row,sourceTime:{...row.sourceTime,label:'NFDS 표시 일시 (날짜 추정·종류 미확인)',dateInference:{date,dayOffset,anchorDate,timeZone:'Asia/Seoul',method:'descending-clock-rollover',originalIndex:index}}};
  });
}
export function normalizeNfdsPayload(data,{now=Date.now()}={}){
  if(!data||!Array.isArray(data.defail)||data.defail.length>3000||typeof data.nowDate!=='string'||data.nowDate.length>80)throw fail('FIRE_INVALID','NFDS 응답에 사건 상세(defail) 또는 자료 기준시각이 없습니다.');
  return inferNfdsDates(data.defail.map(row=>{
    if(!row||typeof row!=='object')throw fail('FIRE_INVALID','NFDS 사건 구조를 확인해 주세요.');
    const id=optional(row.sidoOvrNum,100);if(!id)throw fail('FIRE_INVALID','NFDS 사건 식별자가 없습니다.');
    const region=optional(row.sidoNm)||'지역 미제공',station=optional(row.cntrNm)||`${region} (관할 소방서 미제공)`;
    const raw=optional(row.overDate,80),code=optional(row.progressStat,20);
    const status=code==='G'?'잔불정리':code==='H'?'잔불감시':optional(row.progressNm)||`진행상태 미제공${code?' ('+code+')':''}`;
    return {id:`nfds:${optional(row.lawSidoCd,10)||'unknown'}:${id}`,name:`${station} · 화재출동현황`,station,address:optional(row.addr)||'주소 미제공',region,type:'화재출동현황',handling:optional(row.frfalTypeCd),status,mock:false,source:NFDS_SOURCE,updatedAt:null,dataAsOf:data.nowDate,times:{},
      // 원본은 보존하고 현재 한국 날짜·원본 목록 순서에 의한 추정 날짜를 별도로 연결한다.
      ...(raw?{sourceTime:{raw,label:'NFDS 표시 일시 (날짜·종류 미확인)',dateKnown:false,kind:'unclassified'}}:{})};
  }),{now});
}
export class NfdsFireAdapter{
  constructor({fetchImpl=fetch,clock=Date.now,cacheMs=60000}={}){this.fetchImpl=fetchImpl;this.clock=clock;this.cacheMs=cacheMs;this.cache=new Map();}
  async fetch(_scenario,{signal,sidoCode=''}={}){
    if(typeof sidoCode!=='string'||!['','11','26','27','28','29','30','31','36','41','42','43','44','45','46','47','48','50'].includes(sidoCode))throw fail('FIRE_QUERY','NFDS 화면에서 제공하는 지역 코드만 조회할 수 있습니다.');
    // 지역 필터 이전 전국 목록 전체에서 역추적해야 다른 지역으로 검색해도 날짜가 유지된다.
    const regions={'11':'서울','26':'부산','27':'대구','28':'인천','29':'광주','30':'대전','31':'울산','36':'세종','41':'경기','42':'강원','43':'충북','44':'충남','45':'전북','46':'전남','47':'경북','48':'경남','50':'제주'};
    const select=result=>({...result,incidents:sidoCode?result.incidents.filter(row=>row.region===regions[sidoCode]):result.incidents});
    const previous=this.cache.get(''),now=this.clock();
    if(previous&&now-previous.savedAt<this.cacheMs&&seoulDate(now)===seoulDate(previous.savedAt))return select({...structuredClone(previous.result),cached:true});
    let response;
    try{response=await this.fetchImpl(NFDS_URL,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded','Referer':'https://www.nfds.go.kr/dashboard/monitor.do'},body:new URLSearchParams({sidoCode:''}),signal,redirect:'error',credentials:'omit'});}
    catch(error){if(signal?.aborted)throw fail('FIRE_TIMEOUT','NFDS 조회 시간이 초과됐습니다.');throw fail('FIRE_CONNECTION','NFDS에 연결하지 못했습니다. 네트워크 또는 사이트 응답을 확인해 주세요.');}
    if(!response.ok)throw fail('FIRE_CONNECTION',`NFDS 조회 실패 (HTTP ${response.status}). 가상 데이터로 대체하지 않았습니다.`);
    if(!response.headers.get('content-type')?.includes('application/json'))throw fail('FIRE_INVALID','NFDS가 JSON 대신 다른 내용을 반환했습니다. 로그인·접근 제한을 우회하지 않습니다.');
    if(Number(response.headers.get('content-length')||0)>2_000_000)throw fail('FIRE_INVALID','NFDS 응답이 허용 크기를 넘었습니다.');
    // 스트림을 제한하여 Content-Length가 없는 응답도 크기를 검사한다.
    let text='',length=0;const decoder=new TextDecoder();
    for await(const chunk of response.body){length+=chunk.byteLength;if(length>2_000_000)throw fail('FIRE_INVALID','NFDS 응답이 허용 크기를 넘었습니다.');text+=decoder.decode(chunk,{stream:true});}text+=decoder.decode();
    let data;try{data=JSON.parse(text);}catch{throw fail('FIRE_INVALID','NFDS JSON 응답 형식이 올바르지 않습니다.');}
    const fetched=this.clock();const result={incidents:normalizeNfdsPayload(data,{now:fetched}),fetchedAt:new Date(fetched).toISOString(),dataAsOf:data.nowDate,cached:false,dateInferenceAnchor:seoulDate(fetched)};
    this.cache.set('',{savedAt:fetched,result:structuredClone(result)});return select(result);
  }
}
