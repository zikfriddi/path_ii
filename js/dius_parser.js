(async()=>{
if(window.__meshBulk){alert('Парсер уже работает');return}
const root=document.querySelector('#lots-list');
if(!root){alert('Открой список лотов Dius');return}
window.__meshBulk=true;
const sleep=t=>new Promise(r=>setTimeout(r,t)),links=new Map(),rows=[],errors=[];
const panel=document.createElement('div');
Object.assign(panel.style,{position:'fixed',top:'8px',left:'8px',right:'8px',zIndex:999999,background:'#202124',color:'white',padding:'14px',fontSize:'14px',borderRadius:'8px',whiteSpace:'pre-wrap',maxHeight:'70vh',overflowY:'auto'});
document.body.append(panel);
const say=s=>panel.textContent=s;
function scan(){root.querySelectorAll('a[data-itemcard]').forEach(a=>{if(a.dataset.itemcard&&a.href.includes('/item/'))links.set(a.dataset.itemcard,a.href)})}
function extract(t,key){
 const p=t.indexOf('"'+key+'"');if(p<0)throw Error('Ключ '+key+' не найден');
 const c=t.indexOf(':',p+key.length+1);if(c<0)throw Error('Нет двоеточия после '+key);
 let i=c+1;while(/\s/.test(t[i]||''))i++;
 let depth=0,str=false,esc=false;
 for(let j=i;j<t.length;j++){const x=t[j];if(str){if(esc)esc=false;else if(x==='\\')esc=true;else if(x==='"')str=false}else{if(x==='"')str=true;else if(x==='{'||x==='[')depth++;else if(x==='}'||x===']'){depth--;if(depth===0)return JSON.parse(t.slice(i,j+1))}}}
 throw Error('JSON не закрыт: '+key)
}
function parseState(html){const d=new DOMParser().parseFromString(html,'text/html');const t=[...d.scripts].map(s=>s.textContent||'').find(x=>x.includes('store/lots/cache'));if(!t)throw Error('SSR script не найден');return{cache:extract(t,'store/lots/cache'),descriptions:extract(t,'store/lots/descriptions')}}
function plain(h){const d=new DOMParser().parseFromString(h||'','text/html');return(d.body.textContent||'').replace(/\s+/g,' ').trim()}
function csv(v){if(v==null)return '';if(Array.isArray(v))v=v.join(', ');if(typeof v==='object')v=JSON.stringify(v);return '"'+String(v).replace(/"/g,'""')+'"'}
function download(name,data,type){const blob=new Blob([data],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
try{
 let idle=0,last=0;
 for(let i=0;i<140;i++){scan();say('Сбор ссылок\nНайдено: '+links.size+'\nПроход: '+(i+1)+'/140');window.scrollBy(0,650);await sleep(1000);scan();if(links.size===last)idle++;else idle=0;last=links.size;if(idle>=12)break}
 const list=[...links.values()];if(!list.length)throw Error('Ссылки не найдены');
 let next=0,done=0,success=0;
 async function worker(){while(true){const i=next++;if(i>=list.length)return;const url=list[i],id=(url.match(/\/item\/(\d+)/)||[])[1];let stage='fetch',status='—',html='';
 try{const res=await fetch(url,{credentials:'same-origin'});status=res.status;if(!res.ok)throw Error('HTTP '+status);stage='чтение HTML';html=await res.text();stage='разбор SSR';const state=parseState(html);stage='поиск лота';const lot=state.cache?.cache?.[id];if(!lot)throw Error('ID '+id+' отсутствует в cache');stage='извлечение описания';const desc=state.descriptions?.descriptions?.[String(lot.id)]?.data||{};const pictures=(lot.pictures||[]).map(p=>new URL(p.url,location.origin).href).join(' | ');rows[i]={id:lot.id,title:lot.title,price:lot.price,startPrice:lot.startPrice,endDate:lot.endDate,description:plain(desc.description),pictures,url};success++}
 catch(e){errors.push('ID: '+id+'\nURL: '+url+'\nHTTP: '+status+'\nЭтап: '+stage+'\nОшибка: '+e.message+'\nHTML: '+html.length+' символов')}
 done++;say('Загрузка лотов\nОбработано: '+done+'/'+list.length+'\nУспешно: '+success+'\nОшибок: '+errors.length+'\nПоследний ID: '+id+'\nПоследний HTTP: '+status+'\nПоследний этап: '+stage+(errors.length?'\n\nПоследняя ошибка:\n'+errors[errors.length-1].slice(0,350):''))}}
 await Promise.all(Array.from({length:4},()=>worker()));
 const valid=rows.filter(Boolean),cols=[['ID','id'],['Название','title'],['Цена','price'],['Стартовая цена','startPrice'],['Окончание','endDate'],['Описание состояния и товара','description'],['Фотографии','pictures'],['Ссылка','url']];
 const content='\uFEFF'+[cols.map(x=>csv(x[0])).join(';'),...valid.map(r=>cols.map(x=>csv(r[x[1]])).join(';'))].join('\r\n');
 download('Dius_lots_'+valid.length+'.csv',content,'text/csv;charset=utf-8');
 if(errors.length)download('Dius_errors.txt','\uFEFF'+errors.join('\r\n\n'),'text/plain;charset=utf-8');
 say('ГОТОВО!\nНайдено ссылок: '+list.length+'\nВыгружено: '+valid.length+'\nОшибок: '+errors.length+'\nCSV скачивается.\nНажми здесь, чтобы закрыть.');panel.onclick=()=>panel.remove()
}catch(e){say('КРИТИЧЕСКАЯ ОШИБКА\n'+e.stack);panel.onclick=()=>panel.remove()}
finally{window.__meshBulk=false}
})();