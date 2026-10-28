export const explicitRequiredFields=['receivedAt','author','contact'];
export function requiredValueValid(key,value){return typeof value==='string'&&!!value.trim()&&(!explicitRequiredFields.includes(key)||! /^(확인\s*중|미확인|미입력|모름|추후|없음|[-—]|n\/?a)$/i.test(value.trim()));}
