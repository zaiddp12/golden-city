import {initAI} from '/ai.js';
const ICONS={bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',spark:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3',logout:'M9 4H4v16h5M9 12h12m-5-5 5 5-5 5',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',plus:'M12 4v16M4 12h16',shield:'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7zM8 12l3 3 5-6',
 building:'M3 21h18M5 21V8h6v13m0 0V3h8v18M7 11h2m-2 4h2m4-9h4m-4 4h4m-4 4h4m-4 4h4',
 sliders:'M4 7h8m4 0h4M4 17h3m4 0h9M12 4v6M7 14v6',
 chevron:'m6 9 6 6 6-6', search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 x:'m6 6 12 12M6 18 18 6', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
 upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',sheet:'M5 3h14v18H5zM5 9h14M10 9v12M5 15h14',
 archive:'M4 8h16v13H4zM3 3h18v5H3zM9 12h6',print:'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6zM17 11h1',
 code:'m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',list:'M8 5h12M8 12h12M8 19h12M4 5h.01M4 12h.01M4 19h.01',
 grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 arrow:'M19 12H5m6-6-6 6 6 6',arrowRight:'M5 12h14m-6-6 6 6-6 6',
 check:'m5 12 4 4L19 6',circle:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
 info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6M12 7h.01',
 copy:'M8 8h12v13H8zM16 8V3H4v13h4',car:'m5 8 2-5h10l2 5M3 9h18v9H3zM5 18v3m14-3v3M6 13h2m8 0h2',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 chart:'M4 21V3M4 21h17M8 17v-5m5 5V7m5 10V4',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4'
};
const $=s=>document.querySelector(s);
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]||ICONS.info}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const requestKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const bdi=v=>`<bdi>${esc(v)}</bdi>`;
const fmt=v=>v===null||v===undefined||v===''?'غير محدد':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const dateFmt=v=>{if(!v)return 'غير محدد';const d=new Date(v);return isNaN(d)?esc(v):new Intl.DateTimeFormat('ar-IQ',{timeZone:'Asia/Baghdad',dateStyle:'medium',...(String(v).includes('T')?{timeStyle:'short'}:{})}).format(d);};
const STATUSES={available:{ar:'متاح',color:'#278461',text:'#145E43',soft:'#EAF6EF',symbol:'○'},reserved:{ar:'محجوز',color:'#AF832D',text:'#7C5B1B',soft:'#FBF3DF',symbol:'◇'},sold:{ar:'مباع',color:'#AF546B',text:'#883D50',soft:'#F8EBEF',symbol:'✓'},hidden:{ar:'غير معروض',color:'#98A1AE',text:'#596373',soft:'#EFF1F4',symbol:'—'},unknown:{ar:'غير محسوم',color:'#7C8292',text:'#596171',soft:'#F0F1F5',symbol:'?'}};
const REQUEST_LABELS={pending:'بانتظار الموافقة',approved:'تمت الموافقة',rejected:'مرفوض',stale:'تغيّر الحجز',cancelled:'ملغى'};
const TYPES={A:{floors:29,positions:[1,2,3,4],external:[1,2],geo:{h:98.450,w:34.640,crown:8.6,form:'spine'}},C:{floors:35,positions:[1,2,3,4,5,6],external:[1,2,3],geo:{h:113.001,w:43.100,crown:7.2,form:'slab'}}};
const TOWERS=['A1','A2','A3','C1','C2'];
const svars=k=>{const s=STATUSES[k]||STATUSES.unknown;return `--status-color:${s.text};--status-soft:${s.soft};--status-border:${s.color}40`;};
const pill=(k,review=false)=>{const s=STATUSES[k]||STATUSES.unknown;return `<span class="status-pill" style="${svars(k)}">${s.symbol} ${s.ar}</span>${review?'<span class="review-pill">مراجعة</span>':''}`;};
const requestPill=k=>`<span class="request-pill ${esc(k)}">${esc(REQUEST_LABELS[k]||k)}</span>`;
let session={user:null,csrf:'',setup_required:false};
let DATA={units:[],reservations:[],requests:[],notifications:[],stats:{},import_summary:{}};
const mobile=matchMedia('(max-width:620px)'),drawer=matchMedia('(max-width:900px)');
const state={section:'units',tower:'all',mode:mobile.matches?'list':'visual',q:'',status:'all',view:'all',area:'all',band:'all',review:'all',page:1,advanced:false,selected:null};
let ai=null,detail=null,managerData={},toastTimer,viewTicket=0,refreshTimer=null,focusBeforeDetail=null,lastImport=null,sessionEpoch=0,refreshing=false;
const isManager=()=>session.user?.role==='manager';
const allowedTowers=()=>{const ts=session.user?.towers;return TOWERS.filter(t=>!Array.isArray(ts)||ts.includes(t));};
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.outerHTML=icon(el.dataset.icon));}
function toast(t){clearTimeout(toastTimer);$('#toast').textContent=t;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(path,options={}){
 const headers=new Headers(options.headers||{});const method=options.method||'GET';let body=options.body;
 if(body!==undefined&&!(body instanceof Blob)&&!(body instanceof FormData)&&!(body instanceof ArrayBuffer)){headers.set('Content-Type','application/json');body=JSON.stringify(body);}
 if(method!=='GET')headers.set('X-CSRF-Token',session.csrf||'');
 let r;try{r=await fetch(path,{...options,method,body,headers,credentials:'same-origin'});$('#connectionBanner').hidden=true;}catch{ $('#connectionBanner').hidden=false;throw new Error('تعذّر الاتصال بالخادم. لم تُؤكَّد العملية.');}
 let result;try{result=await r.json();}catch{throw new Error('استجابة غير متوقعة من الخادم.');}
 if(!r.ok){if(r.status===401&&session.user){lockSession();}const error=new Error(result.error||'تعذّر إتمام العملية');error.code=result.code;error.status=r.status;throw error;}
 return result;
}
function lockSession(){clearInterval(refreshTimer);stopOpsClock();destroyOpsViewer();document.body.classList.remove('ops-live');sessionEpoch++;viewTicket++;session.user=null;DATA={units:[],reservations:[],requests:[],notifications:[]};managerData={};lastImport=null;ai?.destroy();ai=null;closeDetail(false);$('#appDialog').close();['dialogBody','managementView','unitContent','towerOverview','detailPanel','workflowNav','kpis','importAlert','userName','userRole','toast'].forEach(id=>$('#'+id).replaceChildren());$('#toast').hidden=true;$('#appView').hidden=true;$('#accountControls').hidden=true;$('#authView').hidden=false;$('#authError').textContent='انتهت الجلسة. سجّل الدخول مجدداً.';$('#authError').hidden=false;}
async function refresh({render=true,announce=false}={}){const epoch=sessionEpoch,previous=DATA.notifications?.[0]?.id;const next=await api('/api/bootstrap');if(epoch!==sessionEpoch||!session.user)return;DATA=next;DATA.units||=[];DATA.reservations||=[];DATA.requests||=[];DATA.notifications||=[];if(DATA.user)session.user=DATA.user;$('#lastUpdated').textContent=dateFmt(new Date().toISOString());renderNotifications();if(announce&&DATA.notifications[0]&&DATA.notifications[0].id!==previous)toast(DATA.notifications[0].message);if(render)renderApp();return DATA;}
function renderNotifications(){const n=DATA.notifications?.length||0;$('#notificationCount').textContent=n;$('#notificationCount').hidden=!n;$('#notificationButton').setAttribute('aria-label',n?`التنبيهات، آخر ${n} تنبيهاً`:'التنبيهات');const badge=$('[data-section=approvals] span'),pending=DATA.requests.filter(r=>r.status==='pending').length;if(badge){badge.textContent=pending;badge.hidden=!pending;}}
function showNotifications(){const rows=DATA.notifications||[];openDialog('التنبيهات',rows.length?`<p class="helper-text">آخر التنبيهات الموجّهة إلى حسابك. تُحدّث تلقائياً أثناء فتح النظام.</p><div class="notification-list">${rows.map(n=>`<article><div>${icon(n.kind==='approval'?'clock':'info')}<b>${esc(n.message)}</b></div><small>${dateFmt(n.created_at)}</small><button class="text-btn" data-action="notification-open" data-section-target="${n.kind==='sale'?'bookings':isManager()&&n.kind==='approval'?'approvals':'requests'}">فتح السجل ${icon('arrow')}</button></article>`).join('')}</div>`:empty('لا توجد تنبيهات','ستظهر هنا طلبات الإلغاء وقرارات الموافقة الخاصة بحسابك.'));}
async function init(){try{session=await api('/api/session');if(session.user)await enterApp();else renderAuth();}catch(e){$('#authError').hidden=false;$('#authError').textContent=e.message;}}
function renderAuth(){
 $('#authView').hidden=false;$('#appView').hidden=true;$('#accountControls').hidden=true;
 const setup=session.setup_required;$('#setupNameLabel').hidden=!setup;$('#setupTokenLabel').hidden=!setup;
 $('#authTitle').textContent=setup?'إنشاء حساب المدير':'تسجيل الدخول';$('#authIntro').textContent=setup?'هيّئ حساب المدير الأول، ثم أضف موظفي المبيعات من داخل النظام.':'أدخل بيانات حسابك للوصول إلى الوحدات والحجوزات.';
 $('#authSubmit').innerHTML=(setup?'إنشاء حساب المدير':'دخول إلى النظام')+icon('arrow');
 $('#authForm [name=name]').required=setup;$('#authForm [name=token]').required=setup;
 $('#authForm [name=password]').autocomplete=setup?'new-password':'current-password';
 $('#authFooter').textContent=setup?'كلمة المرور: 12 حرفاً على الأقل. لا توجد حسابات أو كلمات مرور افتراضية.':'حساب مستقل لكل مستخدم · صلاحيات حسب الدور';
}
async function enterApp(){
 $('#authView').hidden=true;$('#appView').hidden=false;$('#accountControls').hidden=false;$('#authForm').reset();
 await refresh({render:false});readRoute();renderApp();
 ai?.destroy();ai=initAI({button:$('#aiButton'),panel:$('#aiPanel'),api,user:session.user});
 clearInterval(refreshTimer);refreshTimer=setInterval(async()=>{if(document.hidden||refreshing)return;refreshing=true;try{await refresh({announce:true,render:!$('#appDialog').open&&!state.selected&&$('#aiPanel').hidden&&['units','bookings','requests','approvals'].includes(state.section)});}catch{}finally{refreshing=false;}},25000);
}
$('#authForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=$('#authSubmit');btn.disabled=true;$('#authError').hidden=true;
 try{const payload=Object.fromEntries(new FormData(e.target));session=await api(session.setup_required?'/api/setup':'/api/login',{method:'POST',body:payload});if(!session.user)session=await api('/api/session');await enterApp();}
 catch(err){$('#authError').textContent=err.message;$('#authError').hidden=false;try{const current=await api('/api/session');if(!session.user)session=current;}catch{}}
 finally{btn.disabled=false;}
});
function readRoute(){const [section,tower]=location.hash.slice(1).split('/');const allowed=isManager()?['units','ops','bookings','requests','approvals','users','review','audit','history']:['units','bookings','requests'];state.section=allowed.includes(section)?section:'units';state.tower=allowedTowers().includes(tower)?tower:'all';}
function route(section,tower){state.selected=null;detail=null;state.page=1;state.tower=tower||'all';state.section=section;history.pushState(null,'','#'+section+(tower?'/'+tower:''));renderApp();}
function baseUnits(){return DATA.units.filter(u=>state.tower==='all'||u.tower===state.tower);}
function matches(u){if(state.q&&!u.code.toLowerCase().includes(state.q))return false;if(state.status!=='all'&&u.status!==state.status)return false;if(state.view!=='all'&&u.view!==state.view)return false;if(state.area!=='all'&&String(u.area)!==state.area)return false;if(state.review==='required'&&!u.review_required)return false;if(state.review==='verified'&&u.review_required)return false;if(state.band!=='all'){const[a,b]=state.band.split('-').map(Number);if(u.floor<a||u.floor>b)return false;}return true;}
function results(){return baseUnits().filter(matches);}
function counts(list){return list.reduce((a,u)=>{a[u.status]=(a[u.status]||0)+1;if(u.review_required)a.review++;return a;},{available:0,reserved:0,sold:0,hidden:0,unknown:0,review:0});}
function renderApp(){
 if(!session.user)return;
 $('#userName').textContent=session.user.name;$('#userRole').textContent=isManager()?'مدير المبيعات':'موظف المبيعات';
 const pending=DATA.requests.filter(r=>r.status==='pending').length,reviewCount=DATA.units.filter(u=>u.review_required).length;
 const nav=[['units','الوحدات','grid'],['bookings',isManager()?'الحجوزات':'حجوزاتي','building'],['requests','طلباتي','clock'],...(isManager()?[['ops','غرفة العمليات','chart'],['approvals','الموافقات','check',pending],['review','البيانات والمراجعة','sheet',reviewCount],['users','الموظفون والصلاحيات','user'],['audit','سجل الإجراءات','shield'],['history','سجل المصدر','archive']]:[])];
 $('#workflowNav').innerHTML=nav.map(([key,label,ico,n])=>`<button class="workflow-tab${state.section===key?' is-active':''}" data-section="${key}" aria-current="${state.section===key?'page':'false'}">${icon(ico)}${label}${n?`<span>${n}</span>`:''}</button>`).join('');
 $('#unitsView').hidden=state.section!=='units';$('#managementView').hidden=state.section==='units';
 const titles={units:'سجل الوحدات',ops:'غرفة العمليات',bookings:isManager()?'سجل الحجوزات':'حجوزاتي',requests:'طلبات الإلغاء',approvals:'مركز الموافقات',review:'البيانات والمراجعة',users:'الموظفون والصلاحيات',audit:'سجل الإجراءات',history:'سجل المصدر'};
 const intros={units:'بيانات ملف المبيعات، مع تمييز الوحدات التي تحتاج مراجعة.',ops:'لوحة العرض الحيّة لحالة المشروع، مخصّصة للشاشة الكبيرة.',bookings:'الحجوزات الحالية وتاريخها، مع إجراءات حسب الصلاحية.',requests:'تابع طلباتك وقرار المدير بشأن كل طلب.',approvals:'راجع سبب الإلغاء قبل اعتماد الطلب أو رفضه.',review:'طابق بيانات المصدر واعتمد الحالات غير المحسومة.',users:'حساب مستقل ونطاق أبراج محدد لكل موظف.',audit:'سجل زمني للتغييرات وقرارات الاعتماد.',history:'الحركات الأصلية من ملف Excel، محفوظة مع مصدرها.'};
 $('#pageTitle').innerHTML=titles[state.section]+'<span class="title-dot">.</span>';$('#pageIntro').textContent=intros[state.section];$('#pageContext').textContent=isManager()?'إدارة المبيعات':'مساحة الموظف';
 $('#pageActions').innerHTML=`<button class="btn" data-action="refresh">${icon('clock')}تحديث</button>${state.section==='units'?`<button class="btn" data-action="print">${icon('print')}طباعة</button>${isManager()?`<button class="btn" data-action="upload">${icon('upload')}استيراد</button><button class="btn" data-action="export">${icon('download')}تصدير</button>`:''}`:''}${state.section==='users'?`<button class="btn solid" data-action="new-user">${icon('plus')}إضافة موظف</button>`:''}${state.section==='review'?`<button class="btn solid" data-action="upload">${icon('upload')}استيراد Excel</button>`:''}`;
 $('#importAlert').hidden=!isManager()||!reviewCount||state.section!=='units';
 $('#importAlert').innerHTML=`${icon('info')}<span><b>${fmt(reviewCount)} وحدة تحتاج مراجعة.</b> الحجز متاح فقط للوحدات المعتمدة والمتاحة.</span><button class="text-btn" data-section="review">فتح المراجعة ${icon('arrow')}</button>`;
 document.body.classList.toggle('ops-live',state.section==='ops');
 if(state.section!=='ops'){stopOpsClock();destroyOpsViewer();}
 if(state.section==='units')renderUnits();else{closeDetail(false);renderManagement();}
}
function renderUnits(){
 const selectedInput=document.activeElement?.id,scrolls=[...document.querySelectorAll('[data-scroll]')].map(el=>[el.dataset.scroll,el.scrollTop,el.scrollLeft]);
 const us=baseUnits(),c=counts(us),bookable=us.filter(u=>u.status==='available'&&!u.review_required).length;
 $('#kpiScope').textContent=state.tower==='all'?'إحصاءات نطاق الحساب':`إحصاءات برج ${state.tower}`;
 $('#kpis').innerHTML=[['الوحدات السكنية',us.length,'building','سجلات الوحدات ضمن النطاق'],['متاح للحجز',bookable,'circle','بيانات معتمدة ووحدة متاحة','available'],['مباع',c.sold,'check','حسب الحالة الحالية'],['محجوز',c.reserved,'clock',`${fmt(c.review)} وحدة بحاجة للمراجعة`]].map(([l,n,i,b,cls])=>`<article class="kpi ${cls||''}"><div class="kpi-top"><span>${l}</span><span class="kpi-icon">${icon(i)}</span></div><strong class="kpi-number num">${fmt(n)}</strong><div class="kpi-bottom">${b}</div></article>`).join('');
 $('#towerNav').innerHTML=[['all','كل الأبراج'],...allowedTowers().map(t=>[t,t])].map(([t,l])=>`<button class="tower-tab${state.tower===t?' is-active':''}" data-tower="${t}">${t==='all'?icon('grid'):''}${l}<span class="nav-count">${t==='all'?DATA.units.length:DATA.units.filter(u=>u.tower===t).length}</span></button>`).join('');
 $('#statusFilters').innerHTML=[['all','الكل'],...Object.entries(STATUSES).map(([k,v])=>[k,v.ar])].map(([k,l])=>`<button class="status-filter${state.status===k?' is-active':''}" data-status="${k}" aria-pressed="${state.status===k}">${k==='all'?'':`<i class="dot" style="color:${STATUSES[k].color}"></i>`}${l}<span class="count">${k==='all'?us.length:c[k]||0}</span></button>`).join('');
 $('#advancedFilters').hidden=!state.advanced;$('#moreFilters').setAttribute('aria-expanded',state.advanced);
 $('#areaFilter').innerHTML='<option value="all">كل المساحات</option>'+[...new Set(us.filter(u=>u.area!=null).map(u=>u.area))].sort((a,b)=>a-b).map(a=>`<option value="${a}">${fmt(a)} م²</option>`).join('');$('#areaFilter').value=state.area;
 $('#matchCount').innerHTML=`<b>${fmt(results().length)}</b> وحدة مطابقة من ${fmt(us.length)}`;
 const overview=state.tower==='all'&&state.mode==='visual';
 $('#workspaceTitle').textContent=state.tower==='all'?(overview?'أبراج الزون الأول':'وحدات الزون الأول'):`برج ${state.tower}`;
 $('#workspaceDesc').textContent=overview?'مخطط للوحدات حسب بيانات المصدر. افتح البرج لمراجعة التفاصيل.':'اختَر وحدة لعرض حالتها وإجراءاتها المتاحة.';
 $('#workspaceTag').textContent=state.tower==='all'?'نطاق الحساب':`${TYPES[state.tower[0]].floors} طابقاً`;
 $('#visualMode').innerHTML=icon(state.tower==='all'?'building':'grid')+(state.tower==='all'?'الأبراج':'شبكة');
 $('#visualMode').classList.toggle('is-active',state.mode==='visual');$('#listMode').classList.toggle('is-active',state.mode==='list');
 $('#towerOverview').hidden=!overview;$('#unitWorkspace').hidden=overview;$('#floorToolbar').hidden=state.mode==='list';
 if(overview){renderOverview();closeDetail(false);}else{
  $('#unitWorkspace').classList.toggle('has-detail',!!state.selected);
  if(state.mode==='visual')renderBoard();else renderList();
  renderDetail();
 }
 for(const[key,top,left]of scrolls){const el=document.querySelector(`[data-scroll="${key}"]`);if(el){el.scrollTop=top;el.scrollLeft=left;}}
 if(selectedInput&&document.getElementById(selectedInput))document.getElementById(selectedInput).focus({preventScroll:true});
}
function stackBar(list){const c=counts(list),n=list.length||1;return `<div class="stack-bar">${Object.keys(STATUSES).map(k=>`<i style="width:${c[k]/n*100}%;background:${STATUSES[k].color}"></i>`).join('')}</div>`;}
function towerSVG(code){
 const T=TYPES[code[0]],G=T.geo,w=G.w,h=G.h,top=114-h,shaft=h-G.crown,n=T.positions.length,pad=1.8,gap=.7,spine=1.6,cw=(w-pad*2-gap*(n-2)-spine)/n,pitch=shaft/T.floors;
 const us=DATA.units.filter(u=>u.tower===code),map=new Map(us.map(u=>[u.floor+'-'+u.pos,u]));
 let svg=`<svg class="tower-svg" viewBox="-5 0 ${w+10} 116" aria-label="مخطط برج ${code}"><g transform="translate(0 ${top})"><rect x="0" y="${G.crown}" width="${w}" height="${shaft}" rx=".5" fill="#E9E9E0" stroke="#C5C8BB" stroke-width=".5"/><path d="M-1 ${G.crown}V${G.crown*.65}H${w*.18}V${G.crown*.3}H${w*.39}V0h${w*.22}v${G.crown*.3}H${w*.82}v${G.crown*.35}H${w+1}V${G.crown}Z" fill="#EBEADF" stroke="#BABCAD" stroke-width=".45"/>`;
 const rect=(u,x,y,width,ch)=>`<rect x="${x}" y="${y}" width="${width}" height="${ch}" rx=".25" fill="${STATUSES[u.status]?.color||STATUSES.unknown.color}" class="svg-unit${matches(u)?'':' is-dim'}" data-unit="${esc(u.code)}"><title>${esc(u.code)} · ${STATUSES[u.status]?.ar||'غير محسوم'}${u.review_required?' · بحاجة للمراجعة':''}</title></rect>`;
 for(let f=T.floors;f>=1;f--){const y=G.crown+(T.floors-f)*pitch+.4,ch=Math.max(1,pitch-.8);if(f===T.floors){for(let p=1;p<=2;p++){const u=map.get(f+'-'+p);if(u)svg+=rect(u,pad+(p-1)*(w-pad*2+gap)/2,y,(w-pad*2-gap)/2,ch);}continue;}let x=pad;T.positions.forEach((p,i)=>{const u=map.get(f+'-'+p);if(u)svg+=rect(u,x,y,cw,ch);else svg+=`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="#D4D6CC"/>`;x+=cw+(i===T.external.length-1?spine:gap);});}
 return svg+`<rect x="-2" y="${h}" width="${w+4}" height=".7" fill="#BDC1B3"/></g></svg>`;
}
function renderOverview(){const ts=allowedTowers();$('#towerOverview').innerHTML=`<div class="tower-stage" style="grid-template-columns:repeat(${ts.length},minmax(0,1fr))" data-scroll="towers">${ts.map(t=>{const us=DATA.units.filter(u=>u.tower===t),n=us.filter(u=>u.status==='available'&&!u.review_required).length,c=counts(us);return `<article class="tower-card"><div class="tower-label"><button class="tower-title" data-tower="${t}">${t}</button><span class="tower-floor">${TYPES[t[0]].floors} طابقاً</span></div><div class="tower-drawing" data-tower="${t}">${towerSVG(t)}</div><div class="tower-info"><div class="tower-info-main"><div><b>${n}</b><span>متاح للحجز</span></div><button class="tower-open" data-tower="${t}" aria-label="فتح برج ${t}">${icon('arrow')}</button></div>${stackBar(us)}<div class="tower-meta"><span>${us.length} وحدة</span><span>${c.review} للمراجعة</span></div></div></article>`;}).join('')}</div><div class="overview-bottom"><span class="hint">${icon('info')}اللون يوضح الحالة المسجلة؛ الحجز يتطلب اعتماد البيانات.</span><span>الخدمات والمداخل خارج عدد الوحدات السكنية.</span></div>`;}
function renderBoard(){const T=TYPES[state.tower[0]],us=baseUnits(),map=new Map(us.map(u=>[u.floor+'-'+u.pos,u])),n=T.positions.length,tpl=`38px repeat(${n},minmax(0,1fr))`;
 $('#floorJump').innerHTML='<option value="">اختر</option>'+Array.from({length:T.floors},(_,i)=>T.floors-i).map(f=>`<option value="${f}">${f}</option>`).join('');
 let h=`${results().length?'':`<div class="result-note">${icon('info')}لا توجد وحدات تطابق الفلاتر الحالية. <button class="text-btn" data-action="clear">مسح الفلاتر</button></div>`}<div class="board-scroll" data-scroll="board-${state.tower}"><div class="board"><div class="board-head" style="grid-template-columns:${tpl}"><span class="floor-head">طابق</span>${T.positions.map(p=>`<div class="position"><b>${String(p).padStart(2,'0')}</b><span>موقع الوحدة</span></div>`).join('')}</div>`;
 for(let f=T.floors;f>=1;f--){h+=`<div class="board-row" id="floor-${f}" style="grid-template-columns:${tpl}"><span class="floor-cell">${f}</span>`;const positions=f===T.floors?[1,2]:T.positions;for(const p of positions){const u=map.get(f+'-'+p),span=f===T.floors?n/2:1;if(u){h+=`<button class="unit-cell${matches(u)?'':' is-dim'}${u.code===state.selected?' selected':''}" style="${svars(u.status)};grid-column:span ${span}" data-unit="${esc(u.code)}" ${matches(u)?'':'disabled'} aria-label="${esc(u.code)}، ${STATUSES[u.status]?.ar||'غير محسوم'}"><span class="cell-top"><bdi>${f===T.floors?'بنتهاوس '+p:String(p).padStart(2,'0')}</bdi><span>${u.review_required?'!':STATUSES[u.status]?.symbol||'?'}</span></span><span class="cell-meta"><bdi>${u.area==null?'مساحة غير مؤكدة':fmt(u.area)+' م²'}</bdi><small>${u.review_required?'مراجعة':STATUSES[u.status]?.ar||''}</small></span></button>`;}else h+=`<div class="garage-cell" style="grid-column:span ${span}">${f<=3?icon('car')+'خدمات':'لا يوجد سجل'}</div>`;}h+='</div>';}
 const outside=us.filter(u=>!Number.isInteger(u.floor)||u.floor<1||u.floor>T.floors||!T.positions.includes(u.pos));
 h+='</div></div>'+(outside.length?`<div class="result-note">${icon('info')}${outside.length} سجل بموقع يحتاج مراجعة؛ يظهر في عرض القائمة.</div>`:'');$('#unitContent').innerHTML=h;
}
function sortUnits(us){return [...us].sort((a,b)=>TOWERS.indexOf(a.tower)-TOWERS.indexOf(b.tower)||(b.floor||0)-(a.floor||0)||(a.pos||0)-(b.pos||0));}
function renderList(){const all=sortUnits(results()),pages=Math.max(1,Math.ceil(all.length/30));state.page=Math.min(state.page,pages);const start=(state.page-1)*30,us=all.slice(start,start+30);if(!us.length){$('#unitContent').innerHTML=empty('لا توجد وحدات مطابقة','جرّب تغيير كود الوحدة أو الفلاتر.');return;}
 $('#unitContent').innerHTML=`<div class="list-wrap" data-scroll="list"><table class="unit-table"><thead><tr><th>الوحدة</th><th>الطابق</th><th>المساحة</th><th>الإطلالة</th><th>الحالة</th><th></th></tr></thead><tbody>${listRows(us)}</tbody></table><div class="mobile-units">${us.map(u=>`<button class="mobile-unit${u.code===state.selected?' selected':''}" data-unit="${esc(u.code)}"><span class="mobile-unit-top"><b dir="ltr">${esc(u.code)}</b><span>${pill(u.status,u.review_required)}</span></span><span class="mobile-unit-bottom"><span><b>${fmt(u.area)}</b> ${u.area==null?'':'م²'}</span><span>طابق <b>${u.floor??'؟'}</b></span><span>${u.view==='ext'?'خارجية':u.view==='int'?'داخلية':'غير محددة'}</span></span></button>`).join('')}</div></div><div class="list-pagination"><span>${bdi(`${start+1}–${start+us.length}`)} من ${fmt(all.length)} وحدة</span><div class="pagination-buttons"><button data-page="prev" ${state.page===1?'disabled':''} aria-label="السابق">${icon('arrowRight')}</button><span dir="ltr">${state.page} / ${pages}</span><button data-page="next" ${state.page===pages?'disabled':''} aria-label="التالي">${icon('arrow')}</button></div></div>`;
}
function listRows(us){return us.map(u=>`<tr class="${u.code===state.selected?'selected':''}"><td><button class="code-btn" data-unit="${esc(u.code)}">${bdi(u.code)}</button></td><td>${u.floor??'؟'}</td><td class="table-area">${bdi(fmt(u.area))}${u.area!=null?' م²':''}</td><td class="view-label">${u.view==='ext'?'خارجية':u.view==='int'?'داخلية':'غير محددة'}</td><td>${pill(u.status,u.review_required)}${u.pending_cancellation?'<span class="review-pill">طلب إلغاء</span>':''}</td><td><button class="row-arrow" data-unit="${esc(u.code)}" aria-label="عرض التفاصيل">${icon('arrow')}</button></td></tr>`).join('');}
async function selectUnit(code){
 focusBeforeDetail=document.activeElement;state.selected=code;detail=null;
 if(state.tower==='all'&&state.mode==='visual'){state.tower=DATA.units.find(u=>u.code===code)?.tower||'all';state.mode=mobile.matches?'list':'visual';}
 renderUnits();if(drawer.matches)$('#closeDetail')?.focus({preventScroll:true});
 try{const d=await api('/api/units/'+encodeURIComponent(code));if(state.selected!==code)return;detail=d;renderDetail();if(drawer.matches)$('#closeDetail')?.focus({preventScroll:true});}catch(e){toast(e.message);closeDetail();}
}
function closeDetail(repaint=true){state.selected=null;detail=null;$('#detailPanel').hidden=true;$('#detailBackdrop').hidden=true;document.body.style.overflow='';$('#unitWorkspace').classList.remove('has-detail');if(repaint&&state.section==='units')renderUnits();if(focusBeforeDetail?.isConnected)focusBeforeDetail.focus({preventScroll:true});}
function renderDetail(){const host=$('#detailPanel');if(!state.selected){host.hidden=true;$('#detailBackdrop').hidden=true;document.body.style.overflow='';return;}host.hidden=false;host.setAttribute('role',drawer.matches?'dialog':'complementary');host.setAttribute('aria-labelledby','detailTitle');if(drawer.matches)host.setAttribute('aria-modal','true');else host.removeAttribute('aria-modal');$('#detailBackdrop').hidden=!drawer.matches;document.body.style.overflow=drawer.matches?'hidden':'';
 const u=detail?.unit||DATA.units.find(x=>x.code===state.selected),r=detail?.reservation;if(!u)return;
 const canBook=u.status==='available'&&!u.review_required,hasActive=r&&r.status==='active',price=u.area!=null&&u.price_per_m2!=null?u.area*u.price_per_m2:null;
 host.innerHTML=`<div class="detail-top"><h3 id="detailTitle">تفاصيل الوحدة</h3><button class="icon-btn" data-action="close-detail" id="closeDetail" aria-label="إغلاق التفاصيل">${icon('x')}</button></div><div class="detail-hero"><div class="detail-code-row"><strong dir="ltr">${esc(u.code)}</strong></div>${pill(u.status,u.review_required)}<p>برج ${bdi(u.tower)} · ${u.allocation==='bulk'?'تخصيص جملة':'وحدة سكنية'}</p></div><dl class="detail-specs"><div><dt>المساحة</dt><dd>${fmt(u.area)} ${u.area!=null?'م²':''}</dd></div><div><dt>الطابق</dt><dd>${u.floor??'غير محسوم'}</dd></div><div><dt>الإطلالة</dt><dd>${u.view==='ext'?'خارجية':u.view==='int'?'داخلية':'غير محددة'}</dd></div><div><dt>الموقع</dt><dd>${u.pos??'غير محدد'}</dd></div></dl><div class="price-card"><span>القيمة المحسوبة للوحدة</span><strong>${bdi(fmt(price))} ${price!=null?'<small>د.ع</small>':''}</strong><small>سعر المتر: ${bdi(fmt(u.price_per_m2))} ${u.price_per_m2!=null?'د.ع':''}</small></div>${r?`<dl class="detail-extra"><dt>العميل</dt><dd>${esc(r.client_name||'غير محدد')}</dd><dt>الهاتف</dt><dd>${bdi(r.client_phone||'غير محدد')}</dd><dt>الحجز</dt><dd>${bdi(String(r.id))}</dd><dt>الموظف</dt><dd>${esc(r.salesperson_name||'سجل مستورد')}</dd><dt>التاريخ</dt><dd>${dateFmt(r.created_at||r.date)}</dd>${r.deposit!=null?`<dt>العربون المسجل</dt><dd>${bdi(fmt(r.deposit))} د.ع</dd>`:''}</dl>`:''}${u.review_required?`<div class="detail-review"><b>تحتاج بيانات هذه الوحدة إلى مراجعة</b>${isManager()?`<ul>${(u.review_reasons||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p>لا يمكن حجزها قبل اعتماد المدير.</p>'}</div>`:''}<div class="detail-actions">${canBook?`<button class="btn solid wide" data-action="book" data-code="${esc(u.code)}">${icon('plus')}حجز الوحدة</button>`:''}${hasActive?`<button class="btn wide" data-action="cancel-request" data-id="${r.id}" ${u.pending_cancellation?'disabled':''}>${u.pending_cancellation?'طلب الإلغاء قيد المراجعة':'طلب إلغاء الحجز'}</button>${isManager()?`<button class="btn wide" data-action="sell" data-id="${r.id}">اعتماد البيع</button>`:''}`:''}${isManager()?`<button class="btn wide" data-action="review-unit" data-code="${esc(u.code)}">${icon('shield')}${u.review_required?'مراجعة واعتماد البيانات':'تفاصيل الاعتماد'}</button><button class="text-btn" data-action="edit-price" data-code="${esc(u.code)}">تعديل سعر المتر</button>`:''}</div>${detail?`<p class="detail-note">${icon('info')}البيانات حسب صلاحيات حسابك. تغيير الحالة يُسجّل باسم المستخدم.</p>`:'<p class="detail-note">جارٍ تحميل التفاصيل…</p>'}`;
}
function empty(title,desc=''){return `<div class="empty-state"><div class="empty-icon">${icon('sheet')}</div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`;}
async function renderManagement(){
 const section=state.section,ticket=++viewTicket,host=$('#managementView');host.innerHTML='<div class="management-card loading-state">جارٍ تحميل البيانات…</div>';
 try{
  if(section==='ops'){managerData={};renderOps();return;}
  if(section==='bookings'){managerData={};renderBookings();return;}
  if(section==='requests'||section==='approvals'){managerData={};renderRequests();return;}
  const endpoint={users:'/api/users',review:'/api/reviews',audit:'/api/audit',history:'/api/history'}[section];
  const d=await api(endpoint);if(ticket!==viewTicket||state.section!==section)return;managerData=d;
  if(section==='users')renderUsers();if(section==='review')renderReviews();if(section==='audit')renderAudit();if(section==='history')renderHistory();
 }catch(e){if(ticket===viewTicket)host.innerHTML=empty('تعذّر تحميل البيانات',e.message);}
}
/* =============================================================================
   غرفة العمليات — شاشة العرض الدائمة (Operations Room)
   تُطبّق المرجعية التصميمية الموثّقة في style.css تحت العنوان نفسه.
   كل الأرقام محسوبة من DATA الحيّة — لا قيم ثابتة ولا بيانات تجريبية.
   ============================================================================= */

const OPS_MAX_TICKER = 15;
const OPS_TALLEST = Math.max(...Object.values(TYPES).map(t => t.floors));
const OPS_MONTHS = 12;
const opsArName = new Intl.DateTimeFormat('ar-IQ', {timeZone: 'Asia/Baghdad', month: 'short'});
let opsClock = null, opsViewer = null, opsTowerKey = null, opsFloor = null;

function opsUnits(){return DATA.units||[];}
function opsPct(part, whole){return whole ? Math.round(part / whole * 100) : 0;}

// --- تجميع الحجوزات على آخر 12 شهراً، بالتقويم الميلادي وتوقيت بغداد ---
function opsMonthly(){
 const buckets = [];
 const now = new Date();
 for(let i = OPS_MONTHS - 1; i >= 0; i--){
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  buckets.push({key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: opsArName.format(d), reserved: 0, sold: 0});
 }
 const index = new Map(buckets.map(b => [b.key, b]));
 (DATA.reservations||[]).forEach(r => {
  const raw = r.created_at || r.source_date;
  if(!raw) return;                                   // سجل مستورد بتاريخ مجهول — لا يُحتسب
  const d = new Date(raw);
  if(isNaN(d)) return;
  const b = index.get(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  if(!b) return;
  if(r.status === 'sold') b.sold++;
  else if(r.status === 'active') b.reserved++;
 });
 return buckets;
}

// --- عدّاد قوسي: نسبة البيع من إجمالي الوحدات ---
function opsGauge(value){
 const R = 92, CX = 110, CY = 116, SPAN = 250, START = 145;
 const pt = (deg, r) => [CX + r * Math.cos(deg * Math.PI / 180), CY + r * Math.sin(deg * Math.PI / 180)];
 const arc = (from, to, r) => {
  const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
 };
 const end = START + SPAN * (value / 100);
 const ticks = Array.from({length: 26}, (_, i) => {
  const deg = START + SPAN * (i / 25), on = deg <= end;
  const [x1, y1] = pt(deg, R - 16), [x2, y2] = pt(deg, R - (i % 5 === 0 ? 27 : 23));
  return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="ops-tick${on ? ' on' : ''}"/>`;
 }).join('');
 return `<svg viewBox="12 12 196 180" class="ops-gauge" role="img" aria-label="نسبة البيع ${value} بالمئة">
  <path d="${arc(START, START + SPAN, R)}" class="ops-arc-bg"/>
  <path d="${arc(START, end, R)}" class="ops-arc-on"/>
  ${ticks}
  <text x="${CX}" y="${CY - 2}" class="ops-gauge-value">${value}<tspan class="ops-gauge-pct">%</tspan></text>
  <text x="${CX}" y="${CY + 24}" class="ops-gauge-label">نسبة البيع</text>
 </svg>`;
}

