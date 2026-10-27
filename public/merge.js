export function mergeDraft(current,metadata,manual,incoming,incomingMeta){
  const report={...current},meta={...metadata},pending=[];let updated=0;
  for(const [key,value]of Object.entries(incoming)){
    if(!value)continue;
    if(manual.has(key)||report[key]&&report[key]!==value){if(report[key]!==value)pending.push({key,value,metadata:incomingMeta[key]});continue;}
    report[key]=value;meta[key]=incomingMeta[key];updated++;
  }
  return {report,metadata:meta,pending,updated};
}
