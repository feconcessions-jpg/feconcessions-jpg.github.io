/* Fiesta P&L - reads data.json (local) or the PIN-protected Apps Script backend (config.js API_URL). */
(function(){
const $=s=>document.querySelector(s), CFG=window.PNL_CONFIG||{};
const WD=['Thu','Fri','Sat','Sun','Mon','Tue','Wed']; // fair day d -> WD[d%7]; Day 1 = Friday
const money=v=>(v<0?'-':'')+'$'+Math.abs(Math.round(v)).toLocaleString();
const num=v=>Math.round(v).toLocaleString();
const pct=v=>v==null||!isFinite(v)?'':(v>=0?'+':'')+(v*100).toFixed(1)+'%';
const cls=v=>v==null?'':v>=0?'up':'dn';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let D, S={unit:'ALL',year:2026,cmp:2025,p:'year',day:1,week:1,wk:'wknd',from:1,to:24,alloc:false};

async function load(){
  if(CFG.API_URL){
    const pin=localStorage.getItem('pnlpin'); if(!pin){showPin();return;}
    $('#pinbox').hidden=true; $('#loading').hidden=false;
    try{const r=await fetch(CFG.API_URL+'?action=data&pin='+encodeURIComponent(pin));const j=await r.json();
      $('#loading').hidden=true;
      if(!j.ok){localStorage.removeItem('pnlpin');showPin(j.error==='bad_pin'?'That PIN didn\u2019t work. Please check it and try again.':'Something went wrong ('+j.error+'). Please try again.');return;} D=j.data;}
    catch(e){$('#loading').hidden=true;showPin('Could not reach the P&L data. Check your connection and try again.',true);return;}
  } else { D=await (await fetch('data.json?v='+Date.now())).json(); }
  init();
}
function showPin(msg,keep){$('#app').hidden=true;$('#lock').hidden=true;$('#pinbox').hidden=false;$('#pinerr').textContent=msg||'';
  if(!keep)$('#pin').value=''; $('#pin').focus();
  const go=()=>{const v=$('#pin').value.trim();if(!v){$('#pinerr').textContent='Enter your PIN.';return;}localStorage.setItem('pnlpin',v);load();};
  $('#pinok').onclick=go; $('#pin').onkeydown=e=>{if(e.key==='Enter')go();};}
function lock(){localStorage.removeItem('pnlpin');D=null;['#kpis','#pnl','#yoy','#years','#byunit','#daily','#asof'].forEach(s=>$(s).innerHTML='');$('#sheet').hidden=true;showPin('Locked. Enter the PIN to open again.');}
function init(){
  D.sales.forEach(s=>{s.fair_day=+s.fair_day;s.year=+s.year;s.coupons=+s.coupons;s.net=+s.net;s.fair_commission=+s.fair_commission;});
  D.expenses.forEach(e=>{e.amount=+e.amount;e.fd=fdOf(e.date,2026);});
  (D.labor||[]).forEach(l=>{l.cost=+l.cost;l.hours=+l.hours;l.fd=fdOf(l.date,2026);});
  D.uname=Object.fromEntries(D.units.map(u=>[u.unit,u.name]));
  const yrs=[...new Set(D.sales.map(s=>s.year))].sort();
  $('#year').innerHTML=yrs.slice().reverse().map(y=>`<option>${y}</option>`).join('');
  $('#cmp').innerHTML='<option value="0">None</option>'+yrs.slice().reverse().map(y=>`<option>${y}</option>`).join('');
  $('#units').innerHTML=[['ALL','All units'],...D.units.map(u=>[u.unit,u.name+' '+u.unit])].map(([k,n])=>`<button data-u="${k}">${esc(n)}</button>`).join('');
  $('#units').onclick=e=>{const b=e.target.closest('button');if(b){S.unit=b.dataset.u;render();}};
  $('#ptype').onclick=e=>{const b=e.target.closest('button');if(b){S.p=b.dataset.p;render();}};
  $('#year').onchange=e=>{S.year=+e.target.value;S.cmp=S.year-1;render();};
  $('#cmp').onchange=e=>{S.cmp=+e.target.value;render();};
  $('#alloc').onchange=e=>{S.alloc=e.target.checked;render();};
  $('#close').onclick=()=>$('#sheet').hidden=true; $('#sheet').onclick=e=>{if(e.target.id==='sheet')$('#sheet').hidden=true;};
  const last=maxDay(2026); S.day=last; S.to=last;
  $('#asof').innerHTML=`2026 through Day ${last}<br>data built ${esc(D.built)}`;
  $('#app').hidden=false; $('#lock').hidden=false; $('#lock').onclick=lock; render();
}
function fdOf(date,y){if(!date)return null;const o=new Date(D.open_dates[y]+'T12:00'),d=new Date(String(date).slice(0,10)+'T12:00');return Math.round((d-o)/864e5)+1;}
function dateOf(y,fd){const o=new Date(D.open_dates[y]+'T12:00');o.setDate(o.getDate()+fd-1);return o;}
const fmtD=d=>(d.getMonth()+1)+'/'+d.getDate();
function maxDay(y){return Math.max(0,...D.sales.filter(s=>s.year==y).map(s=>s.fair_day));}
function periodDays(){
  const all=[...Array(24)].map((_,i)=>i+1);
  switch(S.p){case'day':return[S.day];case'week':return all.filter(d=>Math.ceil(d/7)==S.week);
    case'wk':return all.filter(d=>[1,2,3].includes(d%7)===(S.wk=='wknd'));case'custom':return all.filter(d=>d>=S.from&&d<=S.to);default:return all;}
}
function plabel(days){const w={year:'Full fair',day:'Fair day '+S.day+' ('+WD[S.day%7]+')',week:'Fair week '+S.week+(S.week==4?' (Days 22-24)':' (Days '+(S.week*7-6)+'-'+S.week*7+')'),
  wk:S.wk=='wknd'?'Weekends (Fri-Sun)':'Weekdays (Mon-Thu)',custom:'Days '+S.from+'-'+S.to}[S.p];
  return w+' · '+days.length+' fair day'+(days.length>1?'s':'');}
function sales(y,days,unit){const set=new Set(days);return D.sales.filter(s=>s.year==y&&set.has(s.fair_day)&&(unit=='ALL'||s.unit==unit));}
const sum=(a,k)=>a.reduce((t,x)=>t+(+x[k]||0),0);
function expInPeriod(days){ // full year: every 2026 invoice (incl. pre-fair). Sub-period: invoices dated inside those fair days.
  if(S.year!=2026)return[]; if(S.p=='year')return D.expenses; const set=new Set(days); return D.expenses.filter(e=>set.has(e.fd));}
function pnl(unit,days){
  const sl=sales(S.year,days,unit), all=sales(S.year,days,'ALL');
  const gross=sum(sl,'coupons'),comm=sum(sl,'fair_commission'),net=sum(sl,'net'),allNet=sum(all,'net');
  const ex=expInPeriod(days), direct=ex.filter(e=>unit=='ALL'?e.unit_or_shared!='SHARED':e.unit_or_shared==unit);
  const shared=ex.filter(e=>e.unit_or_shared=='SHARED'), sharedAmt=sum(shared,'amount');
  const share=unit=='ALL'?1:(allNet?net/allNet:0);
  const sharedApplied=unit=='ALL'?sharedAmt:(S.alloc?sharedAmt*share:0);
  const set=new Set(days); const lab=S.year==2026?(D.labor||[]).filter(l=>(S.p=='year'||set.has(l.fd))&&(unit=='ALL'||l.unit==unit)):[];
  const labor=sum(lab,'cost'); const cats={}; direct.forEach(e=>{cats[e.category]=(cats[e.category]||0)+e.amount;});
  const profit=net-sum(direct,'amount')-sharedApplied-labor;
  return{sl,gross,comm,net,direct,cats,shared,sharedAmt,share,sharedApplied,labor,lab,profit,margin:net?profit/net:null,
    hasCosts:S.year==2026,datesInData:[...new Set(sl.map(s=>s.fair_day))]};
}
function render(){
  document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',b.dataset.u==S.unit));
  document.querySelectorAll('#ptype button').forEach(b=>b.classList.toggle('on',b.dataset.p==S.p));
  $('#year').value=S.year;$('#cmp').value=S.cmp;$('#alloc').checked=S.alloc;
  const opt=(a,v)=>a.map(([k,n])=>`<option value="${k}"${k==v?' selected':''}>${n}</option>`).join('');
  const dOpts=[...Array(24)].map((_,i)=>[i+1,'Day '+(i+1)+' '+WD[(i+1)%7]+' '+fmtD(dateOf(S.year,i+1))]);
  $('#pextra').innerHTML={day:`<label>Fair day<select id="xd">${opt(dOpts,S.day)}</select></label>`,
    week:`<label>Fair week<select id="xw">${opt([[1,'Week 1 (Days 1-7)'],[2,'Week 2 (Days 8-14)'],[3,'Week 3 (Days 15-21)'],[4,'Week 4 (Days 22-24)']],S.week)}</select></label>`,
    wk:`<label>Show<select id="xk">${opt([['wknd','Weekends (Fri-Sun)'],['wkday','Weekdays (Mon-Thu)']],S.wk)}</select></label>`,
    custom:`<label>From<select id="xf">${opt(dOpts,S.from)}</select></label><label>To<select id="xt">${opt(dOpts,S.to)}</select></label>`}[S.p]||'';
  [['#xd','day'],['#xw','week'],['#xk','wk'],['#xf','from'],['#xt','to']].forEach(([id,k])=>{const el=$(id);if(el)el.onchange=e=>{S[k]=k=='wk'?e.target.value:+e.target.value;render();};});
  const days=periodDays(), P=pnl(S.unit,days);
  const have=new Set(P.datesInData), cmpDays=days.filter(d=>have.has(d)); // same-day-to-date comparison
  const C=S.cmp?sales(S.cmp,cmpDays,S.unit):[], cg=sum(C,'coupons'), cn=sum(C,'net');
  const partial=S.year==maxYear()&&days.some(d=>!have.has(d));
  $('#plabel').innerHTML=esc((S.unit=='ALL'?'All units':D.uname[S.unit]+' '+S.unit)+' · '+S.year+' · '+plabel(days))+
    (partial?` · <b>${S.year} has data for ${cmpDays.length} of these days</b>; comparisons use the same fair days only`:'');
  const vs=(a,b)=>S.cmp&&b?`<small class="${cls(a/b-1)}">${pct(a/b-1)} vs ${S.cmp}</small>`:'<small>&nbsp;</small>';
  $('#kpis').innerHTML=[
    ['Gross sales (coupons)',money(P.gross),vs(P.gross,cg)],['Net to Fiesta',money(P.net),vs(P.net,cn)],
    P.hasCosts?['Profit'+(S.unit!='ALL'&&!S.alloc?' before shared':''),money(P.profit),'<small>'+(P.labor?'':'labor pending')+'</small>']:['Profit','—','<small>no cost data for '+S.year+'</small>'],
    P.hasCosts?['Margin (of net)',P.margin==null?'—':(P.margin*100).toFixed(1)+'%','<small>'+(P.labor?'':'before labor')+'</small>']:['Margin','—','<small>&nbsp;</small>']
  ].map(([l,v,s])=>`<div class="kpi"><span>${l}</span><b>${v}</b>${s}</div>`).join('');
  renderPnl(P,days); renderYoy(days,cmpDays); renderYears(days,cmpDays); renderUnits(days,cmpDays); renderDaily(days);
}
function maxYear(){return Math.max(...D.sales.map(s=>s.year));}
function renderPnl(P,days){
  let h='<table><tr><th></th><th>$</th><th>% of net</th></tr>';
  const r=(l,v,c='',a='')=>`<tr class="${c}" ${a}><td>${l}</td><td>${typeof v=='number'?money(v):v}</td><td>${typeof v=='number'&&P.net?(v/P.net*100).toFixed(1)+'%':''}</td></tr>`;
  h+=r('Gross coupon sales',P.gross,'')+r('Fair commission (25%)',-P.comm,'sub')+r('Net to Fiesta',P.net,'tot');
  if(!P.hasCosts){$('#pnl').innerHTML=h+'</table><p class="muted">Expenses are only tracked for 2026. Prior years show sales only.</p>';return;}
  h+='<tr class="sec"><td colspan="3">Expenses '+(S.unit=='ALL'?'tagged to a unit':'tagged to this unit')+' <span class="hint">tap for invoices</span></td></tr>';
  const cats=Object.entries(P.cats).sort((a,b)=>b[1]-a[1]);
  if(!cats.length)h+='<tr class="sub"><td colspan="3">No unit-tagged invoices in this period</td></tr>';
  cats.forEach(([c,v])=>h+=r(esc(c),-v,'tap',`data-cat="${esc(c)}"`));
  if(S.unit=='ALL') h+=r('Shared / unallocated costs ('+P.shared.length+' invoices)',-P.sharedAmt,'tap','data-cat="__shared"');
  else if(S.alloc) h+=r(`Shared costs allocated (${(P.share*100).toFixed(1)}% of net) <span class="tag">PROPOSAL</span>`,-P.sharedApplied,'tap','data-cat="__shared"');
  else h+=`<tr class="sub tap" data-cat="__shared"><td>Shared costs not allocated (${money(P.sharedAmt)} total, all units) - turn on the toggle to see a proposed share</td><td></td><td></td></tr>`;
  h+=P.labor?r('Labor',-P.labor,'tap','data-cat="__labor"'):'<tr><td>Labor</td><td class="pend">pending payroll</td><td></td></tr>';
  h+=r('Profit'+(S.unit!='ALL'&&!S.alloc?' before shared costs':'')+(P.labor?'':' (before labor)'),P.profit,'tot');
  h+=(hasSq()?'<tr class="tap" data-cat="__square"><td>Square item detail (Days 1-11 only, for drill-down - not the sales total) ›</td><td></td><td></td></tr>':'<tr class="sub"><td>Square item detail: not available online</td><td></td><td></td></tr>')+'</table>';
  if(S.p!='year')h+='<p class="muted">Period view: only invoices dated inside these fair days are counted. Pre-fair purchases show in the Year view.</p>';
  $('#pnl').innerHTML=h;
  $('#pnl').querySelectorAll('tr.tap').forEach(tr=>tr.onclick=()=>{const c=tr.dataset.cat;
    if(c=='__square')return showSquare(days,S.unit);
    if(c=='__labor')return sheet('<h2>Labor</h2>'+table(['Date','Unit','Hours','Cost'],P.lab.map(l=>[l.date,l.unit,l.hours,money(l.cost)])));
    const list=c=='__shared'?P.shared:P.direct.filter(e=>e.category==c);
    showInvoices((c=='__shared'?'Shared / unallocated':c)+(S.unit=='ALL'?'':' - '+(c=='__shared'?'all units':D.uname[S.unit])),list);});
}
function table(hd,rows){return'<table><tr>'+hd.map(x=>`<th>${x}</th>`).join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(x=>`<td>${x}</td>`).join('')+'</tr>').join('')+'</table>';}
function showInvoices(title,list){list=list.slice().sort((a,b)=>b.amount-a.amount);
  sheet(`<h2>${esc(title)}</h2><p class="muted">${list.length} invoices · ${money(sum(list,'amount'))}</p>`+
   table(['Vendor / invoice','Date','Unit','Category','Paid','Amount'],list.map(e=>[`<b>${esc(e.vendor)}</b><br><small>#${esc(e.invoice_no)} · ${esc(String(e.description).slice(0,140))}</small>`,esc(String(e.date).slice(5)),esc(e.unit_or_shared),esc(e.category),esc(String(e.paid_status).split(' (')[0]),money(e.amount)])));}
function showSquare(days,unit){const set=new Set(days),it={};
  (D.square||[]).filter(x=>set.has(+x.fair_day)&&(unit=='ALL'||x.unit==unit)).forEach(x=>{const k=x.item;(it[k]=it[k]||{q:0,g:0,regs:new Set()});it[k].q+=+x.qty;it[k].g+=+x.gross;it[k].regs.add(x.register);});
  const rows=Object.entries(it).sort((a,b)=>b[1].g-a[1].g);
  sheet(`<h2>Square items${unit=='ALL'?'':' - '+esc(D.uname[unit])}</h2><p class="muted">Square covers Days 1-11 only and does not capture all coupon sales; settlements are the sales total. Trio row includes all Trio-group registers (Trio + both Drinkware units).</p>`+
   (rows.length?table(['Item','Registers','Qty','Gross'],rows.map(([k,v])=>[esc(k),esc([...v.regs].join(', ')),num(v.q),money(v.g)])):'<p class="muted">No Square item data for these days.</p>'));}
function hasSq(){return Array.isArray(D.square)&&D.square.length>0;}
function sheet(h){$('#sheetbody').innerHTML=h;$('#sheet').hidden=false;}
function renderYoy(days,cmpDays){
  const cur=days.map(d=>({d,v:sum(sales(S.year,[d],S.unit),'coupons'),c:S.cmp&&cmpDays.includes(d)?sum(sales(S.cmp,[d],S.unit),'coupons'):0}));
  const mx=Math.max(1,...cur.map(x=>Math.max(x.v,x.c))), W=Math.max(320,cur.length*34), H=170, bw=(W-30)/cur.length;
  let s=`<svg viewBox="0 0 ${W} ${H+20}" width="100%" style="max-height:240px">`;
  cur.forEach((x,i)=>{const X=30+i*bw, h1=x.v/mx*H, h2=x.c/mx*H;
    if(S.cmp)s+=`<rect x="${X+2}" y="${H-h2}" width="${bw/2-2}" height="${h2}" fill="#bbb"><title>${S.cmp} Day ${x.d}: ${num(x.c)}</title></rect>`;
    s+=`<rect x="${X+(S.cmp?bw/2:2)}" y="${H-h1}" width="${(S.cmp?bw/2:bw-4)-2}" height="${h1}" fill="#00b4b6"><title>${S.year} Day ${x.d}: ${num(x.v)}</title></rect><text x="${X+bw/2}" y="${H+12}" text-anchor="middle">${x.d}</text>`;});
  s+=`<text x="0" y="10">${num(mx)}</text></svg><div class="legend"><i style="background:#00b4b6"></i>${S.year}${S.cmp?`<i style="background:#bbb"></i>${S.cmp}`:''} · gross coupons by fair day (Day 1 = opening Friday)</div>`;
  $('#yoy').innerHTML=s;
}
function renderYears(days,cmpDays){const yrs=[...new Set(D.sales.map(s=>s.year))].sort(); let prev=null;
  const useDays=S.year==maxYear()?cmpDays:days;
  const rows=yrs.map(y=>{const g=sum(sales(y,useDays,S.unit),'coupons');const r=[y==S.year?`<b>${y}</b>`:y,g?num(g):'—',g?money(g*.75):'—',prev&&g?`<span class="${cls(g/prev-1)}">${pct(g/prev-1)}</span>`:''];prev=g||null;return r;});
  $('#years').innerHTML=`<p class="muted">Same fair days (${useDays.length}) every year. Drinkware not tracked before 2025.</p>`+table(['Year','Gross coupons','Net (x0.75)','vs prior yr'],rows);}
function renderUnits(days,cmpDays){
  const rows=D.units.map(u=>{const P=pnl(u.unit,days),c=S.cmp?sum(sales(S.cmp,cmpDays,u.unit),'coupons'):0;
    return`<tr class="tap" data-u="${u.unit}"><td><b>${esc(u.name)}</b> <small>${u.unit}</small></td><td>${money(P.gross)}</td><td>${money(P.net)}</td><td>${P.hasCosts?money(sum(P.direct,'amount')+P.sharedApplied):'—'}</td><td>${P.hasCosts?money(P.profit):'—'}</td><td>${P.hasCosts&&P.margin!=null?(P.margin*100).toFixed(0)+'%':''}</td><td class="${cls(c?P.gross/c-1:null)}">${c?pct(P.gross/c-1):''}</td></tr>`;}).join('');
  const A=pnl('ALL',days);
  $('#byunit').innerHTML=`<table><tr><th>Unit</th><th>Gross</th><th>Net</th><th>Costs${S.alloc?' incl. shared':''}</th><th>Profit</th><th>Margin</th><th>vs ${S.cmp||''}</th></tr>${rows}`+
   (A.hasCosts&&!S.alloc?`<tr class="sub"><td>Shared / unallocated</td><td></td><td></td><td>${money(A.sharedAmt)}</td><td>${money(-A.sharedAmt)}</td><td></td><td></td></tr>`:'')+
   `<tr class="tot"><td>All units</td><td>${money(A.gross)}</td><td>${money(A.net)}</td><td>${A.hasCosts?money(sum(A.direct,'amount')+A.sharedAmt):'—'}</td><td>${A.hasCosts?money(A.profit):'—'}</td><td>${A.hasCosts&&A.margin!=null?(A.margin*100).toFixed(0)+'%':''}</td><td></td></tr></table>`+
   (A.hasCosts?'<p class="muted">Labor not included yet (pending payroll).</p>':'');
  $('#byunit').querySelectorAll('tr.tap').forEach(tr=>tr.onclick=()=>{S.unit=tr.dataset.u;render();scrollTo(0,0);});}
function renderDaily(days){
  const rows=days.map(d=>{const g=sum(sales(S.year,[d],S.unit),'coupons'),c=S.cmp?sum(sales(S.cmp,[d],S.unit),'coupons'):0;
    return`<tr class="tap" data-d="${d}"><td>Day ${d} <small>${WD[d%7]} ${fmtD(dateOf(S.year,d))}</small></td><td>${g?num(g):'—'}</td><td>${g?money(g*.75):'—'}</td><td>${S.cmp&&c?num(c):''}</td><td class="${cls(g&&c?g/c-1:null)}">${g&&c?pct(g/c-1):''}</td></tr>`;}).join('');
  $('#daily').innerHTML=`<table><tr><th>Fair day</th><th>Gross ${S.year}</th><th>Net</th><th>${S.cmp||''}</th><th>YoY</th></tr>${rows}</table>`;
  $('#daily').querySelectorAll('tr.tap').forEach(tr=>tr.onclick=()=>showDay(+tr.dataset.d));}
function showDay(d){const sl=sales(S.year,[d],S.unit),cs=S.cmp?sales(S.cmp,[d],S.unit):[];
  const rows=D.units.filter(u=>S.unit=='ALL'||u.unit==S.unit).map(u=>{const a=sl.filter(s=>s.unit==u.unit),b=cs.filter(s=>s.unit==u.unit),g=sum(a,'coupons'),c=sum(b,'coupons');
    return[esc(u.name),a.length?num(g):'—',a.length?money(sum(a,'fair_commission')):'',a.length?money(sum(a,'net')):'',c?num(c):'',g&&c?`<span class="${cls(g/c-1)}">${pct(g/c-1)}</span>`:''];});
  const inv=S.year==2026?D.expenses.filter(e=>e.fd==d&&(S.unit=='ALL'||e.unit_or_shared==S.unit||e.unit_or_shared=='SHARED')):[];
  let h=`<h2>Day ${d} · ${WD[d%7]} ${fmtD(dateOf(S.year,d))}/${S.year}</h2>`+table(['Unit','Gross','Fair 25%','Net',S.cmp||'',' YoY'],rows);
  if(S.year==2026){h+=`<h2>Invoices dated this day (${inv.length})</h2>`+(inv.length?table(['Vendor','Unit','Category','Amount'],inv.map(e=>[esc(e.vendor)+' <small>#'+esc(e.invoice_no)+'</small>',esc(e.unit_or_shared),esc(e.category),money(e.amount)])):'<p class="muted">None</p>');
    h+=hasSq()?`<p><button class="btn small teal" id="sqd">Square items for this day</button></p>`:'<p class="muted">Square item detail: not available online.</p>';}
  sheet(h); const b=$('#sqd'); if(b)b.onclick=()=>showSquare([d],S.unit);}
load();
})();