// --- مخطط مساحي مزدوج: المبيعات والحجوزات شهرياً ---
function opsTrend(rows){
 const W = 600, H = 190, PAD_X = 10, PAD_Y = 14;
 const peak = Math.max(4, ...rows.map(r => Math.max(r.sold, r.reserved)));
 const x = i => PAD_X + (W - PAD_X * 2) * (rows.length < 2 ? .5 : i / (rows.length - 1));
 const y = v => H - PAD_Y - (H - PAD_Y * 2) * (v / peak);
 const line = key => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(' ');
 const area = key => `${line(key)} L${x(rows.length - 1).toFixed(1)} ${H - PAD_Y} L${x(0).toFixed(1)} ${H - PAD_Y} Z`;
 const grid = [0, .5, 1].map(f => `<line x1="${PAD_X}" y1="${y(peak * f).toFixed(1)}" x2="${W - PAD_X}" y2="${y(peak * f).toFixed(1)}" class="ops-grid"/>`).join('');
 const labels = rows.map((r, i) => `<span>${i % 2 ? '' : esc(r.label)}</span>`).join('');
 const dots = rows.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.sold).toFixed(1)}" r="3" class="ops-dot-sold"/>`).join('');
 return `<div class="ops-trend-wrap"><svg viewBox="0 0 ${W} ${H}" class="ops-trend" preserveAspectRatio="none" role="img" aria-label="منحنى المبيعات والحجوزات الشهري">
  <defs>
   <linearGradient id="opsFillSold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#38D8F5" stop-opacity=".42"/><stop offset="1" stop-color="#38D8F5" stop-opacity="0"/></linearGradient>
   <linearGradient id="opsFillRes" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F2B441" stop-opacity=".26"/><stop offset="1" stop-color="#F2B441" stop-opacity="0"/></linearGradient>
  </defs>
  ${grid}
  <path d="${area('reserved')}" fill="url(#opsFillRes)"/><path d="${line('reserved')}" class="ops-line-res"/>
  <path d="${area('sold')}" fill="url(#opsFillSold)"/><path d="${line('sold')}" class="ops-line-sold"/>
  ${dots}
 </svg><div class="ops-axis-row">${labels}</div></div>`;
}

