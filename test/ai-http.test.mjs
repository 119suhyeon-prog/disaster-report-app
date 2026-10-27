import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDraft} from '../ai.mjs';

test('로컬 모의 HTTP 서버로 실제 fetch 요청·응답을 검증한다',async()=>{
  let received;
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received={headers:req.headers,input:JSON.parse(Buffer.concat(chunks).toString())};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fields:{overview:{value:'천장 낙하 사고 발생.',source:'천장이 떨어졌어',status:'확인',actionState:'해당 없음'}}}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const env={AI_PROVIDER:'onai',ONAI_BASE_URL:`http://127.0.0.1:${server.address().port}/draft`,ONAI_MODEL:'mock-http',ONAI_PROTOCOL:'json-contract-v1',ONAI_API_KEY:'mock-http-key'};
    const result=await createDraft('천장이 떨어졌어',{}, {env});
    assert.equal(result.report.overview,'천장 낙하 사고 발생.');assert.equal(received.input.input.text,'천장이 떨어졌어');
    assert.equal(received.headers.authorization,'Bearer mock-http-key');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('로컬 모의 서버의 느린 응답에 실제 타임아웃을 적용한다',async()=>{
  const server=http.createServer(()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    await assert.rejects(createDraft('천장 낙하',{}, {env:{AI_PROVIDER:'onai',ONAI_BASE_URL:`http://127.0.0.1:${server.address().port}/draft`,ONAI_MODEL:'mock-http',ONAI_PROTOCOL:'json-contract-v1',ONAI_TIMEOUT_MS:'100'}}),{code:'TIMEOUT'});
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
