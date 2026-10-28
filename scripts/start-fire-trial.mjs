import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// 비밀정보를 복사하지 않는 별도 시험 프로세스. .env 파일은 로드하지 않는다.
const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{PORT:'3214',HOST:'127.0.0.1',AI_PROVIDER:'rules-demo',LOCAL_FIRE_TRIAL:'1',KORDOC_OFFLINE:'1'});
console.log('화재현황 로컬 시험: http://127.0.0.1:3214 · .env 미사용 · AI 유료 호출 없음');
const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exitCode=code||0);process.on('SIGINT',()=>child.kill('SIGINT'));
