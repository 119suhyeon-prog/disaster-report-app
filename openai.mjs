export const OPENAI_ENDPOINT='https://api.openai.com/v1/responses';
export function strictReportSchema(schema){
  const copy=structuredClone(schema);
  copy.required=Object.keys(copy.properties);
  copy.properties.fields.required=Object.keys(copy.properties.fields.properties);
  return copy;
}
export async function requestOpenAI(context,env,fetcher=fetch){
  const timeout=Number(env.OPENAI_TIMEOUT_MS||45000);
  if(!Number.isInteger(timeout)||timeout<100||timeout>120000)throw Object.assign(Error('OpenAI 제한시간 설정을 확인해 주세요.'),{code:'NOT_CONFIGURED'});
  try{
    const response=await fetcher(OPENAI_ENDPOINT,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
      headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',store:false,
        instructions:context.instructions+' 모든 필드를 반환하되 미언급 항목은 value와 source를 빈 문자열로, status는 미확인, actionState는 해당 없음으로 반환한다. 미확인 핵심 정보는 확인 중으로 표시할 수 있다.',
        input:JSON.stringify(context.input),max_output_tokens:6000,
        text:{format:{type:'json_schema',name:'disaster_report',strict:true,schema:strictReportSchema(context.outputSchema)}}})
    });
    if(!response.ok){const code=response.status===401?'AUTH_FAILED':response.status===429?'RATE_LIMIT':'CONNECTION_FAILED';throw Object.assign(Error(response.status===401?'OpenAI API 키 설정을 확인해 주세요.':response.status===429?'OpenAI 사용 한도 또는 요청 제한을 확인해 주세요.':'OpenAI 요청에 실패했습니다. 모델·계정 설정을 확인해 주세요.'),{code});}
    let size=0,parts=[];for await(const part of response.body){size+=part.length;if(size>150000)throw Object.assign(Error('OpenAI 응답이 너무 큽니다.'),{code:'INVALID_RESPONSE'});parts.push(part);}
    const data=JSON.parse(Buffer.concat(parts).toString());
    if(data.status!=='completed'||!Array.isArray(data.output))throw Object.assign(Error('OpenAI 응답이 완료되지 않았습니다. 입력을 줄여 재시도해 주세요.'),{code:'INVALID_RESPONSE'});
    const content=data.output.filter(x=>x.type==='message').flatMap(x=>x.content||[]);
    if(content.some(x=>x.type==='refusal'))throw Object.assign(Error('AI가 요청을 처리하지 못했습니다. 가상 상황 내용을 확인해 주세요.'),{code:'INVALID_RESPONSE'});
    const text=content.filter(x=>x.type==='output_text').map(x=>x.text).join('');
    if(!text)throw Object.assign(Error('OpenAI 응답에 보고서 내용이 없습니다.'),{code:'INVALID_RESPONSE'});
    return JSON.parse(text);
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')throw Object.assign(Error('OpenAI 응답 시간이 초과됐습니다. 메모는 유지됩니다.'),{code:'TIMEOUT'});
    if(['NOT_CONFIGURED','AUTH_FAILED','RATE_LIMIT','CONNECTION_FAILED','INVALID_RESPONSE'].includes(error.code))throw error;
    throw Object.assign(Error('OpenAI 연결 또는 응답 처리에 실패했습니다. 기존 초안을 유지합니다.'),{code:'CONNECTION_FAILED'});
  }
}
