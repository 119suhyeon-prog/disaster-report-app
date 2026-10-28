import {timeLabels,formatFireTime,buildFirePlan,nfdsRegions} from './fire-model.js';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function initFirePanel({api,getReport,getMemo,apply,toast,getImports=()=>({})}){
  let rows=[],selection=null,fetchedAt='',mode='mock',fetching=false,selectionHistory=[],lastRequest=0,requestVersion=0,visibleLimit=8,reportCreatedAt=new Date().toISOString();
  const panel=el('section',undefined,'panel fire-panel');panel.setAttribute('aria-label','화재출동현황 로컬 시험');
  panel.innerHTML=`<div class="fire-heading"><div><span class="eyebrow">LOCAL FIRE DISPATCH TRIAL</span><h2>화재출동현황 · 사건 시각 가져오기</h2><p id="fire-connection">가상 데이터 데모</p></div><button type="button" class="secondary" id="fire-toggle" aria-expanded="true">화재출동현황 조회 접기</button></div>
  <div id="fire-body"><div class="fire-notice" id="fire-notice" hidden>발생·119 신고접수·출동·도착은 서로 다른 시각입니다. 사건을 직접 선택한 뒤 반영하세요. 가상 자료 기준일: 2026. 10. 28.</div>
  <form id="fire-search" class="fire-filters"><label>데이터 연결<select name="mode"><option value="mock">가상 데이터 데모</option><option value="nfds">NFDS 실제 조회</option><option value="official">공식 API (미설정)</option></select></label><label>시험 시나리오<select name="scenario"><option value="normal">기본 가상 사건</option><option value="revised">한빛창고 발생시각 정정</option><option value="empty">검색 결과 없음</option><option value="failure">연결 실패 시험</option></select></label><label>지역<select name="region"><option value="">전체 가상 지역</option><option value="가상시">가상시</option></select></label><label>시작 일시 (한국시간)<input type="datetime-local" name="from" value="2026-10-27T00:00"></label><label>종료 일시 (한국시간)<input type="datetime-local" name="to" value="2026-10-28T23:59"></label><label>주소·건물·사건명<input name="keyword" maxlength="200" placeholder="예: 한빛창고, 가상동"></label><div class="fire-search-actions"><button type="submit" class="primary">조회 / 수동 새로고침</button><button type="button" class="secondary" id="fire-memo">상황 메모에서 관련 사건 찾기</button><button type="button" class="secondary" id="fire-sample">가상 메모 입력</button></div></form>
  <p id="fire-status" class="fire-status" role="status">가상 데이터 데모 · 조회 버튼을 누르면 가상 후보가 표시됩니다. 자동 조회하지 않습니다.</p>
  <div class="fire-grid"><div><h3>사건 후보 <span id="fire-count">0건</span></h3><div id="fire-results" aria-live="polite"></div></div><div><h3>선택 사건 · 시각 비교</h3><div id="fire-detail">사건을 선택해 주세요.</div></div></div>
  <details class="fire-history"><summary>이 화면의 선택·반영 이력 (새로고침 시 삭제)</summary><div id="fire-history"></div></details>
  <details class="fire-source"><summary>조회 정보</summary><p id="fire-info-content">가상 데이터 데모</p><a href="https://www.nfds.go.kr/dashboard/monitor.do" target="_blank" rel="noopener noreferrer">NFDS 원문 보기 ↗</a></details></div>`;
  document.querySelector('.workspace').before(panel);
  const $=selector=>panel.querySelector(selector),form=$('#fire-search');
  const state=text=>$('#fire-status').textContent=text;const compactTime=t=>(t.dateInference?t.dateInference.date+' ':'')+t.raw;
  const labelTime=t=>!t?'미제공':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(t));
  const started=el('p',undefined,'fire-small');$('#fire-status').before(started);
  const showStarted=()=>started.textContent=`작성 시작: ${labelTime(reportCreatedAt)}`;showStarted();
  $('#fire-toggle').onclick=()=>{const collapsed=$('#fire-body').hidden=!$('#fire-body').hidden;$('#fire-toggle').setAttribute('aria-expanded',String(!collapsed));$('#fire-toggle').textContent=collapsed?'화재출동현황 조회 펼치기':'화재출동현황 조회 접기';};
  function record(message){selectionHistory.push(`${labelTime(new Date().toISOString())} · ${message}`);const p=el('p',selectionHistory.at(-1));$('#fire-history').append(p);}
  function showList(){
    const root=$('#fire-results');root.replaceChildren();$('#fire-count').textContent=`${rows.length}건`;
    if(!rows.length){root.append(el('p','조건에 맞는 사건이 없습니다. 현재 보고서는 변경하지 않았습니다.','fire-empty'));return;}
    for(const incident of rows.slice(0,visibleLimit)){
      const card=el('article',undefined,'fire-card');card.append(el('span',incident.mock?'가상 사건':'NFDS 실제 자료','fire-chip'),el('h4',incident.name),el('p',`${incident.region} · ${incident.address}`),el('p',`진행: ${incident.status} · ${incident.type}`));
      if(incident.sourceTime)card.append(el('p',`일시: ${compactTime(incident.sourceTime)}`,'fire-time'));if(incident.handling)card.append(el('p',`NFDS 처리 구분: ${incident.handling}`));
      for(const [key,t]of Object.entries(incident.times))card.append(el('p',`${timeLabels[key]}: ${formatFireTime(t)}`,'fire-time'));
      const reasons=incident.reasons.filter(reason=>!/최신순|시각 종류|추정 날짜|사건 날짜|조건에 해당|담당자 확인/.test(reason));if(reasons.length)card.append(el('p',reasons.slice(0,3).join(' · '),'fire-reason'));

      const button=el('button','이 사건 선택','secondary');button.type='button';button.onclick=()=>{selection=incident;record(`${incident.name} 선택 · ${incident.id}`);showDetail();};card.append(button);root.append(card);
    }
    if(rows.length>visibleLimit){const more=el('button',`더 보기 (남은 ${rows.length-visibleLimit}건)`,'secondary');more.type='button';more.onclick=()=>{visibleLimit+=8;showList();};root.append(more);}
  }
  function showDetail(){
    const root=$('#fire-detail');root.replaceChildren();if(!selection)return;
    root.append(el('span',selection.mock?'가상 사건 · 실제 화재 아님':'NFDS 실제 자료','fire-chip'),el('h4',selection.name),el('p',selection.address));
    const evidence=el('details');evidence.append(el('summary','입력 근거'));evidence.append(el('p',`출처: ${selection.source}\n원본 시각: ${JSON.stringify({times:selection.times,sourceTime:selection.sourceTime})}\n자료 기준: ${selection.dataAsOf||'미제공'} · 조회: ${labelTime(fetchedAt)}`,'fire-small'));root.append(evidence);
    const times=el('dl',undefined,'fire-time-list');
    for(const [key,t]of Object.entries(selection.times)){times.append(el('dt',timeLabels[key]),el('dd',`${formatFireTime(t)} (${t.precision==='minute'?'분':'초'} 단위, 한국시간) · 원본 ${t.raw}`));}
    if(selection.sourceTime)times.append(el('dt','일시'),el('dd',compactTime(selection.sourceTime)));root.append(times);
    const plans=buildFirePlan(selection,getReport(),getImports());
    for(const plan of plans){const box=el('div',undefined,'fire-compare');box.append(el('strong',plan.label),el('p',`현재 값: ${plan.previous||'미입력'}`),el('p',`선택 사건 값: ${plan.value}`));root.append(box);}
    const acknowledge=el('label',undefined,'fire-ack');const check=el('input');check.type='checkbox';acknowledge.append(check,document.createTextNode(' 선택한 사건과 반영 내용을 확인했습니다.'));root.append(acknowledge);
    const applyButton=el('button','선택 정보 반영','primary');applyButton.type='button';applyButton.disabled=true;check.onchange=()=>applyButton.disabled=!check.checked;
    applyButton.onclick=()=>{
      // 사용자가 비교한 후 보고서를 편집했다면 현재 값으로 비교를 다시 보여준다.
      const currentPlans=buildFirePlan(selection,getReport(),getImports());
      if(JSON.stringify(currentPlans)!==JSON.stringify(plans)){showDetail();toast('보고서가 변경되어 시각 비교를 갱신했습니다. 다시 확인해 주세요.');return;}
      const changed=plans.filter(p=>p.changed);if(!changed.length){toast('이미 반영된 내용입니다.');return;}
      apply(selection,changed,{fetchedAt,source:selection.source,selectedAt:new Date().toISOString(),reportCreatedAt});record(`${selection.name} 반영 요청 · ${changed.map(p=>p.label).join(', ')} · 자료 ${selection.updatedAt||'갱신시각 미제공'}`);applyButton.disabled=true;
    };root.append(applyButton);
  }
  async function search(useMemo=false){
    if(fetching||Date.now()-lastRequest<300)return;lastRequest=Date.now();fetching=true;
    const query=Object.fromEntries(new FormData(form));if(query.mode==='nfds'){query.sidoCode=query.region||'';delete query.region;delete query.from;delete query.to;}if(useMemo){query.memo=getMemo().trim();if(!query.memo){state('상황 메모를 먼저 입력해 주세요.');fetching=false;return;}}
    const version=++requestVersion;visibleLimit=8;selection=null;rows=[];$('#fire-results').replaceChildren();$('#fire-count').textContent='0건';$('#fire-detail').textContent='조회 중입니다. 새 결과에서 사건을 선택해 주세요.';
    mode=query.mode;state(mode==='mock'?'가상 데이터 데모 조회 중…':query.mode==='nfds'?'NFDS 실제 데이터 조회 중…':'실제 데이터 조회 중… (공식 연결 여부 확인)');
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    try{
      const response=await api('/api/fire-incidents',query);const data=await response.json();if(version!==requestVersion)return;rows=data.incidents;fetchedAt=data.fetchedAt;selection=null;
      $('#fire-detail').textContent='사건을 선택해 주세요.';
      $('#fire-info-content').textContent=`${data.notice}\n자료 기준: ${data.dataAsOf||'미제공'}\n날짜 추정 기준: ${data.dateInferenceAnchor||'해당 없음'}\n출처: ${data.source}`;
      state(`조회 완료 · ${mode==='mock'?'가상 데이터':'NFDS'} · ${rows.length}건 · ${labelTime(fetchedAt)}${data.cached?' · 캐시':''}`);showList();
    }catch(error){if(version!==requestVersion)return;rows=[];selection=null;$('#fire-results').replaceChildren();$('#fire-count').textContent='0건';$('#fire-detail').textContent='조회 실패로 후보 선택·반영을 사용할 수 없습니다. 보고서는 유지됩니다.';state(`${error.code==='FIRE_NOT_CONFIGURED'?'공식 API 연결 미설정':'조회 실패'} · ${error.message}`);}
    finally{fetching=false;for(const button of form.querySelectorAll('button'))button.disabled=false;}
  }
  form.elements.mode.onchange=()=>{
    const live=form.elements.mode.value==='nfds';
    form.elements.region.replaceChildren(new Option(live?'전국':'전체 가상 지역',''),...(live?nfdsRegions.map(([code,name])=>new Option(name,code)):[new Option('가상시','가상시')]));
    for(const name of ['from','to','scenario'])form.elements[name].disabled=live;
    $('#fire-notice').textContent=live?'NFDS 실제 화면용 조회입니다. 현재 제공 목록만 조회합니다. 첫 행은 현재 한국 날짜, 목록에서 시각이 증가할 때마다 D-1로 역추적하여 추정 날짜를 붙입니다. 시각 종류는 미확인이며 발생일시에 자동 입력하지 않습니다. 지역 외 주소·건물명·메모는 로컬 서버에서만 검색하며 NFDS에 전송하지 않습니다.':'발생·119 신고접수·출동·도착은 서로 다른 시각입니다. 가상 자료 기준일: 2026. 10. 28.';
    $('#fire-connection').textContent=live?'NFDS 실제 자료':'가상 데이터 데모';
    rows=[];selection=null;requestVersion++;showList();$('#fire-detail').textContent='조회 버튼을 누른 뒤 사건을 선택해 주세요.';state(live?'NFDS 조회 대기':'가상 데이터 조회 대기');
  };
  form.onsubmit=event=>{event.preventDefault();search();};$('#fire-memo').onclick=()=>search(true);
  $('#fire-sample').onclick=()=>{document.querySelector('#situation').value='2026년 10월 28일 가상시 가상동 123번지 한빛창고에서 화재 발생. 인명피해 확인 중.';toast('가상 상황 메모를 입력했습니다. 관련 사건 찾기를 눌러 주세요.');};
  return {reset(){requestVersion++;reportCreatedAt=new Date().toISOString();showStarted();rows=[];selection=null;selectionHistory=[];$('#fire-results').replaceChildren();$('#fire-detail').textContent='후보를 조회하고 사건을 선택해 주세요.';$('#fire-count').textContent='0건';$('#fire-history').replaceChildren();state('새 보고서 · 선택한 연결 모드에서 다시 조회해 주세요.');}};
}
