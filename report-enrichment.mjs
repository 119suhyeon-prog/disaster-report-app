import registry from './data/jurisdictions.json' with {type:'json'};
const aliases={서울:'서울특별시',부산:'부산광역시',대구:'대구광역시',인천:'인천광역시',광주:'광주광역시',대전:'대전광역시',울산:'울산광역시',세종:'세종특별자치시',경기:'경기도',강원:'강원특별자치도',충북:'충청북도',충남:'충청남도',전북:'전북특별자치도',전남:'전라남도',경북:'경상북도',경남:'경상남도',제주:'제주특별자치도'};
const tokens=text=>[...new Set(text.match(/[가-힣]+(?:시|군|구)(?=\s|에서|의|내|[,.]|$)/g)||[])];
export function resolveJurisdiction(text){
  const observed=tokens(text),explicit=new Set();
  const direct=[...new Set([...registry.records.map(row=>row.province),...Object.values(aliases)])].filter(full=>text.includes(full));
  for(const full of direct)explicit.add(full);
  if(!direct.length)for(const [short,full]of Object.entries(aliases)){
    const names=[full,short,...(['서울','부산','대구','인천','대전','울산','세종'].includes(short)?[short+'시']:[]),...(short==='강원'?['강원도']:short==='전북'?['전라북도']:short==='제주'?['제주도']:[])];
    if(names.some(name=>new RegExp(`(?:^|[^가-힣])${name}(?=$|[^가-힣]|[가-힣]+[시군구])`).test(text)))explicit.add(full);
  }
  const matches=registry.records.filter(row=>observed.some(token=>row.municipality.split(' ').includes(token)));
  let candidates=explicit.size===1?matches.filter(row=>row.province===[...explicit][0]):matches;
  const provinces=new Set(candidates.map(row=>row.province));
  const province=explicit.size===1?[...explicit][0]:explicit.size===0&&provinces.size===1&&!(observed.includes('광주시')&&observed.length===1)?[...provinces][0]:'';
  if(explicit.size>1)return {province:'',observed,ambiguous:true};
  if(province&&explicit.size===1&&matches.length&&!candidates.length)return {province:'',observed,ambiguous:true};
  return {province,observed,ambiguous:!province&&observed.length>0,lookup:explicit.size===0};
}
export function extractPersonnel(text){
  const groups=new Map(),pattern=/(의용소방대(?:원)?|소방(?:대원|공무원|인력|인원|관|차)?|경찰(?:관|인력|차)?|해양경찰(?:관)?|해경|공무원|군인|군\s*병력)\s*(?:인력\s*)?(?:총\s*|누계\s*)?(?:[\d,]+\s*대\s*)?(약\s*)?([\d,]+)\s*명/g;
  for(const match of text.matchAll(pattern)){
    const after=text.slice(match.index+match[0].length,match.index+match[0].length+15);
    if(/^\s*(?:이|가|은|는|의)?\s*(?:부상|사망|실종|대피|구조됨|구조됐|이송|대기|출동\s*예정|동원\s*예정)/.test(after))continue;
    const before=text.slice(Math.max(0,match.index-10),match.index);if(/추가\s*$|증원\s*$/.test(before)||/^\s*(?:을|를)?\s*추가/.test(after))continue;
    const agency=match[1].startsWith('의용')?'의용소방대':match[1].startsWith('소방')?'소방':match[1].startsWith('경찰')?'경찰':/해양경찰|해경/.test(match[1])?'해경':match[1].startsWith('군')?'군':'공무원';
    if(!groups.has(agency))groups.set(agency,new Set());groups.get(agency).add(`${match[2]?'약 ':''}${match[3]}명`);
  }
  return [...groups].map(([agency,counts])=>`${agency} ${counts.size===1?[...counts][0]:'인원 확인 중'}`).join(', ');
}
function disasterType(text){
  if(/천장[^.!?\n]{0,15}(?:낙하|떨어)|천장\s*낙하/.test(text))return '천장 낙하';
  if(/산불/.test(text))return '산불';
  if(/화재|불이\s*(?:났|발생)|불났/.test(text)&&!/화재\s*(?:아님|아니|없음)/.test(text)){
    const building=text.match(/단독주택|다세대|다가구|주택|아파트|공장|창고|상가|차량/);return (building?(/단독주택|다세대|다가구/.test(building[0])?'주택':building[0]):'')+'화재';
  }
  return ['교통사고','산사태','침수','폭발','붕괴','지진','정전'].find(type=>text.includes(type))||'';
}
export function applyReportConventions(result,text,current={}){
  const report=result.report,notes=[];result.sources??={};result.metadata??={};
  const update=(key,value,source,status='확인')=>{report[key]=value;result.sources[key]=source;result.metadata[key]={source,status,actionState:'해당 없음',grounded:!!source,needsConfirmation:false,origin:'format-rule'};};
  const place=report.location||current.location||'',geo=resolveJurisdiction(place||text);
  const scene=place||text.split(/화재|불이|폭발|낙하|붕괴|침수/)[0];
  const provinceNames=new Set([...Object.values(aliases),...Object.keys(aliases).map(short=>short+'시'),...registry.records.map(row=>row.province)]);
  const rawRegion=tokens(scene).filter(token=>!provinceNames.has(token));
  const local=scene.match(/(?:^|\s)([가-힣\d]+(?:동|읍|면|리))(?=\s|에서|\d|[,.]|$)/)?.[1];
  const type=disasterType(text)||disasterType(report.overview||current.overview||'');
  const explicitTitle=/(?:^|\n)\s*제목\s*[:：]/.test(text),explicitRecipient=/(?:^|\n)\s*수신\s*[:：]/.test(text);
  if(!explicitTitle&&type&&(rawRegion.length||local||geo.province))update('title',[geo.province,...rawRegion,local,type].filter(Boolean).filter((value,index,arr)=>arr.indexOf(value)===index).join(' '),place||text);
  if(!explicitRecipient&&geo.province)update('recipient',`${geo.province}, 행정안전부`,place||text,geo.lookup?'추정':'확인');
  else if(!explicitRecipient){report.recipient='';delete result.metadata.recipient;delete result.sources.recipient;if(geo.ambiguous)notes.push('지역의 시도를 하나로 확인할 수 없어 수신 자동 입력을 보류했습니다. 시도를 함께 입력하거나 수신을 직접 확인해 주세요.');}
  const personnel=extractPersonnel(text);if(personnel)update('personnel',personnel,text,/인원 확인 중/.test(personnel)?'상충':'확인');
  else if(report.personnel){report.personnel='';delete result.metadata.personnel;delete result.sources.personnel;notes.push('동원인력에서 기관별 확인된 인원을 찾지 못했습니다. 인원은 직접 확인해 주세요.');}
  return {...result,conventionNotes:notes};
}
