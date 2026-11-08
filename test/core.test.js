import test from 'node:test';
import assert from 'node:assert/strict';
import { numberValue, totalRecordActual, dayOf, normalizeTechProductName, techCardPlanInKg, esc } from '../js/core.js';
import { summarizeRecords } from '../js/reports.js';
import { readStore } from '../js/storage.js';
import { mergeVersioned } from '../js/sync-merge.js';
import { buildJournalHtml } from '../js/journal.js';
import { normalizeRecord, parseSheetRecord, recordContent } from '../js/google-sheets.js';
import { ingredientContent, cardContent, activeTechCards } from '../js/tech-cards.js';

test('numberValue accepts decimal commas and grouped spaces',()=>{
 assert.equal(numberValue('1 234,5'),1234.5);
 assert.equal(numberValue('1\u00a0234,5'),1234.5);
 assert.equal(numberValue('не число'),0);
 assert.equal(numberValue(''),0);
});
test('actual yield includes recorded yield plus pieces exactly once',()=>{
 assert.equal(totalRecordActual({actualYield:10,steaks:4,unitWeight:0.25}),11);
 assert.equal(totalRecordActual({yield:8,steaks:2,unitWeight:0.5}),9);
});
test('day and product normalization are stable',()=>{
 assert.equal(dayOf('2026-11-09T12:30'),'2026-11-09');
 assert.equal(normalizeTechProductName('  Котлеты   домашние '),'котлеты домашние');
});
test('tech card output units convert to kilograms',()=>{
 assert.equal(techCardPlanInKg({outputQty:'1250',outputUnit:'г'}),1.25);
 assert.equal(techCardPlanInKg({outputQty:'2,5',outputUnit:'кг'}),2.5);
 assert.equal(techCardPlanInKg({outputQty:'250',outputUnit:'мл'}),0.25);
 assert.equal(techCardPlanInKg({outputQty:'2',outputUnit:'шт'}),null);
});
test('HTML escaping protects report output',()=>{
 assert.equal(esc('<b>Котлеты & "мясо"</b>'),'&lt;b&gt;Котлеты &amp; &quot;мясо&quot;&lt;/b&gt;');
});
test('report summary totals, product breakdown and completion percent',()=>{
 const result=summarizeRecords([
  {product:'Свинина',actualYield:10,steaks:4,unitWeight:0.25,plannedYield:12},
  {product:'Курица',actualYield:5,steaks:0,unitWeight:0,plannedYield:4},
  {product:'Свинина',actualYield:2,steaks:0,unitWeight:0,plannedYield:3}
 ]);
 assert.equal(result.actual,18);
 assert.equal(result.planned,19);
 assert.equal(result.difference,-1);
 assert.equal(result.completionPercent,18/19*100);
 assert.equal(result.count,3);
 assert.deepEqual(result.byProduct.map(x=>[x.product,x.count,x.actual,x.planned,x.difference]),[
  ['Курица',1,5,4,1],['Свинина',2,13,15,-2]
 ]);
});
test('empty report has no completion percentage',()=>{
 const result=summarizeRecords([]);
 assert.equal(result.actual,0);assert.equal(result.planned,0);assert.equal(result.completionPercent,null);assert.deepEqual(result.byProduct,[]);
});

test('storage reads valid JSON and safely falls back on invalid JSON',()=>{
 const storage={getItem:key=>key==='good'?'[1,2]':key==='broken'?'not-json':null};
 assert.deepEqual(readStore('good',[],storage),[1,2]);
 assert.deepEqual(readStore('broken',[],storage),[]);
 assert.deepEqual(readStore('missing',{safe:true},storage),{safe:true});
});
test('versioned merge selects the newer cloud or local revision',()=>{
 const content=x=>JSON.stringify({value:x.value});
 const cloudWins=mergeVersioned({value:2,updatedAt:'2026-11-09T12:00:00Z'},{value:1,updatedAt:'2026-11-09T11:00:00Z'},'test',content);
 const localWins=mergeVersioned({value:1,updatedAt:'2026-11-09T11:00:00Z'},{value:2,updatedAt:'2026-11-09T12:00:00Z'},'test',content);
 assert.equal(cloudWins.value,2);assert.equal(localWins.value,2);
});
test('versioned merge stops on conflicting equal or missing versions',()=>{
 const content=x=>JSON.stringify({value:x.value});
 assert.throws(()=>mergeVersioned({value:1,updatedAt:'same'},{value:2,updatedAt:'same'},'тест',content),/одинаковое время изменения/);
 assert.throws(()=>mergeVersioned({value:1},{value:2},'тест',content),/без версии/);
 assert.throws(()=>mergeVersioned({value:1,_versionInvalid:true},{value:2},'тест',content),/без подтверждённой версии/);
});