// --- برج مرسوم بالكود: كل طابق شريط يأخذ لون الحالة الغالبة فيه ---
function opsTower(tower){
 const type = TYPES[tower[0]], floors = type.floors;
 const us = opsUnits().filter(u => u.tower === tower);
 const c = counts(us);
 const pct = opsPct(c.sold, us.length);
 const W = 60, BAR = 4, GAP = 1.4, H = floors * (BAR + GAP) + 26;
 const share = (floors / OPS_TALLEST).toFixed(3);   // الفارق الحقيقي بين نمط A ونمط C يبقى مقروءاً
 const byFloor = new Map();
 us.forEach(u => {
  const f = byFloor.get(u.floor) || {available: 0, reserved: 0, sold: 0, other: 0};
  f[u.status === 'available' || u.status === 'reserved' || u.status === 'sold' ? u.status : 'other']++;
  byFloor.set(u.floor, f);
 });
 const bars = Array.from({length: floors}, (_, i) => {
  const floor = floors - i, f = byFloor.get(floor);
  const cls = !f ? 'none' : f.sold >= f.reserved && f.sold >= f.available ? 'sold' : f.reserved >= f.available ? 'reserved' : 'available';
  return `<rect x="9" y="${(i * (BAR + GAP) + 20).toFixed(1)}" width="${W - 18}" height="${BAR}" rx="1" class="ops-floor ${cls}"/>`;
 }).join('');
 return `<button class="ops-tower" data-tower="${tower}" style="--ops-share:${share}" aria-label="برج ${tower}، مباع ${pct} بالمئة">
  <svg viewBox="0 0 ${W} ${H}" class="ops-tower-svg" preserveAspectRatio="none" aria-hidden="true">
   <path d="M9 20 L${W / 2} 11 L${W - 9} 20 Z" class="ops-crown"/>
   ${bars}
   <ellipse cx="${W / 2}" cy="${H - 3}" rx="${W / 2 - 4}" ry="3.5" class="ops-base"/>
  </svg>
  <span class="ops-tower-name" dir="ltr">${esc(tower)}</span>
  <span class="ops-tower-pct">${pct}<small>%</small></span>
 </button>`;
}

