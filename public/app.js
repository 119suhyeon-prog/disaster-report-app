import {requiredValueValid,explicitRequiredFields} from './required-rules.js';
import {mergeDraft} from './merge.js';
const $=selector=>document.querySelector(selector);
const provider=()=>schema?.ai?.providerLabel||'AI';
let metadata={},confirmed=new Set(),evidenceTokens=[],requestFailed=false;
let firePanel;
function applyFireInformation(incident,plans,context){
  let count=0;
  for(const plan of plans){
    const info={...(plan.key==='timeline'?{fireImports:{...(metadata.timeline?.fireImports||{}),[incident.id]:plan.importLines||[]}}:{}),source:`${context.source}\n${incident.name} (${incident.id})\n사건별 갱신 ${incident.updatedAt||'미제공'}\n자료 기준 ${incident.dataAsOf||'미제공'}\n조회 ${context.fetchedAt}\n선택 ${context.selectedAt}\n원본 시각 ${JSON.stringify({times:incident.times,sourceTime:incident.sourceTime})}\n${plan.value}`,status:'미확인',actionState:'해당 없음',grounded:true,needsConfirmation:false,origin:'fire',record:{id:incident.id,times:incident.times,sourceTime:incident.sourceTime,dataAsOf:incident.dataAsOf,updatedAt:incident.updatedAt,...context}};
    if(report[plan.key]||manual.has(plan.key)){pending=pending.filter(item=>item.key!==plan.key);pending.push({key:plan.key,value:plan.value,metadata:info});}
    else{report[plan.key]=plan.value;metadata[plan.key]=info;if(schema.requiredFields.includes(plan.key))confirmed.add(plan.key);count++;}
  }
  refresh();renderConflicts();$('#report-status').textContent=`화재현황에서 ${count}개 항목 반영 · 변경 후보 ${pending.length}건`;
  toast(pending.length?'기존 값과 비교할 변경 후보가 있습니다. 보고서에서 적용 여부를 선택하세요.':'선택한 시각을 반영했습니다. 나머지 필수 정보도 확인해 주세요.');
}
function markManual(key){manual.add(key);if(report[key]?.trim())confirmed.add(key);else confirmed.delete(key);metadata[key]={source:report[key],status:'미확인',actionState:'해당 없음',grounded:true,needsConfirmation:false,origin:'user'};}
function updateAIStatus(label){$('#ai-status').textContent=label;$('.demo-tag').textContent=label;}
function setupAIStatus(){
  const note=$('.mode-note');note.replaceChildren();const heading=document.createElement('strong');heading.id='ai-status';heading.setAttribute('role','status');heading.textContent=schema.ai.label;
  const explanation=document.createElement('p');explanation.textContent=schema.ai.mode==='rules-demo'?'규칙 기반 데모입니다. 실제 AI 문체 변환은 수행하지 않습니다.':schema.ai.mode==='openai'?'인터넷 테스트용입니다. 가상 상황 메모와 기존 사건 내용이 OpenAI API로 전송됩니다. 실제 사고정보·개인정보는 입력하지 마세요. API 키는 서버에만 설정합니다.':'구술형 메모를 온AI로 정리합니다. API 규격·인증 설정이 완료돼야 사용할 수 있습니다. 실제 연결 여부는 요청 결과로 확인합니다.';
  note.append(heading,explanation);const sampleButton=document.createElement('button');sampleButton.type='button';sampleButton.textContent='가상 화재 상황 불러오기 ↗';sampleButton.onclick=()=>{$('#situation').value=schema.sample;$('#situation').focus();};note.append(sampleButton);
  $('.demo-tag').textContent=schema.ai.label;
  $('footer').textContent=schema.localFireTrial?'로컬 시험용 · AI 메모 정리는 규칙 기반 데모 · 화재자료는 선택한 연결 모드 확인 · 새로고침하면 초안이 초기화됩니다.':schema.ai.mode==='openai'?'인터넷 테스트용 · 가상 데이터만 사용 · 메모는 OpenAI로 전송 · 새로고침하면 내용이 초기화됩니다.':'가상 데이터 시제품 · 새로고침하면 작성 내용이 초기화됩니다.';
  const evidence=document.createElement('details');evidence.className='evidence';const summary=document.createElement('summary');summary.textContent='입력 근거 보기';const contents=document.createElement('div');contents.id='evidence-content';evidence.append(summary,contents);$('.document').prepend(evidence);
}
function renderEvidence(){const root=$('#evidence-content');if(!root)return;root.replaceChildren();for(const [key,item]of Object.entries(metadata)){if(!report[key])continue;const line=document.createElement('p');const label=schema.fields.find(([k])=>k===key)?.[1]||key;line.textContent=`${label} · ${item.status} · ${item.actionState}\n${item.origin==='user'?'사용자 직접 입력':item.source||'입력 근거 없음 · 사용자 확인 필요'}\n보고 문장: ${report[key]}`;root.append(line);}}
let requiredDialog;
function setupRequiredDialog(){
  requiredDialog=document.createElement('dialog');requiredDialog.className='required-dialog';
  requiredDialog.setAttribute('aria-labelledby','required-title');requiredDialog.setAttribute('aria-describedby','required-help');
  const form=document.createElement('form');form.id='required-form';
  const heading=document.createElement('h2');heading.id='required-title';heading.textContent='필수 정보를 입력해 주세요';
  const help=document.createElement('p');help.id='required-help';help.textContent='보고서 작성에 필요한 정보가 빠졌습니다. 접수일시·담당자 성명·연락처를 입력해야 계속할 수 있습니다. 아직 파악되지 않은 사고 정보는 “확인 중”으로 입력할 수 있습니다.';
  const inputs=document.createElement('div');inputs.id='required-inputs';
  const error=document.createElement('p');error.id='required-error';error.setAttribute('role','alert');
  const button=document.createElement('button');button.type='submit';button.className='primary';button.textContent='입력 완료 · 보고서에 반영';
  form.append(heading,help,inputs,error,button);requiredDialog.append(form);document.body.append(requiredDialog);
  requiredDialog.addEventListener('cancel',event=>{event.preventDefault();$('#required-error').textContent='필수 항목을 모두 입력한 뒤 계속할 수 있습니다.';});
  form.onsubmit=event=>{
    event.preventDefault();let invalid;
    for(const input of inputs.querySelectorAll('textarea')){input.setCustomValidity(requiredValueValid(input.name,input.value)?'':explicitRequiredFields.includes(input.name)?'접수일시·담당자·연락처는 실제 내용을 입력해 주세요.':'공백 대신 확인된 내용 또는 확인 중을 입력해 주세요.');if(!input.checkValidity()){invalid??=input;}}
    if(invalid){invalid.reportValidity();return;}
    for(const input of inputs.querySelectorAll('textarea')){report[input.name]=input.value.trim();markManual(input.name);}
    if(missingRequiredFields().length){$('#required-error').textContent='누락된 필수 항목을 모두 입력해 주세요.';return;}
    requiredDialog.close();refresh();toast('필수 정보를 보고서에 반영했습니다.');
  };
  for(const [key,label] of schema.fields.filter(([key])=>schema.requiredFields.includes(key))){
    const input=$(`#field-${key}`);input.setAttribute('aria-required','true');
    const badge=document.createElement('span');badge.className='required-badge';badge.textContent='필수';input.previousElementSibling.prepend(badge);
    input.addEventListener('blur',()=>{if(history.length)enforceRequired();});
  }
}
function missingRequiredFields(){return schema.fields.filter(([key])=>schema.requiredFields.includes(key)&&(!requiredValueValid(key,report[key])||(!confirmed.has(key)&&(!metadata[key]?.grounded||metadata[key]?.needsConfirmation))));}
function enforceRequired(){
  if(!requiredDialog)return false;
  const missing=missingRequiredFields();if(!missing.length)return false;
  if(requiredDialog.open)return true;
  const root=$('#required-inputs');root.replaceChildren();$('#required-error').textContent='';
  for(const [key,label]of missing){
    const wrap=document.createElement('div');const caption=document.createElement('label');caption.htmlFor=`required-${key}`;caption.textContent=`${label} *`;
    const input=document.createElement('textarea');input.id=`required-${key}`;input.name=key;input.required=true;input.maxLength=1500;input.rows=key==='overview'?3:2;input.placeholder=explicitRequiredFields.includes(key)?(key==='receivedAt'?'예: 2026. 10. 28. 11:30':key==='author'?'담당자 성명 입력':'담당자 연락처 입력'):'확인된 내용 또는 확인 중';input.value=report[key]||'';
    input.addEventListener('input',()=>input.setCustomValidity(''));
    const unknown=document.createElement('button');unknown.type='button';unknown.className='unknown-button';unknown.textContent='확인 중으로 입력';unknown.onclick=()=>{input.value='확인 중';input.setCustomValidity('');input.focus();};
    wrap.append(caption,input);if(!explicitRequiredFields.includes(key))wrap.append(unknown);root.append(wrap);
  }
  requiredDialog.showModal();return true;
}
let schema,report={},manual=new Set(),history=[],pending=[],busy=false;
const toast=message=>{const t=$('#toast');t.textContent=message;t.classList.add('toast-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('toast-visible'),4500);};
function addMessage(role,text){const area=$('#messages');area.querySelector('.welcome')?.remove();const box=document.createElement('div');box.className=`message ${role}`;const label=document.createElement('small');label.textContent=role==='user'?'상황 메모':schema.ai.mode==='rules-demo'?'작성 도우미 · 규칙 기반':'작성 도우미 · '+provider();box.append(label,document.createTextNode(text));area.append(box);area.scrollTop=area.scrollHeight;}
function renderFields(){const form=$('#report-form');form.replaceChildren();for(const [title,items] of schema.sections){const group=document.createElement('fieldset');group.className='form-section';const legend=document.createElement('legend');legend.textContent=title;group.append(legend);const grid=document.createElement('div');grid.className='field-grid';for(const [key,label]of items){const field=document.createElement('div');field.className='field'+(['overview','timeline','support','plan','casualties','personnel','equipment','notification','dispatch','alert','evacuation'].includes(key)?' wide':'');const caption=document.createElement('label');caption.htmlFor=`field-${key}`;caption.append(document.createTextNode(label));const state=document.createElement('span');state.className='edited';state.id=`state-${key}`;caption.append(state);const input=document.createElement('textarea');input.id=`field-${key}`;input.name=key;input.rows=['overview','timeline','plan'].includes(key)?3:1;input.maxLength=1500;input.placeholder=['title','number','recipient','issuedAt','receivedAt','department','author','contact','timeline','support','plan'].includes(key)?'미입력':'확인 중';input.addEventListener('input',()=>{report[key]=input.value;markManual(key);refresh();});field.append(caption,input);grid.append(field);}group.append(grid);form.append(group);}refresh();}
function refresh(){renderEvidence();let count=0;for(const [key]of schema.fields){const input=$(`#field-${key}`);if(input.value!==report[key])input.value=report[key]||'';input.classList.toggle('has-value',!!report[key]);input.classList.toggle('manual',manual.has(key));$(`#state-${key}`).textContent=manual.has(key)?'직접 편집':'';if(report[key])count++;}$('#filled-count').textContent=`${count} / ${schema.fields.length} 항목 작성`;const missing=missingRequiredFields().map(([,label])=>label);$('#notice').textContent=missing.length?`우선 확인: ${missing.join(' · ')}. 미확인 정보는 추정하지 않고 그대로 보고합니다.`:'주요 항목이 입력됐습니다. 인명피해의 확인 수준과 완료·진행·예정 상태를 확인해 주세요.';}
function renderConflicts(){const root=$('#conflicts');root.replaceChildren();for(const item of pending){const card=document.createElement('div');card.className='conflict-card';const strong=document.createElement('strong');strong.textContent=`${schema.fields.find(([key])=>key===item.key)[1]} · ${manual.has(item.key)?'직접 편집한 항목':'변경 후보'}`;const p=document.createElement('p');p.textContent=`현재: ${report[item.key]}\n${item.metadata?.origin==='fire'?'새 외부 자료':'새 메모'}: ${item.value}${item.metadata?.origin==='fire'?'\n출처·시각 의미: '+item.metadata.source:''}`;card.append(strong,p);for(const [label,action]of [['새 내용으로 바꾸기','replace'],['현재 내용 유지','keep']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(action==='replace'){report[item.key]=item.value;metadata[item.key]=item.metadata;manual.delete(item.key);confirmed.delete(item.key);if(item.metadata?.origin==='fire'&&schema.requiredFields.includes(item.key))confirmed.add(item.key);}pending=pending.filter(x=>x!==item);refresh();renderConflicts();enforceRequired();};card.append(b);}root.append(card);}}
async function api(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok){const problem=await response.json().catch(()=>({error:'서버 응답을 확인할 수 없습니다.'}));const error=Error(problem.error);error.code=problem.code;throw error;}return response;}
$('#sample').onclick=()=>{$('#situation').value=schema.sample;$('#situation').focus();};
$('#chat-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const text=$('#situation').value.trim();if(!text){toast('상황 메모를 입력해 주세요.');return;}
  busy=true;requestFailed=false;$('#generate').disabled=true;$('#download').disabled=true;$('#copy').disabled=true;$('#reset').disabled=true;$('#situation').disabled=true;$('.mode-note button').disabled=true;
  $('#report-form').inert=true;$('#conflicts').inert=true;
  updateAIStatus(schema.ai.mode==='rules-demo'?'규칙 기반 데모 처리 중':provider()+'로 초안 작성 중');
  let success=false;
  try{
    const result=await(await api('/api/draft',{text,currentReport:report})).json();
    const merged=mergeDraft(report,metadata,manual,result.report,result.metadata);
    report=merged.report;metadata=merged.metadata;
    for(const item of merged.pending){pending=pending.filter(old=>old.key!==item.key);pending.push(item);}
    evidenceTokens.push(result.evidenceToken);evidenceTokens=evidenceTokens.slice(-100);
    addMessage('user',text);history.push(text);refresh();renderConflicts();$('#situation').value='';
    $('#report-status').textContent=`메모 ${history.length}건 반영 · 변경 후보 ${pending.length}건`;
    updateAIStatus(result.mode==='rules-demo'?'규칙 기반 데모 완료 · AI 미연결':provider()+' 초안 작성 완료');
    addMessage('system',`${merged.updated}개 항목을 정리했습니다.${pending.length?' 변경 후보를 확인해 주세요.':''}${result.mode==='rules-demo'?' 규칙 기반 데모이므로 문장과 항목을 직접 검토하세요.':' 입력 근거와 확인 상태를 검토해 주세요.'}${result.dateInterpretation?'\n날짜 해석: '+result.dateInterpretation:''}${result.conventionNotes?.length?'\n'+result.conventionNotes.join('\n'):''}`);
    success=true;
  }catch(error){
    requestFailed=true;
    updateAIStatus(error.code==='NOT_CONFIGURED'?provider()+' 연결 미설정':error.code==='INVALID_RESPONSE'?provider()+' 응답 형식 오류':error.code==='TIMEOUT'?provider()+' 응답 시간 초과':provider()+' 연결 실패');
    toast(error.message);$('#report-status').textContent='처리 실패 · 입력 메모와 기존 초안 유지 · 다시 반영을 눌러 재시도';
  }finally{
    busy=false;$('#generate').disabled=false;$('#download').disabled=false;$('#copy').disabled=false;$('#reset').disabled=false;$('#situation').disabled=false;$('.mode-note button').disabled=false;
    $('#report-form').inert=false;$('#conflicts').inert=false;
    if(success)enforceRequired();
  }
};
$('#reset').onclick=()=>{if(Object.values(report).some(Boolean)||history.length){if(!confirm('작성 중인 초안과 메모를 지우고 새 보고서를 시작할까요?'))return;}report=Object.fromEntries(schema.fields.map(([key])=>[key,'']));firePanel?.reset();manual.clear();confirmed.clear();metadata={};evidenceTokens=[];pending=[];history=[];requestFailed=false;updateAIStatus(schema.ai.label);$('#situation').value='';$('#messages').replaceChildren();$('#report-status').textContent='새 보고서를 시작합니다.';refresh();renderConflicts();toast('새 보고서를 시작했습니다.');};
$('#copy').onclick=async()=>{if(enforceRequired())return;const text=schema.sections.map(([title,items])=>`${title}\n${items.map(([key,label])=>`${label}: ${report[key]||'확인 중'}`).join('\n')}`).join('\n\n');try{await navigator.clipboard.writeText(text);toast('보고서 본문을 복사했습니다.');}catch{toast('브라우저에서 클립보드 권한을 허용해 주세요.');}};
$('#download').onclick=async()=>{if(busy)return;if(enforceRequired())return;if(pending.length){toast('변경 후보를 모두 확인한 뒤 다운로드해 주세요.');$('#conflicts').scrollIntoView({behavior:'smooth'});return;}busy=true;const button=$('#download');button.disabled=true;button.textContent='서식에 반영 중…';try{const response=await api('/api/export',{report,evidenceTokens,confirmedFields:[...confirmed].filter(key=>schema.requiredFields.includes(key))});const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`재난상황보고서_${(report.title||'초안').replace(/[\\/:*?"<>|]/g,'_').slice(0,40)}.hwpx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('HWPX 파일을 생성했습니다. 한글에서 최종 배치를 확인해 주세요.');}catch(error){toast(error.message);}finally{busy=false;button.disabled=false;button.textContent='HWPX 다운로드 ↓';}};
try{const response=await fetch('/api/schema');if(!response.ok)throw Error('초기화 실패');schema=await response.json();setupAIStatus();report=Object.fromEntries(schema.fields.map(([key])=>[key,'']));renderFields();setupRequiredDialog();if(schema.fireIncidentsEnabled||schema.localFireTrial){const {initFirePanel}=await import('./fire-panel.js');firePanel=initFirePanel({api,getReport:()=>report,getMemo:()=>$('#situation').value,apply:applyFireInformation,toast,getImports:()=>metadata.timeline?.fireImports||{},initialMode:schema.localFireTrial?'mock':'nfds',autoLoad:!schema.localFireTrial});}}catch{toast('서버 연결을 확인한 뒤 새로고침해 주세요.');}
