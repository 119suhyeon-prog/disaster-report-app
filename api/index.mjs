import {handler} from '../server.mjs';
export default function vercelHandler(req,res){
  const url=new URL(req.url,'http://localhost');
  const route=url.searchParams.get('__route');
  if(route)req.url=`/api/${encodeURIComponent(route)}`;
  // Vercel이 JSON body를 먼저 파싱한 경우 원래 서버의 body 검증과 동일하게 처리한다.
  return handler(req,res);
}
