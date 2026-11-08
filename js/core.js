// Pure domain helpers shared by the browser app and automated tests.
export function versionNow(){return new Date().toISOString()}
export function nowLocal(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
export function dayOf(value){return(value||'').slice(0,10)}
export function kg(value){return(Number(value)||0).toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:3})}
export function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
export function totalRecordActual(record){return numberValue(record.actualYield??record.yield??record.incoming)+numberValue(record.steaks)*numberValue(record.unitWeight)}
export function dateStr(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
export function pct(numerator,denominator){return denominator>0?numerator/denominator*100:0}
export function numberValue(value){if(typeof value==='string')value=value.replace(/[\s\u00A0\u202F]/g,'').trim().replace(',','.');const n=Number(value);return Number.isFinite(n)?n:0}
export function normalizeTechProductName(value){return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')}
export function techCardPlanInKg(card){const qty=Number(String(card.outputQty??'').replace(',','.'));if(!Number.isFinite(qty)||qty<0)return null;const unit=String(card.outputUnit||'').trim().toLocaleLowerCase('ru-RU');if(unit==='кг'||unit==='л')return qty;if(unit==='г'||unit==='мл')return qty/1000;return null}