// --- قوائم الترتيب ---
function opsRank(rows, tone){
 if(!rows.length) return '<p class="ops-empty">لا توجد بيانات كافية.</p>';
 const peak = Math.max(...rows.map(r => r.value)) || 1;
 return `<ol class="ops-rank ${tone}">${rows.map(r => `<li>
  <span class="ops-rank-name">${r.ltr ? `<bdi dir="ltr">${esc(r.name)}</bdi>` : esc(r.name)}</span>
  <span class="ops-rank-track"><i style="width:${Math.max(4, r.value / peak * 100).toFixed(1)}%"></i></span>
  <b class="ops-rank-value num">${fmt(r.value)}</b>
 </li>`).join('')}</ol>`;
}

// --- شريط الحركات الحي ---
function opsTicker(){
 const rows = (DATA.reservations||[])
  .filter(r => r.created_at || r.source_date)
  .sort((a, b) => new Date(b.created_at || b.source_date) - new Date(a.created_at || a.source_date))
  .slice(0, OPS_MAX_TICKER);
 if(!rows.length) return '<p class="ops-empty">لم تُسجَّل حركات بعد.</p>';
 const kind = r => r.status === 'sold' ? ['بيع', 'sold'] : r.status === 'cancelled' ? ['إلغاء', 'cancelled'] : ['حجز', 'reserved'];
 return `<ul class="ops-feed">${rows.map(r => {
  const [label, cls] = kind(r);
  return `<li class="ops-feed-row ${cls}">
   <span class="ops-feed-kind">${esc(label)}</span>
   <b dir="ltr" class="ops-feed-unit">${esc(r.unit_code)}</b>
   <span class="ops-feed-who">${esc(r.salesperson_name || 'سجل مستورد')}</span>
   <time class="ops-feed-time">${dateFmt(r.created_at || r.source_date)}</time>
  </li>`;
 }).join('')}</ul>`;
}

function renderOps(){
 const us = opsUnits(), c = counts(us), total = us.length;
 const bookable = us.filter(u => u.status === 'available' && !u.review_required).length;
 const sellRate = opsPct(c.sold, total);
 const res = DATA.reservations||[];
 const active = res.filter(r => r.status === 'active').length;
 const pending = (DATA.requests||[]).filter(r => r.status === 'pending').length;
 const months = opsMonthly();
 const thisMonth = months[months.length - 1] || {sold: 0, reserved: 0};
 const prevMonth = months[months.length - 2] || {sold: 0, reserved: 0};
 const delta = thisMonth.sold - prevMonth.sold;

 const towerRank = allowedTowers().map(t => {
  const tu = us.filter(u => u.tower === t);
  return {name: t, value: counts(tu).sold, ltr: true};
 }).sort((a, b) => b.value - a.value);

 const staff = new Map();
 res.filter(r => r.status !== 'cancelled' && r.salesperson_name).forEach(r => staff.set(r.salesperson_name, (staff.get(r.salesperson_name) || 0) + 1));
 const staffRank = [...staff].map(([name, value]) => ({name, value})).sort((a, b) => b.value - a.value).slice(0, 6);

 const metrics = [
  ['إجمالي الوحدات', total, 'building', 'ضمن نطاق الحساب'],
  ['متاح للحجز', bookable, 'circle', 'معتمد وجاهز', 'available'],
  ['حجوزات فعّالة', active, 'clock', `${fmt(pending)} طلب إلغاء معلّق`, 'reserved'],
  ['مباع', c.sold, 'check', delta === 0 ? 'كالشهر الماضي' : `${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} عن الشهر الماضي`, 'sold'],
 ];

 $('#managementView').innerHTML = `<div class="ops" id="opsRoot">
  <div class="ops-grain" aria-hidden="true"></div>
  <header class="ops-head">
   <div class="ops-head-brand"><span class="ops-head-mark">${icon('building')}</span><div><b>المدينة الذهبية</b><small>غرفة العمليات · الزون الأول</small></div></div>
   <div class="ops-head-end">
    <span class="ops-live-dot" aria-hidden="true"></span><span class="ops-live-text">بيانات حيّة</span>
    <time class="ops-clock" id="opsClock"></time>
    <button class="ops-fs" data-action="ops-fullscreen" aria-label="ملء الشاشة">${icon('expand')}</button>
   </div>
  </header>

  <section class="ops-metrics">${metrics.map(([label, value, ico, note, tone]) => `
   <article class="ops-metric ${tone || ''}">
    <div class="ops-metric-top"><span>${label}</span><span class="ops-metric-icon">${icon(ico)}</span></div>
    <strong class="num">${fmt(value)}</strong>
    <small>${note}</small>
   </article>`).join('')}
  </section>

  <div class="ops-body">
   <section class="ops-panel ops-bars">
    <h3 class="ops-panel-title">حالة الطوابق</h3>
    <div class="ops-towers" id="opsScene">${allowedTowers().map(opsTower).join('')}</div>
    <div class="ops-legend">
     <span class="available">متاح</span><span class="reserved">محجوز</span><span class="sold">مباع</span><span class="none">غير مسجّل</span>
    </div>
   </section>

   <section class="ops-panel ops-hero">
    <div class="ops-hero-head">
     <h3 class="ops-panel-title">المجسّم ثلاثي الأبعاد</h3>
     <div class="ops-hero-views">
      <button data-action="ops-view" data-view="iso" class="is-on">مجسّم</button>
      <button data-action="ops-view" data-view="front">أمام</button>
      <button data-action="ops-view" data-view="right">جانب</button>
      <button data-action="ops-view" data-view="top">أعلى</button>
     </div>
    </div>
    <div class="ops-stage">
     <canvas id="opsCanvas"></canvas>
     <div class="ops-band" id="opsBand" hidden></div>
     <div class="ops-stage-badge" id="opsStageBadge"></div>
     <div class="ops-ruler" id="opsRuler" aria-label="اختيار الطابق"></div>
     <div class="ops-floor-card" id="opsFloorCard" hidden></div>
     <div class="ops-stage-note" id="opsStageNote">جارٍ تحضير المجسّم…</div>
    </div>
    <p class="ops-hero-hint">${icon('info')}اضغط طابقاً من المقياس لعرض شققه · ترتيب الشقق في البطاقة تخطيطي، فالنموذج لا يربط هندسته بأكواد الوحدات</p>
   </section>

   <section class="ops-panel ops-gauge-panel">
    <h3 class="ops-panel-title">مؤشر الإنجاز</h3>
    ${opsGauge(sellRate)}
    <dl class="ops-gauge-legend">
     <div><dt>مباع</dt><dd class="sold num">${fmt(c.sold)}</dd></div>
     <div><dt>محجوز</dt><dd class="reserved num">${fmt(c.reserved)}</dd></div>
     <div><dt>متاح</dt><dd class="available num">${fmt(c.available)}</dd></div>
    </dl>
   </section>

   <section class="ops-panel ops-trend-panel">
    <h3 class="ops-panel-title">المبيعات والحجوزات · آخر ١٢ شهراً</h3>
    ${opsTrend(months)}
    <div class="ops-legend"><span class="sold">مباع</span><span class="reserved">محجوز</span></div>
   </section>

   <section class="ops-panel ops-rank-panel ops-rank-staff">
    <h3 class="ops-panel-title">الموظفون حسب عدد الحجوزات</h3>
    ${opsRank(staffRank, 'gold')}
   </section>

   <section class="ops-panel ops-feed-panel">
    <h3 class="ops-panel-title">آخر الحركات</h3>
    ${opsTicker()}
   </section>
  </div>
 </div>`;

 startOpsClock();
 mountOpsViewer(opsTowerKey || allowedTowers()[0] || 'A1');
}

