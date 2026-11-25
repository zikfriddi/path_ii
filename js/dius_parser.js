(async()=>{
if(window.__meshBulk){alert('Парсер уже работает');return}
const root=document.querySelector('#lots-list');
if(!root){alert('Не найден список лотов (#lots-list). Открой страницу продавца со списком лотов Dius.');return}
window.__meshBulk=true;
const NL=String.fromCharCode(10),sleep=t=>new Promise(r=>setTimeout(r,t)),links=new Map(),rows=[],errors=[];
const panel=document.createElement('div');
Object.assign(panel.style,{position:'fixed',top:'8px',left:'8px',right:'8px',zIndex:999999,background:'#202124',color:'white',padding:'14px',fontSize:'14px',borderRadius:'8px',whiteSpace:'pre-wrap',maxHeight:'70vh',overflowY:'auto'});
document.body.append(panel);
const say=s=>panel.textContent=s;
function scan(){root.querySelectorAll('a[data-itemcard][href*="/item/"]').forEach(a=>{if(a.dataset.itemcard)links.set(a.dataset.itemcard,a.href)})}
function text(el){return(el?.textContent||'').replace(/\s+/g,' ').trim()}
function first(d,selectors){for(const sel of selectors){const e=d.querySelector(sel);if(e&&text(e))return text(e)}return ''}
function parseLot(html,url){
 const d=new DOMParser().parseFromString(html,'text/html'),id=(url.match(/\/item\/(\d+)/)||[])[1];
 const title=first(d,['[itemprop="name"]','.titleText_5b603','h1']);
 if(!title)throw Error('Не найдено название лота: HTML похож на заглушку/страницу ограничения');
 const price=first(d,['[class*="currentBid"]','[class*="currentPrice"]','[itemprop="price"]']);
 const startPrice=first(d,['[class*="startPrice"]','[class*="startingPrice"]']);
 const endDate=first(d,['[class*="endDate"] b','[class*="endDate"]']);
 const desc=first(d,['.legacy-viewer[class*="description"]','[class*="description_"]','.description']);
 const short=first(d,['[class*="shortDescription_"]']);
 const pics=[...d.querySelectorAll('img[data-entity-type="lot"][src]')].map(x=>x.getAttribute('src')).filter(Boolean);
 const unique=[...new Set(pics.map(x=>new URL(x,url).href))];
 return{id,title,price,startPrice,endDate,description:desc||short,pictures:unique.join(' | '),url};
}
function csv(v){if(v==null)return '';if(Array.isArray(v))v=v.join(', ');if(typeof v==='object')v=JSON.stringify(v);return '"'+String(v).replace(/"/g,'""')+'"'}
function download(name,data,type){const blob=new Blob([data],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
try{
 let idle=0,last=0;
 for(let i=0;i<140;i++){scan();say('Сбор ссылок'+NL+'Найдено: '+links.size+NL+'Проход: '+(i+1)+'/140');window.scrollBy(0,1000);await sleep(350);scan();if(links.size===last)idle++;else idle=0;last=links.size;if(idle>=8)break}
 const list=[...links.values()];if(!list.length)throw Error('Ссылки не найдены');
 let next=0,done=0,success=0;
 async function worker(){while(true){const i=next++;if(i>=list.length)return;const url=list[i],id=(url.match(/\/item\/(\d+)/)||[])[1];let status='—',html='';
 try{const res=await fetch(url,{credentials:'same-origin'});status=res.status;if(!res.ok)throw Error('HTTP '+status);html=await res.text();rows[i]=parseLot(html,url);success++}
 catch(e){const d=new DOMParser().parseFromString(html,'text/html');errors.push('ID: '+id+NL+'URL: '+url+NL+'HTTP: '+status+NL+'Ошибка: '+e.message+NL+'Заголовок: '+text(d.title)+NL+'Текст страницы: '+text(d.body).slice(0,1200)+NL+'HTML: '+html.length+' символов')}
 done++;say('Выгрузка лотов (8 потоков)'+NL+'Обработано: '+done+'/'+list.length+NL+'Успешно: '+success+NL+'Ошибок: '+errors.length+NL+'Последний ID: '+id+NL+'HTTP: '+status+(errors.length?NL+NL+'Последняя ошибка:'+NL+errors[errors.length-1].slice(0,450):''))}}
 await Promise.all(Array.from({length:8},()=>worker()));
 const valid=rows.filter(Boolean),cols=[['ID','id'],['Название','title'],['Цена','price'],['Стартовая цена','startPrice'],['Окончание','endDate'],['Описание состояния и товара','description'],['Фотографии','pictures'],['Ссылка','url']];
 const content='\uFEFF'+[cols.map(x=>csv(x[0])).join(';'),...valid.map(r=>cols.map(x=>csv(r[x[1]])).join(';'))].join('\r\n');
 download('Meshok_lots_'+valid.length+'.csv',content,'text/csv;charset=utf-8');
 if(errors.length)download('Dius_errors.txt','\uFEFF'+errors.join('\r\n\r\n'),'text/plain;charset=utf-8');
 say('ГОТОВО!'+NL+'Найдено ссылок: '+list.length+NL+'Выгружено: '+valid.length+NL+'Ошибок: '+errors.length+NL+'CSV скачивается.'+NL+'Нажми здесь, чтобы закрыть.');panel.onclick=()=>panel.remove()
}catch(e){say('КРИТИЧЕСКАЯ ОШИБКА'+NL+e.stack);panel.onclick=()=>panel.remove()}
finally{window.__meshBulk=false}
})();