const $=selector=>document.querySelector(selector);
let requiredDialog;
function setupRequiredDialog(){
  requiredDialog=document.createElement('dialog');requiredDialog.className='required-dialog';
  requiredDialog.setAttribute('aria-labelledby','required-title');requiredDialog.setAttribute('aria-describedby','required-help');
  const form=document.createElement('form');form.id='required-form';
  const heading=document.createElement('h2');heading.id='required-title';heading.textContent='필수 정보를 입력해 주세요';
  const help=document.createElement('p');help.id='required-help';help.textContent='보고서 작성에 필요한 정보가 빠졌습니다. 모든 항목을 입력해야 계속할 수 있습니다. 아직 파악되지 않은 정보는 추정하지 말고 “확인 중”이라고 입력하세요.';
  const inputs=document.createElement('div');inputs.id='required-inputs';
  const error=document.createElement('p');error.id='required-error';error.setAttribute('role','alert');
  const button=document.createElement('button');button.type='submit';button.className='primary';button.textContent='입력 완료 · 보고서에 반영';
  form.append(heading,help,inputs,error,button);requiredDialog.append(form);document.body.append(requiredDialog);
  requiredDialog.addEventListener('cancel',event=>{event.preventDefault();$('#required-error').textContent='필수 항목을 모두 입력한 뒤 계속할 수 있습니다.';});
  form.onsubmit=event=>{
    event.preventDefault();let invalid;
    for(const input of inputs.querySelectorAll('textarea')){input.setCustomValidity(input.value.trim()?'':'공백 대신 확인된 내용 또는 확인 중을 입력해 주세요.');if(!input.checkValidity()){invalid??=input;}}
    if(invalid){invalid.reportValidity();return;}
    for(const input of inputs.querySelectorAll('textarea')){report[input.name]=input.value.trim();manual.add(input.name);}
    if(missingRequiredFields().length){$('#required-error').textContent='누락된 필수 항목을 모두 입력해 주세요.';return;}
    requiredDialog.close();refresh();toast('필수 정보를 보고서에 반영했습니다.');
  };
  for(const [key,label] of schema.fields.filter(([key])=>schema.requiredFields.includes(key))){
    const input=$(`#field-${key}`);input.setAttribute('aria-required','true');
    const badge=document.createElement('span');badge.className='required-badge';badge.textContent='필수';input.previousElementSibling.prepend(badge);
    input.addEventListener('blur',()=>{if(history.length)enforceRequired();});
  }
}
function missingRequiredFields(){return schema.fields.filter(([key])=>schema.requiredFields.includes(key)&&!report[key]?.trim());}
function enforceRequired(){
  if(!requiredDialog)return false;
  const missing=missingRequiredFields();if(!missing.length)return false;
  if(requiredDialog.open)return true;
  const root=$('#required-inputs');root.replaceChildren();$('#required-error').textContent='';
  for(const [key,label]of missing){
    const wrap=document.createElement('div');const caption=document.createElement('label');caption.htmlFor=`required-${key}`;caption.textContent=`${label} *`;
    const input=document.createElement('textarea');input.id=`required-${key}`;input.name=key;input.required=true;input.maxLength=1500;input.rows=key==='overview'?3:2;input.placeholder='확인된 내용 또는 확인 중';
    input.addEventListener('input',()=>input.setCustomValidity(''));
    const unknown=document.createElement('button');unknown.type='button';unknown.className='unknown-button';unknown.textContent='확인 중으로 입력';unknown.onclick=()=>{input.value='확인 중';input.setCustomValidity('');input.focus();};
    wrap.append(caption,input,unknown);root.append(wrap);
  }
  requiredDialog.showModal();return true;
}
let schema,report={},manual=new Set(),history=[],pending=[],busy=false;
const toast=message=>{const t=$('#toast');t.textContent=message;t.classList.add('toast-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('toast-visible'),4500);};
function addMessage(role,text){const area=$('#messages');area.querySelector('.welcome')?.remove();const box=document.createElement('div');box.className=`message ${role}`;const label=document.createElement('small');label.textContent=role==='user'?'상황 메모':'작성 도우미 · 규칙 기반';box.append(label,document.createTextNode(text));area.append(box);area.scrollTop=area.scrollHeight;}
function renderFields(){const form=$('#report-form');form.replaceChildren();for(const [title,items] of schema.sections){const group=document.createElement('fieldset');group.className='form-section';const legend=document.createElement('legend');legend.textContent=title;group.append(legend);const grid=document.createElement('div');grid.className='field-grid';for(const [key,label]of items){const field=document.createElement('div');field.className='field'+(['overview','timeline','support','plan','casualties','personnel','equipment','notification','dispatch','alert','evacuation'].includes(key)?' wide':'');const caption=document.createElement('label');caption.htmlFor=`field-${key}`;caption.append(document.createTextNode(label));const state=document.createElement('span');state.className='edited';state.id=`state-${key}`;caption.append(state);const input=document.createElement('textarea');input.id=`field-${key}`;input.name=key;input.rows=['overview','timeline','plan'].includes(key)?3:1;input.maxLength=1500;input.placeholder=['title','number','recipient','issuedAt','receivedAt','department','author','contact','timeline','support','plan'].includes(key)?'미입력':'확인 중';input.addEventListener('input',()=>{report[key]=input.value;manual.add(key);refresh();});field.append(caption,input);grid.append(field);}group.append(grid);form.append(group);}refresh();}
function refresh(){let count=0;for(const [key]of schema.fields){const input=$(`#field-${key}`);if(input.value!==report[key])input.value=report[key]||'';input.classList.toggle('has-value',!!report[key]);input.classList.toggle('manual',manual.has(key));$(`#state-${key}`).textContent=manual.has(key)?'직접 편집':'';if(report[key])count++;}$('#filled-count').textContent=`${count} / ${schema.fields.length} 항목 작성`;const missing=missingRequiredFields().map(([,label])=>label);$('#notice').textContent=missing.length?`우선 확인: ${missing.join(' · ')}. 미확인 정보는 추정하지 않고 그대로 보고합니다.`:'주요 항목이 입력됐습니다. 인명피해의 확인 수준과 완료·진행·예정 상태를 확인해 주세요.';}
function renderConflicts(){const root=$('#conflicts');root.replaceChildren();for(const item of pending){const card=document.createElement('div');card.className='conflict-card';const strong=document.createElement('strong');strong.textContent=`${schema.fields.find(([key])=>key===item.key)[1]} · ${manual.has(item.key)?'직접 편집한 항목':'변경 후보'}`;const p=document.createElement('p');p.textContent=`현재: ${report[item.key]}\n새 메모: ${item.value}`;card.append(strong,p);for(const [label,action]of [['새 내용으로 바꾸기','replace'],['현재 내용 유지','keep']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(action==='replace'){report[item.key]=item.value;manual.add(item.key);}pending=pending.filter(x=>x!==item);refresh();renderConflicts();};card.append(b);}root.append(card);}}
async function api(path,data){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok){const problem=await response.json().catch(()=>({error:'서버 응답을 확인할 수 없습니다.'}));throw Error(problem.error);}return response;}
$('#sample').onclick=()=>{$('#situation').value=schema.sample;$('#situation').focus();};
$('#chat-form').onsubmit=async event=>{event.preventDefault();if(busy)return;const text=$('#situation').value.trim();if(!text){toast('상황 메모를 입력해 주세요.');return;}busy=true;$('#generate').disabled=true;try{const {report:incoming}=await(await api('/api/draft',{text})).json();addMessage('user',text);let updated=0;for(const [key,value]of Object.entries(incoming)){if(!value||value===report[key])continue;if(report[key]||manual.has(key)){pending=pending.filter(x=>x.key!==key);pending.push({key,value});}else{report[key]=value;updated++;}}history.push(text);refresh();renderConflicts();$('#situation').value='';$('#report-status').textContent=`메모 ${history.length}건 반영 · 변경 후보 ${pending.length}건`;addMessage('system',`${updated}개 항목에 내용을 배치했습니다.${pending.length?' 기존 값과 다른 내용은 보고서 위의 변경 후보에서 확인하세요.':''}\n문장을 그대로 분류하는 데모이므로 표현과 항목을 검토해 주세요.`);}catch(error){toast(error.message);}finally{busy=false;$('#generate').disabled=false;enforceRequired();}};
$('#reset').onclick=()=>{if(Object.values(report).some(Boolean)||history.length){if(!confirm('작성 중인 초안과 메모를 지우고 새 보고서를 시작할까요?'))return;}report=Object.fromEntries(schema.fields.map(([key])=>[key,'']));manual.clear();pending=[];history=[];$('#situation').value='';$('#messages').replaceChildren();$('#report-status').textContent='새 보고서를 시작합니다.';refresh();renderConflicts();toast('새 보고서를 시작했습니다.');};
$('#copy').onclick=async()=>{if(enforceRequired())return;const text=schema.sections.map(([title,items])=>`${title}\n${items.map(([key,label])=>`${label}: ${report[key]||'확인 중'}`).join('\n')}`).join('\n\n');try{await navigator.clipboard.writeText(text);toast('보고서 본문을 복사했습니다.');}catch{toast('브라우저에서 클립보드 권한을 허용해 주세요.');}};
$('#download').onclick=async()=>{if(busy)return;if(enforceRequired())return;if(pending.length){toast('변경 후보를 모두 확인한 뒤 다운로드해 주세요.');$('#conflicts').scrollIntoView({behavior:'smooth'});return;}busy=true;const button=$('#download');button.disabled=true;button.textContent='서식에 반영 중…';try{const response=await api('/api/export',{report});const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`재난상황보고서_${(report.title||'초안').replace(/[\\/:*?"<>|]/g,'_').slice(0,40)}.hwpx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('HWPX 파일을 생성했습니다. 한글에서 최종 배치를 확인해 주세요.');}catch(error){toast(error.message);}finally{busy=false;button.disabled=false;button.textContent='HWPX 다운로드 ↓';}};
try{const response=await fetch('/api/schema');if(!response.ok)throw Error('초기화 실패');schema=await response.json();report=Object.fromEntries(schema.fields.map(([key])=>[key,'']));renderFields();setupRequiredDialog();}catch{toast('서버 연결을 확인한 뒤 새로고침해 주세요.');}