// --- المجسّم: تُحمَّل وحدة العرض والنموذج عند فتح القسم فقط، لا مع تحميل النظام ---
async function mountOpsViewer(tower){
 const canvas = $('#opsCanvas');
 if(!canvas) return;
 opsTowerKey = tower;
 const type = tower[0];
 markOpsTower(tower);
 const note = $('#opsStageNote'), badge = $('#opsStageBadge');
 const meta = TYPES[type] || {};
 if(badge) badge.innerHTML = `<b dir="ltr">${esc(tower)}</b><span>نمط ${esc(type)} · ${fmt(meta.floors || 0)} طابقاً · ${fmt((meta.geo && meta.geo.h) || 0)} م</span>`;
 try{
  if(!opsViewer){
   const mod = await import('/ops3d.js');
   if(!$('#opsCanvas')) return;
   opsViewer = mod.createTowerViewer(canvas, {onError: e => opsStageMessage(String(e && e.message || e))});
   if(!opsViewer.supported){opsStageMessage('هذا المتصفح لا يدعم WebGL 2، فلا يمكن عرض المجسّم.');return;}
  }
  if(note){note.hidden = false;note.textContent = 'جارٍ تحميل مجسّم نمط ' + type + '…';}
  const model = await opsViewer.select(type);
  if(!$('#opsCanvas')) return;
  if(note) note.hidden = true;
  if(model && badge) badge.insertAdjacentHTML('beforeend', `<small>${fmt(model.triangles)} مثلث</small>`);
  const floors = (TYPES[type] || {}).floors || 0;
  opsFloor = Math.min(opsFloor || Math.round(floors / 2) || 1, floors) || null;
  opsViewer.onFrame(paintOpsFloor);
  renderOpsRuler();
  renderOpsFloorCard();
  paintOpsFloor();
 }catch(e){opsStageMessage(e.message || 'تعذّر تحميل المجسّم.');}
}

// --- طبقة الحجوزات فوق المجسّم ---------------------------------------------
// مستوى كل طابق محسوب من الارتفاع الحقيقي للنموذج مقسوماً على عدد طوابقه، ثم
// مُسقَط على الشاشة بمصفوفة الكاميرا نفسها — فالمواضع الرأسية حقيقية لا تقديرية.
// أما ترتيب الشقق أفقياً فهو تخطيطي: النموذج لا يحمل ربطاً بين هندسته وأكواد
// الوحدات، ولا يصحّ الإيحاء بأن العلامة تقف على نافذة بعينها.

function opsFloorUnits(tower, floor){
 return opsUnits().filter(u => u.tower === tower && u.floor === floor)
  .sort((a, b) => (a.pos || 0) - (b.pos || 0));
}
function opsFloorStatus(us){
 if(!us.length) return 'none';
 const c = counts(us);
 if(c.sold >= c.reserved && c.sold >= c.available) return 'sold';
 return c.reserved >= c.available ? 'reserved' : 'available';
}
function opsReservationFor(code){
 return (DATA.reservations||[]).find(r => r.unit_code === code && r.status !== 'cancelled');
}

// مقياس الطوابق: عمود مرقّم بجانب المجسّم، كل درجة فيه طابق بلون حالته
function renderOpsRuler(){
 const host = $('#opsRuler');
 if(!host) return;
 const floors = (TYPES[opsTowerKey[0]] || {}).floors || 0;
 host.innerHTML = Array.from({length: floors}, (_, i) => {
  const floor = floors - i;
  const us = opsFloorUnits(opsTowerKey, floor);
  const show = floor % 5 === 0 || floor === 1 || floor === floors;
  return `<button class="ops-rung ${opsFloorStatus(us)}${floor === opsFloor ? ' is-on' : ''}"
   data-action="ops-floor" data-floor="${floor}" aria-label="الطابق ${floor}"
   ><span>${show ? floor : ''}</span></button>`;
 }).join('');
}

// شريط ضوئي على المجسّم عند مستوى الطابق المختار. يُستدعى مع كل إطار مرسوم،
// فلا يلمس إلا الأنماط — بناء HTML هنا يخنق السحب على نموذج بثلاثة ملايين مثلث.
function paintOpsFloor(){
 const band = $('#opsBand');
 if(!band || !opsViewer) return;
 const b = opsViewer.bounds();
 const floors = (TYPES[opsTowerKey[0]] || {}).floors || 0;
 if(!b || !floors || !opsFloor){band.hidden = true;return;}

 const y = b.min[1] + (b.max[1] - b.min[1]) * ((opsFloor - .5) / floors);
 const corners = [[b.min[0],y,b.min[2]],[b.min[0],y,b.max[2]],[b.max[0],y,b.min[2]],[b.max[0],y,b.max[2]]]
  .map(p => opsViewer.project(p)).filter(Boolean);
 if(corners.length < 4){band.hidden = true;return;}
 const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
 const left = Math.min(...xs), right = Math.max(...xs), mid = (Math.min(...ys) + Math.max(...ys)) / 2;

 band.hidden = false;
 band.style.insetInlineStart = '';
 band.style.left = (left - 10) + 'px';
 band.style.width = (right - left + 20) + 'px';
 band.style.top = mid + 'px';
 band.dataset.label = 'الطابق ' + opsFloor;
}

// بطاقة شقق الطابق: تُبنى عند اختيار طابق، لا مع كل إطار
function renderOpsFloorCard(){
 const card = $('#opsFloorCard');
 if(!card) return;
 if(!opsFloor){card.hidden = true;return;}
 const us = opsFloorUnits(opsTowerKey, opsFloor);
 card.hidden = false;
 card.innerHTML = `<div class="ops-floor-head"><b>الطابق ${fmt(opsFloor)}</b><span>${fmt(us.length)} وحدة</span>`
  + `<button class="ops-floor-close" data-action="ops-floor" data-floor="0" aria-label="إغلاق">${icon('x')}</button></div>`
  + (us.length ? `<ul class="ops-floor-list">${us.map(u => {
     const r = opsReservationFor(u.code);
     return `<li class="${esc(u.status)}">
      <b dir="ltr">${esc(u.code)}</b>
      <span class="ops-floor-state">${esc((STATUSES[u.status] || STATUSES.unknown).ar)}</span>
      <span class="ops-floor-area">${fmt(Math.round(u.area))} م²</span>
      <span class="ops-floor-who">${esc(r ? (r.client_name || 'عميل غير مسمّى') : u.review_required ? 'بحاجة مراجعة' : '—')}</span>
     </li>`;
    }).join('')}</ul>` : '<p class="ops-empty">لا توجد وحدات مسجّلة على هذا الطابق.</p>');
}

function setOpsFloor(floor){
 opsFloor = (!floor || floor === opsFloor) ? null : floor;   // الضغط على الطابق نفسه يطوي البطاقة
 renderOpsRuler();
 renderOpsFloorCard();
 paintOpsFloor();
}

function opsStageMessage(text){const note = $('#opsStageNote');if(note){note.hidden = false;note.textContent = text;}}
function markOpsTower(tower){document.querySelectorAll('.ops-tower').forEach(b => b.classList.toggle('is-on', b.dataset.tower === tower));}

