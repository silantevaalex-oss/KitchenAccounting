// Google Identity Services OAuth and Google Sheets HTTP transport.
export function createGoogleApi({
 clientId,sheetId,scope,getToken,setToken,onStatus=()=>{},onUnauthorized=()=>{},onConnected=()=>{},
 fetchImpl=(...args)=>fetch(...args),googleProvider=()=>globalThis.google,documentRef=globalThis.document
}){
 let tokenClient=null,identityPromise=null;
 function loadIdentity(){
  if(googleProvider()?.accounts?.oauth2)return Promise.resolve();
  if(identityPromise)return identityPromise;
  identityPromise=new Promise((resolve,reject)=>{
   let script=documentRef.querySelector('script[data-google-identity]');
   if(script){
    if(script.dataset.loaded==='1'){resolve();return}
    script.addEventListener('load',()=>{script.dataset.loaded='1';resolve()},{once:true});
    script.addEventListener('error',()=>{identityPromise=null;reject(new Error('Не удалось загрузить сервис авторизации Google'))},{once:true});
    return;
   }
   script=documentRef.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.googleIdentity='1';
   script.onload=()=>{script.dataset.loaded='1';resolve()};
   script.onerror=()=>{identityPromise=null;reject(new Error('Не удалось загрузить сервис авторизации Google'))};
   documentRef.head.appendChild(script);
  });
  return identityPromise;
 }
 function connect(){
  if(!googleProvider()?.accounts?.oauth2){
   onStatus('Подготавливаем авторизацию Google…');
   loadIdentity().then(()=>onStatus('Google готов. Нажми кнопку Google ещё раз для входа.')).catch(error=>onStatus('Не удалось загрузить Google OAuth: '+error.message));
   return;
  }
  try{
   tokenClient=googleProvider().accounts.oauth2.initTokenClient({
    client_id:clientId,scope,
    callback:async response=>{
     if(response.error){setToken(null);onUnauthorized();onStatus('Ошибка авторизации: '+response.error);return}
     setToken(response.access_token);
     onStatus('Google подключён. Выполняем безопасную синхронизацию…');
     try{await onConnected()}catch(error){onStatus('Ошибка после подключения Google: '+error.message)}
    }
   });
   tokenClient.requestAccessToken({prompt:''});
  }catch(error){onStatus('Не удалось запустить авторизацию Google: '+error.message)}
 }
 async function request(path,options={}){
  const token=getToken();
  if(!token)throw new Error('Сначала подключи Google.');
  const response=await fetchImpl('https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+path,{
   ...options,
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   if(response.status===401){setToken(null);onUnauthorized();onStatus('Сессия Google истекла. Нажмите кнопку Google, чтобы подключиться снова.')}
   throw new Error(data.error?.message||('Google Sheets API: '+response.status));
  }
  return data;
 }
 async function read(range){const data=await request('/values/'+encodeURIComponent(range));return data.values||[]}
 async function write(range,values){return request('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({range,majorDimension:'ROWS',values})})}
 return {connect,request,read,write,hasToken:()=>Boolean(getToken())};
}
