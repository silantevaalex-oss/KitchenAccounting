import { numberValue, totalRecordActual } from './core.js';
export function summarizeRecords(records){
 const byProduct=new Map();
 let actual=0,planned=0;
 for(const record of records){
  const recordActual=totalRecordActual(record);
  const recordPlanned=numberValue(record.plannedYield??record.layout1);
  actual+=recordActual;planned+=recordPlanned;
  const product=String(record.product||'');
  const item=byProduct.get(product)||{product,actual:0,planned:0,count:0};
  item.actual+=recordActual;item.planned+=recordPlanned;item.count++;
  byProduct.set(product,item);
 }
 return {actual,planned,difference:actual-planned,completionPercent:planned>0?actual/planned*100:null,count:records.length,byProduct:[...byProduct.values()].sort((a,b)=>a.product.localeCompare(b.product,'ru')).map(item=>({...item,difference:item.actual-item.planned}))};
}
