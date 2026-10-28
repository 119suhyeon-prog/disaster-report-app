export function deploymentConfig(env=process.env){
  const remote=env.VERCEL==='1'||env.NODE_ENV==='production';
  if(remote&&(!env.REVIEW_SIGNING_KEY||env.REVIEW_SIGNING_KEY.length<32))throw Error('배포 환경에는 32자 이상의 REVIEW_SIGNING_KEY 설정이 필요합니다.');
  const origins=new Set();
  for(const value of [env.PUBLIC_APP_URL,...[env.VERCEL_URL,env.VERCEL_PROJECT_PRODUCTION_URL,env.VERCEL_BRANCH_URL].filter(Boolean).map(x=>`https://${x}`)].filter(Boolean)){
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('배포 주소는 경로 없는 HTTPS 주소로 설정해 주세요.');origins.add(url.origin);
  }
  return {remote,origins};
}
