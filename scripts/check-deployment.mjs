import {exportReport} from '../export.mjs';
import {emptyReport,requiredFields} from '../report.mjs';
process.env.KORDOC_OFFLINE='1';
const r=emptyReport();for(const field of requiredFields)r[field]='확인 중';r.overview='가상 배포 검증';Object.assign(r,{receivedAt:'2026. 10. 28. 11:30',author:'가상 담당자',contact:'010-0000-0000'});
const bytes=await exportReport(r);
if(bytes.length<1000)throw Error('배포 검증용 HWPX 생성 실패');
console.log(`배포 준비 검사 통과: HWPX ${bytes.length} bytes. 실제 AI 호출은 수행하지 않았습니다.`);
