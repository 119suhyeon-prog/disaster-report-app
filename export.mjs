import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse, patchHwpx } from 'kordoc';
import JSZip from 'jszip';
import { buildMarkdown, validateReport } from './report.mjs';
const templatePath=fileURLToPath(new URL('./templates/report.hwpx',import.meta.url));
export async function exportReport(input) {
  const report=validateReport(input);
  const original=await readFile(templatePath);
  const patched=await patchHwpx(original,buildMarkdown(report),{verify:true,structure:true});
  if(!patched.success||!patched.data||patched.skipped.length) throw Error('원본 서식에 일부 항목을 반영하지 못했습니다. 입력 길이와 서식을 확인해 주세요.');
  // 편집된 문단과 원본 문단의 줄 위치 캐시가 섞이면 긴 문장이 다음 항목과 겹친다.
  // 글꼴·표·여백은 두고 모든 줄 위치 캐시를 제거해 문서 전체를 다시 조판한다.
  const zip=await JSZip.loadAsync(patched.data);
  for(const name of Object.keys(zip.files).filter(name=>/^Contents\/section\d+\.xml$/.test(name))) {
    const xml=await zip.file(name).async('string');
    zip.file(name,xml.replace(/<hp:linesegarray\b[^>]*>[\s\S]*?<\/hp:linesegarray>/g,''));
  }
  const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const result=await parse(output,{keepLayoutTables:true});
  if(!result.success) throw Error('생성한 문서를 다시 읽을 수 없습니다.');
  const collect=object=>typeof object==='string'?object:Array.isArray(object)?object.map(collect).join(' '):object&&typeof object==='object'?Object.values(object).map(collect).join(' '):'';
  const parsedText=collect(result.blocks).normalize('NFC').replace(/\s/g,'');
  for(const value of Object.values(report).filter(Boolean)) {
    for(const line of value.split('\n').filter(Boolean)) {
      // JSON 직렬화 이스케이프 때문에 텍스트를 직접 모아 검증한다.
      if(!parsedText.includes(line.normalize('NFC').replace(/\s/g,''))) throw Error('입력 내용이 출력 문서에 모두 반영되지 않았습니다. 내용을 확인해 주세요.');
    }
  }
  return output;
}
