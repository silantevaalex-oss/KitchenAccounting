import { versionNow } from './core.js';
export function mergeVersioned(cloud,local,label,content){
 if(cloud._versionInvalid&&content(cloud)!==content(local))throw new Error('Изменение '+label+' обнаружено без подтверждённой версии. Возможно, данные изменены старой версией приложения. Синхронизация остановлена для проверки.');
 const cloudTime=String(cloud.updatedAt||''),localTime=String(local.updatedAt||'');
 let merged;
 if(cloudTime&&localTime){
  if(cloudTime===localTime&&content(cloud)!==content(local))throw new Error('Конфликт '+label+': одинаковое время изменения, но разное содержимое.');
  merged=cloudTime>=localTime?{...local,...cloud,updatedAt:cloudTime}:{...cloud,...local,updatedAt:localTime};
 }else if(cloudTime||localTime){
  merged=cloudTime?{...local,...cloud,updatedAt:cloudTime}:{...cloud,...local,updatedAt:localTime};
 }else{
  if(content(cloud)!==content(local))throw new Error('Конфликт старых данных '+label+' без версии. Синхронизация остановлена, чтобы не потерять изменения.');
  merged={...cloud,...local,updatedAt:versionNow()};
 }
 delete merged._versionInvalid;
 return merged;
}