function startOpsClock(){
 stopOpsClock();
 const tick = () => {
  const el = $('#opsClock');
  if(!el) return stopOpsClock();
  el.textContent = new Intl.DateTimeFormat('ar-IQ', {timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).format(new Date());
 };
 tick();
 opsClock = setInterval(tick, 1000);
}
function stopOpsClock(){if(opsClock){clearInterval(opsClock);opsClock = null;}}
function destroyOpsViewer(){if(opsViewer){opsViewer.destroy();opsViewer = null;}}


function rowActions(r){const pending=DATA.requests.some(x=>String(x.reservation_id)===String(r.id)&&x.status==='pending');return `<div class="row-actions"><button class="text-btn" data-unit="${esc(r.unit_code)}">تفاصيل</button>${r.status==='active'?`<button class="btn small" data-action="cancel-request" data-id="${r.id}" ${pending?'disabled':''}>${pending?'طلب معلّق':'طلب إلغاء'}</button>${isManager()?`<button class="btn small" data-action="sell" data-id="${r.id}">اعتماد البيع</button>`:''}`:''}</div>`;}
function renderBookings(){const rows=DATA.reservations||[];$('#managementView').innerHTML=`<div class="management-card"><div class="management-heading"><h2>${rows.length} حجزاً ضمن الصلاحيات</h2><span>الحجز الملغى يبقى في السجل</span></div>${rows.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>الوحدة / رقم الحجز</th><th>العميل</th><th>الموظف</th><th>التاريخ</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b dir="ltr">${esc(r.unit_code)}</b><small>#${esc(r.id)}${r.legacy?' · مستورد':''}</small></td><td>${esc(r.client_name||'غير محدد')}<small dir="ltr">${esc(r.client_phone||'')}</small></td><td>${esc(r.salesperson_name||'غير مرتبط بحساب')}</td><td>${dateFmt(r.created_at||r.date)}</td><td>${r.status==='cancelled'?requestPill('cancelled'):pill(r.status==='sold'?'sold':'reserved')}</td><td>${rowActions(r)}</td></tr>`).join('')}</tbody></table></div>`:empty('لا توجد حجوزات','اختر وحدة متاحة ومعتمدة من سجل الوحدات لإنشاء حجز.')}</div>`;}
function renderRequests(){const own=state.section==='requests',rows=(DATA.requests||[]).filter(r=>!own||String(r.requested_by)===String(session.user.id)).sort((a,b)=>(a.status==='pending'?-1:1)-(b.status==='pending'?-1:1));$('#managementView').innerHTML=`<div class="management-card"><div class="management-heading"><h2>${rows.filter(r=>r.status==='pending').length} طلبات بانتظار الموافقة</h2><span>الوحدة تبقى محجوزة حتى الاعتماد</span></div>${rows.length?`<div class="approval-cards">${rows.map(r=>`<article class="approval-card"><div class="approval-top"><div><b dir="ltr">${esc(r.unit_code)}</b><span>الحجز #${esc(r.reservation_id)}</span></div>${requestPill(r.status)}</div><p class="approval-reason">${esc(r.reason)}</p><dl class="approval-meta"><div><dt>صاحب الطلب</dt><dd>${esc(r.requester_name||r.requested_by)}</dd></div><div><dt>وقت الطلب</dt><dd>${dateFmt(r.created_at)}</dd></div></dl>${r.decision_reason?`<p class="decision-note">قرار المدير: ${esc(r.decision_reason)}</p>`:''}<div class="approval-actions"><button class="text-btn" data-action="request-detail" data-id="${r.id}">عرض بيانات الحجز</button>${isManager()&&r.status==='pending'?`<button class="btn" data-action="decision" data-decision="reject" data-id="${r.id}">رفض</button><button class="btn solid" data-action="decision" data-decision="approve" data-id="${r.id}">موافقة على الإلغاء</button>`:''}</div></article>`).join('')}</div>`:empty('لا توجد طلبات','ستظهر طلبات الإلغاء ونتيجة مراجعتها هنا.')}</div>`;}
function renderUsers(){const users=managerData.users||[];$('#managementView').innerHTML=`<div class="permissions-intro"><div>${icon('shield')}<b>المدير</b><span>حجز، اعتماد إلغاء، إدارة الموظفين والبيانات</span></div><span class="hierarchy-arrow">${icon('chevron')}</span><div>${icon('user')}<b>موظف المبيعات</b><span>مشاهدة، حجز، وطلب إلغاء حجوزاته</span></div></div><div class="management-card"><div class="management-heading"><h2>حسابات المستخدمين</h2><span>تغيير كلمة المرور أو الصلاحيات ينهي جلسات المستخدم</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>المستخدم</th><th>الدور</th><th>الأبراج</th><th>الحالة</th><th>إدارة الحساب</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${esc(u.name)}</b><small dir="ltr">${esc(u.username)}</small></td><td>${u.role==='manager'?'مدير':'موظف مبيعات'}</td><td><span dir="ltr">${esc((u.towers||[]).join(' · '))}</span></td><td><span class="request-pill ${u.active?'approved':'rejected'}">${u.active?'فعال':'معطّل'}</span></td><td>${u.role==='employee'?`<div class="row-actions"><button class="btn small" data-action="edit-user" data-id="${u.id}">إدارة</button><button class="text-btn" data-action="link-legacy" data-id="${u.id}">ربط حجوزات سابقة</button></div>`:'حسابك'}</td></tr>`).join('')}</tbody></table></div></div>`;}
function reviewReasons(u){let rs=u.review_reasons;if(typeof rs==='string'){try{rs=JSON.parse(rs);}catch{rs=[rs];}}return Array.isArray(rs)?rs:[];}
function renderReviews(){const rows=managerData.units||[],issues=managerData.issues||[],summary=managerData.summary||DATA.import_summary||{};
 $('#managementView').innerHTML=`<div class="review-summary"><article><strong>${fmt(rows.length)}</strong><span>وحدة تحتاج اعتماداً</span></article><article><strong>${fmt(issues.length)}</strong><span>ملاحظات المصدر</span></article><article><strong>${fmt(DATA.units.length)}</strong><span>سجل وحدة في النطاق</span></article></div><div class="management-card"><div class="management-heading"><div><h2>مطابقة الوحدات</h2><p>راجع الحالة والمساحة ومصدرها قبل اعتماد الوحدة للحجز.</p></div><button class="btn" data-action="review-report">${icon('download')}تقرير المطابقة</button></div><div class="inline-search">${icon('search')}<input id="reviewSearch" type="search" aria-label="بحث في وحدات المراجعة" placeholder="ابحث بكود الوحدة أو نوع التعارض…"></div><div class="table-scroll review-table"><table class="data-table"><thead><tr><th>الوحدة</th><th>الحالة المسجلة</th><th>المساحة</th><th>سبب المراجعة</th><th>المصدر</th><th></th></tr></thead><tbody id="reviewRows">${reviewRows(rows)}</tbody></table></div>${!rows.length?empty('لا توجد وحدات معلّقة','كل الوحدات ضمن النطاق اجتازت المراجعة.'):''}</div><details class="management-card source-issues"><summary>ملاحظات الاستيراد والسجلات خارج المطابقة <span>${issues.length}</span></summary><div class="issues-list">${issues.slice(0,100).map(i=>`<article><b>${esc(i.code||i.kind||'ملاحظة المصدر')}</b><p>${esc(i.message||i.reason||'')}</p><small>${sourceLabel(i.source)}</small></article>`).join('')}</div>${issues.length>100?'<p class="helper-text">تظهر أول 100 ملاحظة. التقرير يتضمن القائمة كاملة.</p>':''}</details><div class="source-file-note">${icon('archive')}أصل ملف المبيعات محفوظ. البيانات التجريبية لا تدخل في هذه الإحصاءات.</div>`;
 $('#reviewSearch').oninput=e=>{const q=e.target.value.trim().toLowerCase();$('#reviewRows').innerHTML=reviewRows(rows.filter(u=>u.code.toLowerCase().includes(q)||reviewReasons(u).join(' ').toLowerCase().includes(q)));};
}
function sourceLabel(s){if(!s)return 'لا يوجد تطابق مباشر';return esc((s.sheet||'')+(s.row?' · صف '+s.row:''));}
function reviewRows(rows){return rows.map(u=>`<tr><td><b dir="ltr">${esc(u.code)}</b></td><td>${pill(u.status)}</td><td>${fmt(u.area)} ${u.area!=null?'م²':''}</td><td class="wrap-cell">${reviewReasons(u).slice(0,3).map(esc).join(' · ')}</td><td class="muted">${sourceLabel(u.source)}</td><td><button class="btn small" data-action="review-unit" data-code="${esc(u.code)}">مراجعة</button></td></tr>`).join('');}
function renderAudit(){const events=managerData.events||[];$('#managementView').innerHTML=`<div class="management-card"><div class="management-heading"><h2>آخر الإجراءات المسجّلة</h2><span>السجل للقراءة فقط</span></div>${events.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>العملية</th><th>المستخدم</th><th>السجل</th><th>الوقت</th><th>السبب</th><th></th></tr></thead><tbody>${events.map((e,i)=>`<tr><td><b>${actionLabel(e.action||e.operation||e.kind)}</b></td><td>${esc(e.actor_name||e.user_name||e.actor||e.user_id||'النظام')}</td><td>${bdi(e.unit_code||e.entity_id||e.target_id||'—')}</td><td>${dateFmt(e.created_at||e.timestamp)}</td><td class="wrap-cell">${esc(e.reason||'—')}</td><td><button class="text-btn" data-action="audit-detail" data-index="${i}">التغييرات</button></td></tr>`).join('')}</tbody></table></div>`:empty('لا توجد إجراءات بعد','ستظهر الحجوزات والموافقات وتعديلات البيانات هنا.')}</div>`;}
function actionLabel(a){return ({manager_setup:'إنشاء حساب المدير',employee_created:'إضافة موظف',employee_updated:'تعديل موظف',reservation_created:'إنشاء حجز',cancellation_requested:'طلب إلغاء',cancellation_approved:'اعتماد الإلغاء',cancellation_rejected:'رفض الإلغاء',cancellation_stale:'إبطال طلب قديم',sale_approved:'اعتماد البيع',unit_reviewed:'اعتماد بيانات وحدة',unit_updated:'تعديل بيانات وحدة',initial_import:'دمج المصدر الأول',legacy_owner_linked:'ربط سجل موظف',legacy_reservation_confirmed:'تأكيد حجز مستورد',setup:'إنشاء المدير',login:'تسجيل دخول',logout:'تسجيل خروج',create_user:'إضافة موظف',user_create:'إضافة موظف',user_update:'تعديل موظف',update_user:'تعديل موظف',reservation_create:'حجز وحدة',create_reservation:'حجز وحدة',cancel_request:'طلب إلغاء',cancellation_request:'طلب إلغاء',cancellation_approve:'اعتماد الإلغاء',cancellation_reject:'رفض الإلغاء',sell:'اعتماد البيع',reservation_sell:'اعتماد البيع',unit_review:'اعتماد بيانات وحدة',unit_update:'تعديل بيانات وحدة',import_commit:'استيراد بيانات',link_legacy:'ربط سجلات موظف'})[a]||esc(a||'إجراء');}
function renderHistory(){const events=managerData.events||[];$('#managementView').innerHTML=`<div class="management-card"><div class="management-heading"><h2>حركات ملف المبيعات</h2><span>هذه حركات تاريخية؛ لا تعني وحدها الحالة الحالية</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>نوع الحركة</th><th>الوحدة / الوحدات</th><th>العميل</th><th>التاريخ</th><th>المصدر</th><th></th></tr></thead><tbody>${events.map((e,i)=>`<tr><td>${({reservation:'حجز',purchase:'شراء',cancellation:'إلغاء',transfer:'تحويل'})[e.kind]||esc(e.kind)}</td><td class="wrap-cell" dir="ltr">${esc((e.unit_codes||[]).join(', '))}</td><td>${esc(e.client_name||'غير محدد')}</td><td>${dateFmt(e.date)}</td><td>${sourceLabel(e.source)}</td><td><button class="text-btn" data-action="history-detail" data-index="${i}">السجل الأصلي</button></td></tr>`).join('')}</tbody></table></div></div>`;}
function openDialog(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;if(!$('#appDialog').open)$('#appDialog').showModal();$('#closeDialog').focus();}
function closeDialog(){$('#appDialog').close();}
function formError(form,msg){let el=form.querySelector('.form-error');if(!el){el=document.createElement('p');el.className='form-error';el.setAttribute('role','alert');form.prepend(el);}el.textContent=msg;el.hidden=false;}
async function submitForm(form,fn){const btn=form.querySelector('[type=submit]');if(btn)btn.disabled=true;form.querySelector('.form-error')?.setAttribute('hidden','');try{await fn();}catch(e){formError(form,e.message);}finally{if(btn)btn.disabled=false;}}
const buttons=(label='حفظ')=>`<div class="dialog-actions"><button type="button" class="btn" data-action="close-dialog">رجوع</button><button type="submit" class="btn solid">${label}</button></div>`;
const labelInput=(label,name,value='',type='text',attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;
function bookingForm(code){const u=DATA.units.find(u=>u.code===code);if(!u)return;const key=requestKey();openDialog('حجز الوحدة '+code,`<form id="bookingForm" class="app-form"><div class="form-unit-summary"><b dir="ltr">${code}</b><span>${fmt(u.area)} م² · ${u.tower}</span></div>${labelInput('اسم العميل','client_name','','text','required maxlength="200" autocomplete="name"')}${labelInput('رقم الهاتف','client_phone','','tel','required maxlength="40" dir="ltr" autocomplete="tel"')}<label>ملاحظات<textarea name="notes" maxlength="1500" rows="3"></textarea></label><p class="helper-text">سيُسجَّل الحجز باسم ${esc(session.user.name)}. لا يتأكد الحجز إلا بعد نجاح الحفظ في الخادم.</p>${buttons('تأكيد الحجز')}</form>`);$('#bookingForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const body=Object.fromEntries(new FormData(e.target));const result=await api('/api/reservations',{method:'POST',body:{...body,unit_code:code,idempotency_key:key}});closeDialog();await refresh();await selectUnit(code);toast('تم تسجيل الحجز بنجاح');});};}
function cancellationForm(id){const r=DATA.reservations.find(r=>String(r.id)===String(id));if(!r)return;const key=requestKey();openDialog('طلب إلغاء الحجز',`<form id="cancelForm" class="app-form"><div class="form-unit-summary"><b dir="ltr">${esc(r.unit_code)}</b><span>${esc(r.client_name||'')}</span></div><label>سبب طلب الإلغاء<textarea name="reason" rows="4" required minlength="3" maxlength="1500" placeholder="اكتب السبب الذي سيراجعه المدير…"></textarea></label><p class="helper-text">تبقى الوحدة محجوزة حتى موافقة المدير. هذا الطلب لا ينفّذ أي استرداد مالي.</p>${buttons('إرسال طلب الإلغاء')}</form>`);$('#cancelForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{await api('/api/reservations/'+encodeURIComponent(id)+'/cancel-request',{method:'POST',body:{reason:new FormData(e.target).get('reason'),idempotency_key:key}});closeDialog();closeDetail(false);await refresh();toast('أُرسل الطلب إلى المدير');});};}
function decisionForm(id,decision){const r=DATA.requests.find(r=>String(r.id)===String(id));if(!r)return;const booking=DATA.reservations.find(b=>String(b.id)===String(r.reservation_id));openDialog(decision==='approve'?'اعتماد إلغاء الحجز':'رفض طلب الإلغاء',`<form id="decisionForm" class="app-form"><div class="form-unit-summary"><b dir="ltr">${esc(r.unit_code)}</b><span>${esc(booking?.client_name||'الحجز #'+r.reservation_id)}</span></div><p class="source-callout">سبب الطلب: ${esc(r.reason)}</p><label>${decision==='reject'?'سبب الرفض':'ملاحظة الاعتماد'}<textarea name="reason" rows="3" ${decision==='reject'?'required minlength="3"':''} maxlength="1500"></textarea></label><p class="helper-text">${decision==='approve'?'سيُغلق الحجز إذا ظل فعالاً ولم يتغيّر، وتعود الوحدة للإتاحة فقط إذا كانت بياناتها معتمدة.':'يبقى الحجز فعالاً ويظهر سبب الرفض للموظف.'}</p>${buttons(decision==='approve'?'اعتماد الإلغاء':'تأكيد الرفض')}</form>`);$('#decisionForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const result=await api('/api/cancellations/'+encodeURIComponent(id)+'/decision',{method:'POST',body:{decision,reason:new FormData(e.target).get('reason')}});closeDialog();await refresh();toast(result.request?.status==='stale'?(result.message||'تغيّر الحجز؛ لم يُنفّذ الإلغاء.'):(decision==='approve'?'تم اعتماد الإلغاء':'تم رفض الطلب'));});};}
function sellForm(id){const r=DATA.reservations.find(r=>String(r.id)===String(id));if(!r)return;openDialog('اعتماد بيع الوحدة',`<form id="sellForm" class="app-form"><div class="form-unit-summary"><b dir="ltr">${esc(r.unit_code)}</b><span>${esc(r.client_name)}</span></div><label>مرجع أو سبب اعتماد البيع<textarea name="reason" required minlength="3" maxlength="1500" rows="3" placeholder="مثال: رقم العقد وتاريخ الاعتماد…"></textarea></label><p class="helper-text">تحوَّل الحالة إلى مباع، ويُمنع تنفيذ طلب إلغاء حجز سابق على هذا البيع.</p>${buttons('اعتماد البيع')}</form>`);$('#sellForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{await api('/api/reservations/'+encodeURIComponent(id)+'/sell',{method:'POST',body:{reason:new FormData(e.target).get('reason')}});closeDialog();closeDetail(false);await refresh();toast('تم اعتماد البيع');});};}
async function reviewForm(code){
 try{const d=await api('/api/units/'+encodeURIComponent(code)),u=d.unit,r=d.reservation;const reasons=reviewReasons(u);openDialog('مراجعة بيانات '+code,`<form id="reviewForm" class="app-form"><div class="form-unit-summary"><b dir="ltr">${esc(code)}</b>${pill(u.status,u.review_required)}</div><div class="source-callout"><b>المصدر: ${sourceLabel(u.source)}</b>${reasons.length?`<ul>${reasons.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p>لا توجد ملاحظات مراجعة معلّقة.</p>'}</div><div class="form-grid"><label>الحالة المعتمدة<select name="status" required>${Object.entries(STATUSES).map(([k,v])=>`<option value="${k==='unknown'?'':k}" ${k===u.status?'selected':''} ${k==='unknown'?'disabled':''}>${k==='unknown'?'اختر الحالة بعد المراجعة':v.ar}</option>`).join('')}</select></label>${labelInput('المساحة المعتمدة م²','area',u.area,'number','min="1" max="5000" step="0.01" required')}<label>الإطلالة<select name="view" required><option value="">اختر</option><option value="ext" ${u.view==='ext'?'selected':''}>خارجية</option><option value="int" ${u.view==='int'?'selected':''}>داخلية</option></select></label>${labelInput('سعر المتر — د.ع','price_per_m2',u.price_per_m2,'number','min="0" step="1"')}<label>التخصيص<select name="allocation"><option value="individual" ${u.allocation==='individual'?'selected':''}>وحدة مفردة</option><option value="bulk" ${u.allocation==='bulk'?'selected':''}>شقق الجملة</option><option value="unknown" ${u.allocation==='unknown'?'selected':''}>غير محسوم</option></select></label></div>${labelInput('اسم العميل إن كانت محجوزة أو مباعة','client_name',r?.client_name||u.client_name||'','text','maxlength="200"')}${labelInput('هاتف العميل إن توفر','client_phone',r?.client_phone||u.client_phone||'','tel','maxlength="40" dir="ltr"')}${labelInput('موظف المبيعات في السجل','salesperson_name',r?.salesperson_name||u.salesperson_name||'','text','maxlength="100"')}<label>سبب الاعتماد ومرجعه<textarea name="reason" required minlength="5" maxlength="1500" rows="3" placeholder="اذكر ما راجعته ومرجع الحالة أو المساحة الصحيحة…"></textarea></label><p class="helper-text">الحجز الفعال لا يُلغى من هذه الشاشة؛ استخدم مسار طلب الإلغاء والموافقة. إذا لم تُحسم البيانات، اترك الوحدة للمراجعة دون اعتماد.</p><details class="raw-record"><summary>عرض بيانات المصدر الأصلية</summary><pre>${esc(JSON.stringify({source:u.source,source_records:u.source_records,raw:u.raw},null,2))}</pre></details>${buttons('اعتماد البيانات')}</form>`);
 $('#reviewForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const f=Object.fromEntries(new FormData(e.target));f.area=Number(f.area);f.price_per_m2=f.price_per_m2===''?null:Number(f.price_per_m2);await api('/api/units/'+encodeURIComponent(code)+'/review',{method:'POST',body:f});closeDialog();await refresh();if(state.selected===code)await selectUnit(code);toast('تم تسجيل اعتماد بيانات الوحدة');});};
 }catch(e){toast(e.message);}
}
async function priceForm(code){const d=await api('/api/units/'+encodeURIComponent(code)),u=d.unit;openDialog('تعديل سعر المتر',`<form id="priceForm" class="app-form"><div class="form-unit-summary"><b>${bdi(code)}</b><span>القيمة الحالية: ${fmt(u.price_per_m2)} د.ع / م²</span></div>${labelInput('سعر المتر الجديد — د.ع','price_per_m2',u.price_per_m2,'number','min="1" step="1" required')}<label>سبب التعديل<textarea name="reason" rows="3" required minlength="3" maxlength="1000"></textarea></label>${buttons('حفظ السعر')}</form>`);$('#priceForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const f=Object.fromEntries(new FormData(e.target));f.price_per_m2=Number(f.price_per_m2);await api('/api/units/'+encodeURIComponent(code)+'/update',{method:'POST',body:f});closeDialog();await refresh();await selectUnit(code);toast('تم تعديل سعر المتر');});};}
function towersCheckboxes(selected){return `<fieldset class="tower-permissions"><legend>الأبراج المسموح بها</legend>${allowedTowers().map(t=>`<label><input type="checkbox" name="towers" value="${t}" ${selected.includes(t)?'checked':''}>${t}</label>`).join('')}</fieldset>`;}
function userForm(id){const u=(managerData.users||[]).find(u=>String(u.id)===String(id)),editing=!!u;openDialog(editing?'إدارة حساب الموظف':'إضافة موظف مبيعات',`<form id="userForm" class="app-form">${labelInput('الاسم الكامل','name',u?.name||'','text','required maxlength="100"')}${editing?`<p class="helper-text">اسم المستخدم: ${bdi(u.username)}</p>`:labelInput('اسم المستخدم','username','','text','required minlength="3" maxlength="60" dir="ltr" autocomplete="off"')}${labelInput(editing?'كلمة مرور جديدة — اختياري':'كلمة المرور','password','','password',`${editing?'':'required'} minlength="12" maxlength="200" autocomplete="new-password" dir="ltr"`)}${towersCheckboxes(u?.towers||allowedTowers())}${editing?`<label class="checkbox-label"><input type="checkbox" name="active" ${u.active?'checked':''}>الحساب فعال</label>`:''}<p class="helper-text">صلاحية الموظف: مشاهدة الوحدات، إنشاء حجز، وطلب إلغاء حجوزاته. اعتماد الإلغاء وإدارة البيانات للمدير فقط.</p>${buttons(editing?'حفظ التغييرات':'إنشاء الحساب')}</form>`);$('#userForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{const f=new FormData(e.target),body=Object.fromEntries(f);body.towers=f.getAll('towers');if(!body.towers.length)throw new Error('اختر برجاً واحداً على الأقل.');if(editing){body.active=f.has('active');if(!body.password)delete body.password;await api('/api/users/'+encodeURIComponent(id),{method:'PATCH',body});}else{body.role='employee';await api('/api/users',{method:'POST',body});}closeDialog();await refresh();toast(editing?'تم تحديث الحساب وإنهاء جلساته السابقة':'تم إنشاء حساب الموظف');});};}
function linkLegacyForm(id){const u=(managerData.users||[]).find(x=>String(x.id)===String(id)),names=managerData.legacy_salespeople||[];if(!u)return;openDialog('ربط الحجوزات السابقة',`<form id="legacyForm" class="app-form"><p>سيُربط السجل التاريخي المؤكد بحساب <b>${esc(u.name)}</b>، ضمن الأبراج المسموح بها فقط.</p><label>اسم الموظف كما ورد في المصدر<select name="salesperson_name" required><option value="">اختر الاسم بعد المطابقة</option>${names.map(n=>{const name=typeof n==='string'?n:n.name||n.salesperson_name;return `<option value="${esc(name)}">${esc(name)}</option>`;}).join('')}</select></label><label>سبب أو مرجع المطابقة<textarea name="reason" required minlength="5" maxlength="1000" rows="3"></textarea></label><p class="helper-text">المطابقة بالاسم الأصلي المحدد. لا تُدمج أسماء متشابهة تلقائياً.</p>${buttons('اعتماد الربط')}</form>`);$('#legacyForm').onsubmit=e=>{e.preventDefault();submitForm(e.target,async()=>{await api('/api/users/'+encodeURIComponent(id)+'/link-legacy',{method:'POST',body:Object.fromEntries(new FormData(e.target))});closeDialog();await refresh();toast('تم ربط السجلات المطابقة');});};}
async function uploadPreview(file){if(!file)return;openDialog('مراجعة الاستيراد','<div class="loading-state">جارٍ تحليل الملف ومقارنته بالسجل الحالي…</div>');try{lastImport=await api('/api/import/preview',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Filename':encodeURIComponent(file.name)},body:file});openDialog('مراجعة ملف الاستيراد',`<p>تم فحص الملف. التغييرات التي تتعارض مع حجوزات أو اعتمادات أحدث ستبقى للمراجعة.</p><div class="import-stats">${summaryHTML(lastImport.summary)}</div><details class="raw-record"><summary>تفاصيل التغييرات والملاحظات</summary><pre>${esc(JSON.stringify({changes:lastImport.changes,issues:lastImport.issues},null,2))}</pre></details><p class="helper-text">تُحفظ نسخة قبل الاعتماد. إعادة استيراد الملف نفسه لا تكرر السجلات.</p><div class="dialog-actions"><button class="btn" data-action="close-dialog">رجوع</button><button class="btn solid" data-action="commit-import">اعتماد الاستيراد الآمن</button></div>`);}catch(e){openDialog('لم يُستورد الملف',`<p class="form-error">${esc(e.message)}</p><p>السجلات الحالية محفوظة دون تغيير.</p>`);}}
function summaryHTML(summary){if(!summary)return '';const labels={valid_source_inventory_rows:'وحدات المصدر',event_count:'الحركات التاريخية',issue_count:'ملاحظات المصدر',out_of_scope_count:'سجلات خارج النطاق',unresolved_records:'سجلات غير مطابقة',service_rows_excluded:'صفوف الخدمات المستبعدة',missing_baseline_codes:'أكواد تحتاج مطابقة',duplicate_inventory_rows:'صفوف وحدات مكررة',units:'الوحدات',total_units:'الوحدات',unit_count:'الوحدات',review_required:'للمراجعة',review_count:'للمراجعة',events:'الحركات',new_units:'وحدات جديدة',unchanged:'دون تغيير',conflicts:'تعارضات',out_of_scope:'خارج النطاق',duplicates:'مكررات',already_imported:'مستورد سابقاً',inserted:'سجلات جديدة',skipped:'سجلات محفوظة',inserted_units:'وحدات مضافة',inserted_events:'حركات مضافة',protected_units:'وحدات محفوظة للمراجعة',unchanged_units:'وحدات دون تغيير'};return Object.entries(summary).filter(([k,v])=>typeof v==='number'||typeof v==='boolean').map(([k,v])=>`<div><b>${typeof v==='boolean'?(v?'نعم':'لا'):fmt(v)}</b><span>${labels[k]||esc(k)}</span></div>`).join('');}
// بوابة الحماية: رمز يُطلب في كل مرة قبل الاستيراد أو التصدير.
const DATA_KEY='523078';
const normalizeDigits=v=>String(v??'').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).trim();
function dataGate(purpose){
 const isImport=purpose==='import';
 openDialog(isImport?'استيراد البيانات':'تصدير البيانات',`<div class="gate"><div class="gate-emblem">${icon('lock')}</div><p class="gate-intro">${isImport?'الاستيراد يعدّل سجل الوحدات.':'التصدير يُخرج بيانات النظام حسب صلاحيات حسابك.'} أدخل رمز الحماية للمتابعة.</p><form id="gateForm" class="gate-form" autocomplete="off"><label>رمز الحماية<input id="gateKey" type="password" inputmode="numeric" autocomplete="off" dir="ltr" maxlength="24" required></label><p class="form-error" id="gateError" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="btn" data-action="close-dialog">إلغاء</button><button type="submit" class="btn solid">${icon('shield')}تحقّق ومتابعة</button></div></form></div>`);
 const form=$('#gateForm');
 setTimeout(()=>$('#gateKey')?.focus(),40);
 form.onsubmit=e=>{
  e.preventDefault();
  if(normalizeDigits($('#gateKey').value)!==DATA_KEY){
   const err=$('#gateError');err.textContent='رمز الحماية غير صحيح.';err.hidden=false;
   const box=$('#gateKey');box.value='';box.focus();
   box.classList.remove('is-wrong');void box.offsetWidth;box.classList.add('is-wrong');
   return;
  }
  if(isImport)return importPicker();
  closeDialog();exportDialog();
 };
}
function importPicker(){openDialog('تم التحقق — اختر الملف',`<p>اختر ملف Excel بصيغة XLSX. سيُعرض ملخّص التغييرات للمراجعة قبل الاعتماد، ولن يُعدَّل أي سجل قبل موافقتك.</p><div class="dialog-actions"><button class="btn" data-action="close-dialog">إلغاء</button><button class="btn solid" data-action="pick-file">${icon('upload')}اختيار ملف XLSX</button></div>`);}
function exportDialog(){const query=new URLSearchParams({format:'csv',scope:'results',tower:state.tower,status:state.status,q:state.q,view:state.view,area:state.area,band:state.band,review:state.review});openDialog('تصدير البيانات',`<p>التصدير يتبع صلاحيات حسابك. تحتوي النسخة الكاملة على البيانات المسموح لك بمشاهدتها.</p><div class="export-options"><a class="btn" href="/api/export?${query.toString()}">${icon('sheet')}نتائج الفلتر CSV</a><a class="btn" href="/api/export?format=csv&scope=all">${icon('download')}النطاق كاملاً CSV</a><a class="btn" href="/api/export?format=json&scope=all">${icon('code')}بيانات JSON</a><a class="btn" href="/api/backup">${icon('archive')}نسخة بيانات احتياطية</a></div>`);}
function downloadJSON(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function action(name,el){
 if(name==='close-dialog')return closeDialog();if(name==='close-detail')return closeDetail();
 if(name==='notification-open'){closeDialog();return route(el.dataset.sectionTarget);}
 if(name==='clear'){state.q='';state.status=state.view=state.area=state.band=state.review='all';state.page=1;$('#search').value='';['viewFilter','areaFilter','bandFilter','reviewFilter'].forEach(id=>$('#'+id).value='all');return renderUnits();}
 if(name==='refresh'){await refresh();toast('تم تحديث البيانات');return;}
 if(name==='book')return bookingForm(el.dataset.code);
 if(name==='cancel-request')return cancellationForm(el.dataset.id);
 if(name==='decision')return decisionForm(el.dataset.id,el.dataset.decision);
 if(name==='sell')return sellForm(el.dataset.id);
 if(name==='review-unit')return reviewForm(el.dataset.code);
 if(name==='edit-price')return priceForm(el.dataset.code);
 if(name==='new-user')return userForm();
 if(name==='edit-user')return userForm(el.dataset.id);
 if(name==='link-legacy')return linkLegacyForm(el.dataset.id);
 if(name==='upload')return dataGate('import');
 if(name==='pick-file'){closeDialog();return $('#importFile').click();}
 if(name==='commit-import'){if(!lastImport?.preview_id)throw new Error('انتهت معاينة الاستيراد. أعد اختيار الملف.');el.disabled=true;try{const r=await api('/api/import/commit',{method:'POST',body:{preview_id:lastImport.preview_id}});closeDialog();lastImport=null;await refresh();toast('اكتمل الاستيراد مع حفظ التعارضات للمراجعة');}finally{el.disabled=false;}return;}
 if(name==='review-report')return downloadJSON('golden-city-import-review.json',{generated_at:new Date().toISOString(),...managerData});
 if(name==='audit-detail'||name==='history-detail'){const e=managerData.events?.[Number(el.dataset.index)];return openDialog(name==='audit-detail'?'تفاصيل الإجراء':'بيانات السجل الأصلي',`<pre>${esc(JSON.stringify(e,null,2))}</pre>`);}
 if(name==='request-detail'){const r=DATA.requests.find(r=>String(r.id)===String(el.dataset.id)),b=DATA.reservations.find(b=>String(b.id)===String(r?.reservation_id));return openDialog('الحجز المرتبط بالطلب',b?`<dl class="detail-extra"><dt>الوحدة</dt><dd>${bdi(b.unit_code)}</dd><dt>العميل</dt><dd>${esc(b.client_name)}</dd><dt>الهاتف</dt><dd>${bdi(b.client_phone||'غير محدد')}</dd><dt>الموظف</dt><dd>${esc(b.salesperson_name||'سجل مستورد')}</dd><dt>الحالة</dt><dd>${esc(b.status==='active'?'حجز فعال':b.status==='sold'?'مباع':'ملغى')}</dd></dl>`:'<p>لا توجد بيانات إضافية متاحة لهذا الحساب.</p>');}
 if(name==='export')return dataGate('export');
 if(name==='print')return window.print();
 if(name==='ops-floor')return setOpsFloor(Number(el.dataset.floor));
 if(name==='ops-view'){if(!opsViewer)return;opsViewer.view(el.dataset.view);document.querySelectorAll('[data-action="ops-view"]').forEach(b=>b.classList.toggle('is-on',b===el));return;}
 if(name==='ops-fullscreen'){const root=document.documentElement;if(document.fullscreenElement)return document.exitFullscreen();try{await root.requestFullscreen();}catch{toast('المتصفح منع وضع ملء الشاشة.');}return;}
}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-action]');if(btn){e.preventDefault();try{await action(btn.dataset.action,btn);}catch(err){toast(err.message);}return;}
 const unit=e.target.closest('[data-unit]');if(unit&&!unit.disabled){if(state.section!=='units'){route('units');state.mode='list';}return selectUnit(unit.dataset.unit);}
 const nav=e.target.closest('[data-section]');if(nav)return route(nav.dataset.section);
 const tower=e.target.closest('[data-tower]');if(tower&&state.section==='ops'){mountOpsViewer(tower.dataset.tower);return;}
 if(tower){state.tower=tower.dataset.tower;state.page=1;state.selected=null;detail=null;state.mode=mobile.matches?'list':'visual';return renderUnits();}
 const st=e.target.closest('[data-status]');if(st){state.status=state.status===st.dataset.status?'all':st.dataset.status;state.page=1;state.selected=null;return renderUnits();}
 const mode=e.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;state.page=1;return renderUnits();}
 const page=e.target.closest('[data-page]');if(page&&!page.disabled){state.page+=page.dataset.page==='next'?1:-1;renderUnits();$('.list-wrap')?.scrollTo({top:0});}
});
$('#search').oninput=e=>{state.q=e.target.value.trim().toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));state.page=1;state.selected=null;if(state.q)state.mode='list';renderUnits();};
$('#moreFilters').onclick=()=>{state.advanced=!state.advanced;renderUnits();};
[['viewFilter','view'],['areaFilter','area'],['bandFilter','band'],['reviewFilter','review']].forEach(([id,key])=>$('#'+id).onchange=e=>{state[key]=e.target.value;state.page=1;state.selected=null;renderUnits();});
$('#floorJump').onchange=e=>{const row=$('#floor-'+e.target.value),scroll=$('.board-scroll');if(row&&scroll)scroll.scrollTo({top:row.offsetTop-$('.board-head').offsetHeight,behavior:'smooth'});};
$('#closeDialog').onclick=closeDialog;$('#detailBackdrop').onclick=()=>closeDetail();
$('#notificationButton').onclick=showNotifications;
$('#logoutButton').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:{}});}catch{}lockSession();$('#authError').hidden=true;session=await api('/api/session');renderAuth();};
$('#importFile').onchange=e=>{uploadPreview(e.target.files[0]);e.target.value='';};
function handleRoute(){if(!session.user)return;readRoute();state.selected=null;detail=null;renderApp();}
addEventListener('hashchange',handleRoute);addEventListener('popstate',handleRoute);
addEventListener('online',()=>{$('#connectionBanner').hidden=true;});addEventListener('offline',()=>{$('#connectionBanner').hidden=false;});
addEventListener('golden-city:open-unit',e=>{if(!e.detail?.code)return;ai?.close();route('units');state.mode='list';selectUnit(e.detail.code);});
addEventListener('keydown',e=>{
 if($('#appDialog').open)return;
 if(state.selected&&drawer.matches&&e.key==='Tab'){const els=[...$('#detailPanel').querySelectorAll('button:not(:disabled),a,input,select')].filter(e=>e.getClientRects().length),first=els[0],last=els.at(-1);if(!$('#detailPanel').contains(document.activeElement)){e.preventDefault();first?.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
 if(e.key==='Escape'&&state.selected){closeDetail();return;}
 if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
 if(e.key==='/'&&state.section==='units'){e.preventDefault();$('#search').focus();}
});
drawer.addEventListener('change',()=>{renderDetail();if(state.selected&&drawer.matches)$('#closeDetail')?.focus({preventScroll:true});});
mobile.addEventListener('change',e=>{if(e.matches)state.mode='list';if(session.user&&state.section==='units')renderUnits();});
addEventListener('beforeprint',()=>{if(state.section==='units'&&state.mode==='list'){const body=$('.unit-table tbody');if(body)body.innerHTML=listRows(sortUnits(results()));}});
addEventListener('afterprint',()=>{if(state.section==='units')renderUnits();});
hydrateIcons();init();
