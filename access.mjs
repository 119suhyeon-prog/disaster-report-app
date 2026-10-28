import {timingSafeEqual,createHash} from 'node:crypto';
export function deploymentConfig(env=process.env){
  const remote=env.VERCEL==='1'||env.NODE_ENV==='production';
  if(remote&&(!env.TEST_ACCESS_TOKEN||env.TEST_ACCESS_TOKEN.length<24))throw Error('배포 환경에는 24자 이상의 TEST_ACCESS_TOKEN 설정이 필요합니다.');
  if(remote&&(!env.REVIEW_SIGNING_KEY||env.REVIEW_SIGNING_KEY.length<32))throw Error('배포 환경에는 32자 이상의 REVIEW_SIGNING_KEY 설정이 필요합니다.');
  const origins=new Set();
  for(const value of [env.PUBLIC_APP_URL,...[env.VERCEL_URL,env.VERCEL_PROJECT_PRODUCTION_URL,env.VERCEL_BRANCH_URL].filter(Boolean).map(x=>`https://${x}`)].filter(Boolean)){
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('배포 주소는 경로 없는 HTTPS 주소로 설정해 주세요.');origins.add(url.origin);
  }
  return {remote,origins};
}
export function validAccess(header,env=process.env){
  if(!env.TEST_ACCESS_TOKEN)return true;
  const provided=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';
  const hash=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(provided),hash(env.TEST_ACCESS_TOKEN));
}
