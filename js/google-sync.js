// Google Sheets synchronization and version-aware data merge orchestration.
export function createGoogleSync({api,storage,keys,getState,setState,helpers,ui}){
 const {normalizeRecord,parseSheetRecord,recordContent,mergeRecordLocalWins,versionNow,numberValue,mergeVersioned,ingredientContent,cardContent}=helpers;
 const {$,renderAll,googleStatus}=ui;
 let syncInProgress=false,syncRequestedAgain=false;
 async function removeNormsSheet(){
  if(storage.getItem('normsRemoved')==='1')return false;
  const meta=await api.request('?fields=sheets.properties(sheetId,title)');
  const sheet=(meta.sheets||[]).find(x=>x.properties?.title==='Norms');
  if(!sheet){storage.setItem('normsRemoved','1');return false}
  await api.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{deleteSheet:{sheetId:sheet.properties.sheetId}}]})});
  storage.setItem('normsRemoved','1');return true;
 }
 async function syncStage1Sheets(){
  let {ingredients,techCards}=getState();
  const names=['Ingredients','TechCards','TechCardIngredients'];
  const meta=await api.request('?fields=sheets.properties(sheetId,title)');
  const existing=new Set((meta.sheets||[]).map(x=>x.properties?.title));
  const missing=names.filter(n=>!existing.has(n));
  if(missing.length)await api.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:missing.map(title=>({addSheet:{properties:{title}}}))})});
  const [ir,cr,lr]=await Promise.all([api.read('Ingredients!A2:H'),api.read('TechCards!A2:J'),api.read('TechCardIngredients!A2:G')]);
  const im=new Map();
  ir.forEach(r=>{if(!r[0])return;const x={id:String(r[0]),name:String(r[1]||''),unit:String(r[2]||'кг'),category:String(r[3]||''),active:String(r[4]??'TRUE')!=='FALSE',updatedAt:''};if(String(r[5]||'')===x.id&&String(r[6]||'')===ingredientContent(x))x.updatedAt=String(r[7]||'');else x._versionInvalid=true;im.set(x.id,x)});
  ingredients.forEach(x=>{const id=String(x.id),cloud=im.get(id);im.set(id,cloud?mergeVersioned(cloud,x,'ингредиента '+(x.name||id),ingredientContent):{...x,updatedAt:x.updatedAt||versionNow()})});
  const cm=new Map();
  cr.forEach(r=>{if(!r[0])return;cm.set(String(r[0])+'|'+String(r[1]),{cardId:String(r[0]),version:Number(r[1])||1,product:String(r[2]||''),outputQty:numberValue(r[3]),outputUnit:String(r[4]||'кг'),createdAt:String(r[5]||''),comment:String(r[6]||''),updatedAt:'',ingredients:[],active:true,_versionKey:String(r[7]||''),_fingerprint:String(r[8]||''),_versionTime:String(r[9]||'')})});
  lr.forEach(r=>{const c=cm.get(String(r[1])+'|'+String(r[2]));if(c)c.ingredients.push({ingredientId:String(r[3]||''),name:String(r[4]||''),quantity:numberValue(r[5]),unit:String(r[6]||'кг')})});
  cm.forEach(c=>{if(c._versionKey===String(c.cardId)+'|'+String(c.version)&&c._fingerprint===cardContent(c))c.updatedAt=c._versionTime;else c._versionInvalid=true;delete c._versionKey;delete c._fingerprint;delete c._versionTime});
  const mergedCards=new Map(cm);
  techCards.forEach(c=>{const key=String(c.cardId)+'|'+String(c.version),cloud=mergedCards.get(key);mergedCards.set(key,cloud?mergeVersioned(cloud,c,'техкарты '+c.product+' / v'+c.version,cardContent):{...c,updatedAt:c.updatedAt||versionNow()})});
  const nextIngredients=[...im.values()],nextCards=[...mergedCards.values()].sort((x,y)=>x.product.localeCompare(y.product,'ru')||x.version-y.version);
  nextIngredients.forEach(x=>{if(!x.updatedAt)x.updatedAt=versionNow()});nextCards.forEach(c=>{if(!c.updatedAt)c.updatedAt=versionNow()});
  await Promise.all([
   api.write('Ingredients!A1',[['ID','Название','Ед. изм.','Категория','Активен','Версионный ID','Снимок данных','Время изменения'],...nextIngredients.map(x=>[x.id,x.name,x.unit,x.category||'',x.active===false?'FALSE':'TRUE',x.id,ingredientContent(x),x.updatedAt||versionNow()])]),
   api.write('TechCards!A1',[['ID карты','Версия','Продукт','Готовый выход','Ед. выхода','Создано','Комментарий','Версионный ключ','Снимок данных','Время изменения'],...nextCards.map(c=>[c.cardId,c.version,c.product,c.outputQty,c.outputUnit,c.createdAt||'',c.comment||'',String(c.cardId)+'|'+String(c.version),cardContent(c),c.updatedAt||versionNow()])]),
   api.write('TechCardIngredients!A1',[['ID строки','ID карты','Версия','ID ингредиента','Название ингредиента','Количество','Ед. изм.'],...nextCards.flatMap(c=>c.ingredients.map((x,i)=>[c.cardId+'-'+c.version+'-'+(i+1),c.cardId,c.version,x.ingredientId,x.name,x.quantity,x.unit]))])
  ]);
  setState({ingredients:nextIngredients,techCards:nextCards});
  storage.setItem(keys.ingredients,JSON.stringify(nextIngredients));storage.setItem(keys.techCards,JSON.stringify(nextCards));
 }
 async function restoreGoogleFromSheet(){
  const btn=$('headerGoogleSync');if(btn)btn.disabled=true;
  googleStatus('Читаем Google Таблицу — без записи в неё…');
  try{
   const [cloudProducts,cloudRecords,recordHeader]=await Promise.all([api.read('Products!A2:A'),api.read('Records!A2:O'),api.read('Records!A1:O1')]);
   const state=getState(),restoredMap=new Map();
   cloudRecords.forEach(row=>{const parsed=parseSheetRecord(row,recordHeader[0]||[]);if(parsed.status==='DELETE'){state.deletedIds.push(String(parsed.id));if(parsed.deletedAt)state.deletedAt[String(parsed.id)]=parsed.deletedAt;return}if(parsed.id&&parsed.product&&!state.deletedIds.includes(String(parsed.id)))restoredMap.set(String(parsed.id),parsed)});
   state.records.forEach(local=>{const id=String(local.id||'');if(!id)return;const cloud=restoredMap.get(id);restoredMap.set(id,cloud?mergeRecordLocalWins(cloud,normalizeRecord(local)):normalizeRecord(local))});
   state.deletedIds=[...new Set(state.deletedIds)];state.deletedIds.forEach(id=>restoredMap.delete(id));
   const restored=[...restoredMap.values()].sort((a,b)=>a.stamp.localeCompare(b.stamp));
   if(!restored.length)throw new Error('В таблице не найдены записи в диапазоне Records!A2:H. Локальные данные не изменены.');
   if(!restored.some(r=>r.actualYield!==0||r.plannedYield!==0||r.steaks!==0))throw new Error('Google вернул записи, но выходы и количество во всех строках равны нулю. Локальные данные не изменены.');
   const restoredProducts=[...new Set([...cloudProducts.map(r=>String(r[0]||'').trim()),...restored.map(r=>r.product)].filter(Boolean))];
   state.records=restored;state.products=[...new Set([...restoredProducts,...state.products])];setState(state);
   storage.setItem(keys.records,JSON.stringify(state.records));storage.setItem(keys.products,JSON.stringify(state.products));storage.setItem(keys.deletedIds,JSON.stringify(state.deletedIds));storage.setItem(keys.deletedAt,JSON.stringify(state.deletedAt));
   await syncStage1Sheets();renderAll();
   googleStatus('Восстановлено из Google: '+state.records.length+' записей. Таблица Google не изменялась.');
  }catch(error){googleStatus('Восстановление не выполнено: '+error.message)}
  finally{if(btn)btn.disabled=false}
 }
 async function syncGoogle(){
  if(!api.hasToken())return;
  if(syncInProgress){syncRequestedAgain=true;return}
  syncInProgress=true;const btn=$('headerGoogleSync');if(btn)btn.disabled=true;googleStatus('Синхронизация: читаем Google и объединяем данные…');
  try{
   const state=getState();
   const [cloudProducts,cloudRecords,recordHeader]=await Promise.all([api.read('Products!A2:A'),api.read('Records!A2:N'),api.read('Records!A1:N1')]);
   const recordMap=new Map(),cloudDeleted=new Map();
   cloudRecords.forEach(row=>{const parsed=parseSheetRecord(row,recordHeader[0]||[]);if(parsed.status==='DELETE'){const id=String(parsed.id),valid=String(row[10]||'')===id&&String(row[11]||'')==='DELETE';cloudDeleted.set(id,valid?String(parsed.deletedAt||''):'');return}if(parsed.id&&parsed.product){const valid=String(row[10]||'')===String(parsed.id)&&String(row[11]||'')===recordContent(parsed);if(!valid){parsed.updatedAt='';parsed._versionInvalid=true}recordMap.set(String(parsed.id),parsed)}});
   const localDeleted=new Map(Object.entries(state.deletedAt||{}).map(([id,at])=>[String(id),String(at||'')]));
   state.deletedIds.forEach(id=>{if(!localDeleted.has(String(id)))localDeleted.set(String(id),'')});
   cloudDeleted.forEach((at,id)=>{if(!localDeleted.has(id)||String(at)>String(localDeleted.get(id)||''))localDeleted.set(id,at)});
   state.records.forEach(r=>{const local=normalizeRecord(r),id=String(local.id),cloud=recordMap.get(id);if(cloud)recordMap.set(id,mergeRecordLocalWins(cloud,local));else recordMap.set(id,{...local,updatedAt:local.updatedAt||versionNow()})});
   for(const [id,deletedTime] of localDeleted){const record=recordMap.get(id);if(!record)continue;const recordTime=String(record.updatedAt||'');if(!deletedTime||!recordTime||deletedTime>=recordTime)recordMap.delete(id);else localDeleted.delete(id)}
   const productMap=new Map();
   cloudProducts.forEach(row=>{if(row[0])productMap.set(String(row[0]).toLocaleLowerCase(),String(row[0]))});
   state.products.forEach(p=>productMap.set(p.toLocaleLowerCase(),p));
   const mergedRecords=[...recordMap.values()].sort((x,y)=>x.stamp.localeCompare(y.stamp)),mergedProducts=[...productMap.values()].sort((x,y)=>x.localeCompare(y,'ru'));
   mergedRecords.forEach(r=>{if(!r.updatedAt)r.updatedAt=versionNow()});
   await syncStage1Sheets();
   state.deletedAt=Object.fromEntries(localDeleted);state.deletedIds=[...localDeleted.keys()];
   const sheetRows=[['ID','Дата и время','Продукт','Фактический выход','Плановый выход','Кол-во (шт)','Вес 1 шт (кг)','Комментарий','Статус','Пересчёт по техкарте','Версионный ID','Снимок данных','Время изменения','Время удаления'],...mergedRecords.map(r=>[String(r.id),String(r.stamp||''),String(r.product||''),numberValue(r.actualYield??r.yield),numberValue(r.plannedYield??r.layout1),numberValue(r.steaks),numberValue(r.unitWeight),String(r.comment||''),'',r.techCardScale?JSON.stringify(r.techCardScale):'',String(r.id),recordContent(r),r.updatedAt||versionNow(),'']),...state.deletedIds.map(id=>[String(id),'','','',0,0,0,'','DELETE','',''+String(id),'DELETE','',state.deletedAt[id]||''])];
   await api.write('Products!A1',[['Название продукта'],...mergedProducts.map(p=>[p])]);await api.write('Records!A1',sheetRows);await removeNormsSheet();
   state.records=mergedRecords;state.products=mergedProducts;setState(state);
   storage.setItem(keys.records,JSON.stringify(state.records));storage.setItem(keys.products,JSON.stringify(state.products));storage.setItem(keys.deletedIds,JSON.stringify(state.deletedIds));storage.setItem(keys.deletedAt,JSON.stringify(state.deletedAt));
   renderAll();googleStatus('Синхронизация завершена. Записей: '+state.records.length+', продуктов: '+state.products.length+'.');
  }catch(error){googleStatus('Ошибка синхронизации: '+error.message+'. Локальные данные сохранены.')}
  finally{syncInProgress=false;if(btn)btn.disabled=false;if(syncRequestedAgain){syncRequestedAgain=false;ui.scheduleGoogleSync?.()}}
 }
 return {syncGoogle,syncStage1Sheets,restoreGoogleFromSheet};
}