test('journal groups records by day and calculates day totals',()=>{
 const html=buildJournalHtml([
  {id:'a',stamp:'2026-11-08T10:00',product:'Свинина',actualYield:10,steaks:4,unitWeight:.25,plannedYield:12},
  {id:'b',stamp:'2026-11-08T11:00',product:'Курица',actualYield:5,plannedYield:4},
  {id:'c',stamp:'2026-11-09T09:00',product:'Говядина',actualYield:3,plannedYield:3}
 ]);
 assert.equal((html.match(/class="journal-day"/g)||[]).length,2);
 assert.match(html,/2026-11-09/);
 assert.match(html,/2026-11-08/);
 assert.match(html,/Факт за день/);
 assert.match(html,/Свинина/);
 assert.match(html,/Изменить/);
});
test('journal filter, order and empty state are deterministic',()=>{
 const records=[{id:'1',stamp:'2026-11-08T10:00',product:'Первый',actualYield:1},{id:'2',stamp:'2026-11-09T10:00',product:'Второй',actualYield:2}];
 const html=buildJournalHtml(records,'2026-11-09','asc');
 assert.match(html,/Второй/);assert.doesNotMatch(html,/Первый/);
 assert.equal(buildJournalHtml([],'' ,'desc'),'<div class="empty">Записей пока нет</div>');
 assert.equal(buildJournalHtml([],'2026-11-09','desc'),'<div class="empty">За выбранную дату записей нет</div>');
});
test('journal escapes user supplied text',()=>{
 const html=buildJournalHtml([{id:'x<1',stamp:'2026-11-09T10:00',product:'<script>alert(1)</script>',actualYield:1,comment:'<img src=x>'}]);
 assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;script&gt;/);
});
test('Google Sheets record parser reads current schema and tombstones',()=>{
 const header=['ID','Дата и время','Продукт','Фактический выход','Плановый выход','Кол-во (шт)','Вес 1 шт (кг)','Комментарий','Статус','Пересчёт по техкарте','Версионный ID','Снимок данных','Время изменения','Время удаления'];
 const parsed=parseSheetRecord(['r1','2026-11-09T10:00','Свинина','10','12','4','0.25','тест','','','r1','','2026-11-09T11:00',''],header);
 assert.equal(parsed.id,'r1');assert.equal(parsed.actualYield,10);assert.equal(parsed.plannedYield,12);assert.equal(parsed.steaks,4);assert.equal(parsed.unitWeight,.25);
 const deleted=parseSheetRecord(['r1','','','','','','','','DELETE','','r1','DELETE','','2026-11-09T12:00'],header);
 assert.equal(deleted.status,'DELETE');assert.equal(deleted.deletedAt,'2026-11-09T12:00');
});
test('Google Sheets parser remains compatible with legacy headers',()=>{
 const header=['ID','Дата и время','Продукт','Фактический выход','Раскладка 1','Количество','Вес 1 шт (кг)','Приход','Плановый выход','Комментарий'];
 const parsed=parseSheetRecord(['old','2026-11-08T08:00','Курица','8','','2','0.5','','9','старый формат'],header);
 assert.equal(parsed.actualYield,8);assert.equal(parsed.plannedYield,9);assert.equal(parsed.steaks,2);assert.equal(parsed.comment,'старый формат');
});
test('Google record content excludes updatedAt but retains business data',()=>{
 const a={id:'r',product:'Свинина',actualYield:10,plannedYield:12,updatedAt:'one'};
 const b={...a,updatedAt:'two'};
 assert.equal(recordContent(a),recordContent(b));
 assert.notEqual(recordContent(a),recordContent({...a,actualYield:11}));
});
test('tech card fingerprints normalize fields and latest active version is selected',()=>{
 const card={cardId:'c1',version:1,product:'Котлеты',outputQty:'2,5',outputUnit:'кг',ingredients:[{ingredientId:'i',name:'Мясо',quantity:'1,25',unit:'кг'}]};
 assert.equal(cardContent(card),cardContent({...card,outputQty:2.5,ingredients:[{...card.ingredients[0],quantity:1.25}]}));
 assert.equal(ingredientContent({id:'i',name:'Мясо'}),ingredientContent({id:'i',name:'Мясо',unit:'кг',active:true,category:''}));
 const latest=activeTechCards([{...card,version:1},{...card,version:2},{...card,cardId:'c2',product:'Бульон',version:1},{...card,cardId:'c3',product:'Суп',version:1,active:false}]);
 assert.deepEqual(latest.map(x=>[x.cardId,x.version]),[['c2',1],['c1',2]]);
 assert.equal(latest.some(x=>x.cardId==='c3'),false);
});
