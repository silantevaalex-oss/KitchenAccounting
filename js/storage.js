// Safe JSON reads from browser storage. Storage is injectable for unit tests.
export function readStore(key,fallback,storage=globalThis.localStorage){
 try{const value=JSON.parse(storage.getItem(key)||'null');return value===null?fallback:value}
 catch(_){return fallback}
}
