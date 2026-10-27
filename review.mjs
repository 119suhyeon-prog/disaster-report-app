import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {requiredFields,fields} from './report.mjs';
const key=randomBytes(32);
const signature=value=>createHmac('sha256',key).update(value).digest('base64url');
export function issueEvidence(result){
  const values=Object.fromEntries(requiredFields.filter(k=>result.metadata[k]?.grounded&&!result.metadata[k]?.needsConfirmation).map(k=>[k,result.report[k]]));
  const payload=Buffer.from(JSON.stringify(values)).toString('base64url');return `${payload}.${signature(payload)}`;
}
export function requireReviewed(report,tokens=[],confirmed=[]){
  if(!Array.isArray(tokens)||tokens.length>100||!Array.isArray(confirmed)||confirmed.some(k=>!requiredFields.includes(k)))throw Error('필수 정보 확인 상태가 올바르지 않습니다.');
  const supported=new Set(confirmed);
  for(const token of tokens){
    if(typeof token!=='string'||token.length>20000)throw Error('입력 근거 확인 정보가 올바르지 않습니다.');
    const [payload,sig]=token.split('.');const expected=Buffer.from(signature(payload||'')),actual=Buffer.from(sig||'');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))continue;
    try{for(const [field,value]of Object.entries(JSON.parse(Buffer.from(payload,'base64url').toString()))){if(value===report[field])supported.add(field);}}catch{}
  }
  const missing=fields.filter(([field])=>requiredFields.includes(field)&&(!report[field]?.trim()||!supported.has(field)));
  if(missing.length)throw Error(`입력 근거 또는 사용자 확인이 필요한 필수 정보: ${missing.map(([,label])=>label).join(', ')}`);
}
