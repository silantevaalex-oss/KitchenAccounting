import { numberValue } from './core.js';
import { mergeVersioned } from './sync-merge.js';

function fieldValue(record,keys){for(const key of keys){if(record&&record[key]!==undefined&&record[key]!==null&&String(record[key]).trim()!=='')return record[key]}return ''}

export function normalizeRecord(record){
 const actual=numberValue(fieldValue(record,['actualYield','Фактический выход','yield','Выход','выход']));
 const planned=numberValue(fieldValue(record,['plannedYield','Плановый выход','layout1','Раскладка 1']));
 return {
  id:String(fieldValue(record,['id','ID','Идентификатор'])),product:String(fieldValue(record,['product','Продукт','Название продукта'])),
  yield:actual,actualYield:actual,plannedYield:planned,layout1:planned,
  layout2:numberValue(fieldValue(record,['layout2','Раскладка 2'])),layout3:numberValue(fieldValue(record,['layout3','Раскладка 3'])),layout4:numberValue(fieldValue(record,['layout4','Раскладка 4'])),
  stamp:String(fieldValue(record,['stamp','Дата и время','Дата','date'])),comment:String(fieldValue(record,['comment','Комментарий','комментарий'])),
  steaks:numberValue(fieldValue(record,['steaks','Кол-во (шт)','Шт','Стейки, шт','Стейки'])),
  unitWeight:numberValue(fieldValue(record,['unitWeight','Вес 1 шт (кг)','Вес одной штуки (кг)'])),
  techCardScale:(()=>{const value=fieldValue(record,['techCardScale','Пересчёт по техкарте']);if(value&&typeof value==='object')return value;if(typeof value==='string'&&value.trim()){try{return JSON.parse(value)}catch(_){return null}}return null})(),
  updatedAt:String(fieldValue(record,['updatedAt','Время изменения']))
 };
}
export function parseSheetRecord(row,header=[]){
 const indexes=Object.fromEntries(header.map((name,index)=>[String(name).trim(),index]));
 const at=(name,fallback)=>row[indexes[name]!==undefined?indexes[name]:fallback];
 const id=at('ID',0),status=String(at('Статус',header.includes('Фактический выход')?(header.includes('Вес 1 шт (кг)')?8:7):9)||'');
 if(id&&status.toUpperCase()==='DELETE')return{id:String(id),status:'DELETE',deletedAt:String(row[indexes['Время удаления']!==undefined?indexes['Время удаления']:13]||'')};
 const actualIndex=indexes['Фактический выход']!==undefined?indexes['Фактический выход']:3;
 const actual=numberValue(row[actualIndex]),legacy=indexes['Приход']!==undefined;
 return normalizeRecord({id,stamp:at('Дата и время',1),product:at('Продукт',2),yield:actual,actualYield:actual,plannedYield:at('Плановый выход',legacy?7:4),steaks:at('Кол-во (шт)',indexes['Количество']!==undefined?indexes['Количество']:5),unitWeight:at('Вес 1 шт (кг)',-1),comment:at('Комментарий',legacy?9:6),techCardScale:at('Пересчёт по техкарте',-1),updatedAt:at('Время изменения',12)});
}
export function recordContent(record){const normalized=normalizeRecord(record);delete normalized.updatedAt;return JSON.stringify(normalized)}
export function mergeRecordLocalWins(cloud,local){return mergeVersioned(cloud,local,'обработки',recordContent)}
