(function(){
'use strict';
var C=window.FIESTA_CONFIG||{}, API=(C.API_URL||'').trim(), DEMO=!API;
var $=function(id){return document.getElementById(id)};
var LS={get:function(k,d){try{var v=localStorage.getItem('fi_'+k);return v?JSON.parse(v):d}catch(e){return d}},set:function(k,v){localStorage.setItem('fi_'+k,JSON.stringify(v))}};
var SEEDS=[],EXPECTED=[],receipts=[],latestCounts={},rlines={},GROUPS=[],PRODUCTS=[],WH=[],BYID={},draft=LS.get('draft',{}),lines=[],filter='open',orders=[],wh=LS.get('wh','W1'),lastByWh={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m){var t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){t.hidden=true},2200)}
function fmt(ts){return ts?new Date(ts).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}
function today(){var d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function linkHtml(u){return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">Reorder link ↗</a>':''}
function uomOf(i){return i&&String(i.uom).toLowerCase()==='unit'?'unit':'case'}  // no uom (old orders) = case
function qtyU(q,u){q=+q||0;return u==='unit'?q+(q===1?' unit':' units'):q+' cs'}
var uomPref=LS.get('cuom',{});  // Count tab: Case/Unit remembered per item (default Case)
function cuom(id,w){return (w||wh)!=='W2'&&uomPref[id]==='unit'?'unit':'case'}  // W2 = cases only
// Merged product ids (old id -> kept id). Old Sheet rows keep the old id; we map them when reading.
var ALIAS={'w2-sb-dos-locos-small-box':'w2-50ml-dos-locos-17'};
function aid(id){return ALIAS[id]||id}
function remapItems(list){(list||[]).forEach(function(x){(x.items||[]).forEach(function(i){if(ALIAS[i.product_id]){i.alias_of=i.product_id;i.product_id=aid(i.product_id)}})});return list}
// Same session (same timestamp): keep the non-zero value, never add. Otherwise keep the most recent.
function pickC(a,b){if(!a)return b;if(!b)return a;var ta=String(a.timestamp||''),tb=String(b.timestamp||'');
  if(ta===tb){var r=Object.assign({},a);if(!(+a.on_hand>0)&&+b.on_hand>0)r.on_hand=b.on_hand;
    if((a.last_order==null||a.last_order===''||!(+a.last_order>0))&&b.last_order!=null&&+b.last_order>0){r.last_order=b.last_order;r.last_order_uom=b.last_order_uom;r.last_order_at=b.last_order_at}
    if(!(+a.order>0)&&+b.order>0){r.order=b.order;r.order_uom=b.order_uom}return r}
  return tb>ta?b:a}
function mergeLatest(lc){var o={};Object.keys(lc||{}).forEach(function(k){var t=aid(k);o[t]=pickC(o[t],lc[k])});return o}
function packHint(p){var u=(p&&p.unit)||'';return u&&!/UNCERTAIN/i.test(u)?u:''}  // shown as a hint only, never used to convert
function telHtml(p){return p?'<a href="tel:'+esc(p.replace(/\D/g,''))+'">📞 '+esc(p)+'</a>':''}

// ---------- data layer: Apps Script API or demo localStorage ----------
function api(action,data){
  if(DEMO) return Promise.resolve(demo(action,data||{}));
  return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:action,pin:LS.get('pin',''),data:data||{}})})
    .then(function(r){return r.json()}).then(function(j){if(!j.ok){if(j.error==='bad_pin'){LS.set('pin','');askPin('Wrong PIN. Try again.')}throw new Error(j.error||'error')}return j.result});
}
function demo(a,d){
  var o=LS.get('orders',[]);
  if(a==='state'){var ch=false;SEEDS.forEach(function(s){if(!o.some(function(x){return x.id===s.id})){o.push(JSON.parse(JSON.stringify(s)));ch=true}});if(ch)LS.set('orders',o);
    var rs0=LS.get('receipts',null);if(!rs0){rs0=JSON.parse(JSON.stringify(EXPECTED));LS.set('receipts',rs0)}
    var lat={};LS.get('countRows',[]).forEach(function(r){if(r.on_hand===''||r.on_hand==null)return;if(!lat[r.product_id]||r.timestamp>=lat[r.product_id].timestamp)lat[r.product_id]={on_hand:r.on_hand,timestamp:r.timestamp,counter:r.counter,order:r.order,order_uom:r.warehouse==='W2'?'case':uomOf({uom:r.order_uom})}});
    LS.get('countRows',[]).forEach(function(r){if(r.order===''||r.order==null)return;var k=r.product_id,c=lat[k]=lat[k]||{on_hand:'',timestamp:r.timestamp,counter:r.counter};if(!c.last_order_at||r.timestamp>=c.last_order_at){c.last_order=r.order;c.last_order_uom=r.warehouse==='W2'?'case':uomOf({uom:r.order_uom});c.last_order_at=r.timestamp}});
    return{orders:o,lastCounts:LS.get('lastCounts',{}),receipts:rs0,latestCounts:lat}}
  if(a==='saveReceipt'){var its=(d.items||[]).filter(function(i){return i.product_id&&i.qty>0});if(!its.length)throw new Error('no_items');if(!d.received_by)throw new Error('need_received_by');
    var rc={id:'RCV-'+Date.now().toString(36).toUpperCase(),warehouse:'W2',supplier:'Specialty Blends',items:its,items_summary:its.map(function(i){return i.qty+' x '+i.name}).join('; '),ref_number:d.ref_number||'',received_by:d.received_by,received_at:d.received_at||new Date().toISOString(),note:d.note||'',created_at:new Date().toISOString(),status:'received',expected_id:d.expected_id||''};
    var rs=LS.get('receipts',[]);rs.forEach(function(x){if(d.expected_id&&x.id===d.expected_id)x.status='arrived'});rs.push(rc);LS.set('receipts',rs);return{id:rc.id}}
  if(a==='saveCount'){var lc={timestamp:new Date().toISOString(),counter:d.counter,warehouse:d.warehouse,n:d.rows.length},m=LS.get('lastCounts',{});m[d.warehouse]=lc;LS.set('lastCounts',m);var h=LS.get('countRows',[]);LS.set('countRows',h.concat(d.rows.map(function(r){return Object.assign({timestamp:lc.timestamp,counter:d.counter,warehouse:d.warehouse},r)})));return lc}
  if(a==='createOrder'){var n=Object.assign({id:'ORD-'+Date.now().toString(36).toUpperCase(),created:new Date().toISOString(),status:'open',delivered_at:''},d);n.items=(n.items||[]).map(function(i){return Object.assign({},i,{uom:n.source_warehouse==='W2'?'case':uomOf(i)})});n.items_summary=n.items.map(function(i){return qtyU(i.qty,i.uom)+' x '+i.name+(i.back_ordered?' ('+qtyU(i.back_ordered,i.uom)+' BO)':'')}).join('; ');n.status='open';n.sb_invoice_expected=n.source_warehouse==='W2';n.sb_invoice_received=false;n.sb_invoice_number='';n.sb_invoice_received_at='';o.push(n);LS.set('orders',o);return n}
  if(a==='markLoaded'){if(!d.labels_checked)throw new Error('labels_not_checked');o.forEach(function(x){if(x.id===d.id){x.status='loaded';x.labels_checked=true;x.labels_checked_at=new Date().toISOString();x.labels_checked_by=d.by}});LS.set('orders',o);return{id:d.id}}
  if(a==='markDelivered'){var f=o.filter(function(x){return x.id===d.id})[0];if(!f)throw new Error('not_found');if(!f.labels_checked)throw new Error('labels_not_checked');if(!d.received_by||!d.signature)throw new Error('need_name_and_signature');
    f.status='delivered';f.received_by=d.received_by;f.signature=d.signature;f.received_at=d.received_at||new Date().toISOString();f.delivered_at=new Date().toISOString();f.delivered_by=d.by;LS.set('orders',o);return{id:d.id}}
  if(a==='markInvoiceReceived'){var g=o.filter(function(x){return x.id===d.id})[0];if(!g||!g.sb_invoice_expected)throw new Error('no_sb_invoice_expected');g.sb_invoice_received=true;g.sb_invoice_number=d.invoice_number||'';g.sb_invoice_received_at=new Date().toISOString();LS.set('orders',o);return{id:d.id}}
  throw new Error('unknown action');
}
function askPin(m){var e=$('pinerr');if(!e){e=document.createElement('p');e.id='pinerr';e.className='alert';$('pinbox').insertBefore(e,$('pinbox').firstChild)}e.textContent=m||'';e.hidden=!m;$('pin').value='';$('pinbox').hidden=false}
$('pinok').onclick=function(){LS.set('pin',$('pin').value.trim());$('pinbox').hidden=true;refresh()};

// ---------- tabs ----------
document.querySelectorAll('nav button').forEach(function(b){b.onclick=function(){
  document.querySelectorAll('nav button').forEach(function(x){x.classList.toggle('on',x===b)});
  document.querySelectorAll('.tab').forEach(function(s){s.hidden=s.id!=='tab-'+b.dataset.tab});
  if(b.dataset.tab==='orders')renderOrders();if(b.dataset.tab==='recv'){if(!$('rcvwho').value)$('rcvwho').value=$('counter').value;$('rcvwhen').value=nowLocal();renderRecv();renderBal()}window.scrollTo(0,0);
}});

// ---------- count screen ----------
function stepper(id,kind,val){
  return '<div class="field '+kind+'"><span>'+(kind==='hand'?'On Hand':'Order')+'</span><div class="step">'+
   '<button type="button" aria-label="minus" data-id="'+id+'" data-k="'+kind+'" data-d="-1">−</button>'+
   '<input inputmode="numeric" pattern="[0-9]*" data-id="'+id+'" data-k="'+kind+'" value="'+(val===''||val==null?'':val)+'" aria-label="'+kind+'">'+
   '<button type="button" class="plus" aria-label="plus" data-id="'+id+'" data-k="'+kind+'" data-d="1">+</button></div>'+(kind==='order'?uomCtl(id):'')+'</div>';
}
function uomCtl(id){if(wh==='W2')return '<div class="cuom fixed" title="Warehouse 2: cases only">cs</div>';var u=cuom(id);
  return '<div class="seg cuom" role="group" aria-label="Order in case or unit"><button type="button" data-cuom="case" data-id="'+id+'" class="'+(u==='case'?'on':'')+'">Case</button><button type="button" data-cuom="unit" data-id="'+id+'" class="'+(u==='unit'?'on':'')+'">Unit</button></div>';
}
function lastHtml(id){var c=latestCounts[id];if(!c)return '';var a=[];
  if(c.on_hand!==''&&c.on_hand!=null)a.push(esc(c.on_hand)+' on hand');
  var oq=c.last_order!=null&&c.last_order!==''?c.last_order:(c.order!=null&&c.order!==''?c.order:null),ou=c.last_order!=null&&c.last_order!==''?c.last_order_uom:c.order_uom;
  if(oq!==null&&+oq>0)a.push('order '+qtyU(oq,wh==='W2'?'case':uomOf({uom:ou})));
  return a.length?'Last count: '+a.join(' · ')+(c.timestamp?' ('+esc(fmt(c.timestamp))+')':''):'';
}
function renderLastCounts(){document.querySelectorAll('#groups .lastc').forEach(function(el){el.innerHTML=lastHtml(el.dataset.id)})
}
function renderGroups(){
  var open=LS.get('open',{});
  $('groups').innerHTML=GROUPS.filter(function(g){return g.warehouse===wh}).map(function(g){
    var items=PRODUCTS.filter(function(p){return p.warehouse===wh&&p.countable&&p.group===g.name});
    return '<details data-g="'+esc(wh+g.name)+'"'+(open[wh+g.name]?' open':'')+'><summary>'+esc(g.name)+' ('+items.length+')</summary>'+
      ((g.note||g.phone)?'<div class="gnote">'+(g.phone?telHtml(g.phone):esc(g.note))+'</div>':'')+
      items.map(function(p){var v=draft[p.id]||{};return '<div class="item"><div class="iname">'+esc(p.name)+'</div>'+
        (p.unit?'<div class="unit">Unit: '+esc(p.unit)+'</div>':'')+(p.note?'<div class="inote">'+esc(p.note)+'</div>':'')+(p.catalog_note?'<div class="inote">'+esc(p.catalog_note)+'</div>':'')+(p.last_known?'<div class="lastk">last known (Oct 12): '+esc(p.last_known)+'</div>':'')+(p.link?'<div>'+linkHtml(p.link)+'</div>':'')+
        '<div class="fields">'+stepper(p.id,'hand',v.hand)+stepper(p.id,'order',v.order)+'</div><div class="lastc" data-id="'+esc(p.id)+'">'+lastHtml(p.id)+'</div></div>'}).join('')+'</details>';
  }).join('');
  document.querySelectorAll('details').forEach(function(d){d.addEventListener('toggle',function(){var o=LS.get('open',{});o[d.dataset.g]=d.open;LS.set('open',o)})});
}
function setVal(id,k,v){draft[id]=draft[id]||{};draft[id][k]=v;LS.set('draft',draft);renderGuide()}
$('groups').addEventListener('click',function(e){var ub=e.target.closest('button[data-cuom]');if(ub){if(wh==='W2')return;uomPref[ub.dataset.id]=ub.dataset.cuom;LS.set('cuom',uomPref);
    ub.parentNode.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===ub)});renderGuide();return}
  var b=e.target.closest('button[data-d]');if(!b)return;
  var inp=b.parentNode.querySelector('input'),n=Math.max(0,(parseInt(inp.value,10)||0)+parseInt(b.dataset.d,10));inp.value=n;setVal(b.dataset.id,b.dataset.k,n)});
$('groups').addEventListener('input',function(e){var i=e.target;if(i.tagName!=='INPUT')return;i.value=i.value.replace(/\D/g,'');setVal(i.dataset.id,i.dataset.k,i.value===''?'':parseInt(i.value,10))});
function renderGuide(){
  $('guideh').textContent='Order guide - '+whName(wh);
  var html=GROUPS.filter(function(g){return g.warehouse===wh}).map(function(g){var its=PRODUCTS.filter(function(p){return p.warehouse===wh&&p.countable&&p.group===g.name&&(draft[p.id]||{}).order>0});
    if(!its.length)return'';return '<div class="gg"><b>'+esc(g.name)+'</b>'+(g.phone?' · '+telHtml(g.phone):g.note?' · '+esc(g.note):'')+
      '<ul>'+its.map(function(p){return '<li><b>'+qtyU(draft[p.id].order,cuom(p.id))+'</b> × '+esc(p.name)+(p.note?' <i>('+esc(p.note)+')</i>':'')+(p.link?' '+linkHtml(p.link):'')+'</li>'}).join('')+'</ul></div>'}).join('');
  $('guide').innerHTML=html||'<p class="muted">Nothing to order yet. Use the Order field on any item.</p>';
}
function allNames(){var ns=(C.COUNTER_NAMES||['Mac']).slice();LS.get('names',[]).forEach(function(n){if(ns.indexOf(n)<0)ns.push(n)});return ns}
$('cbtns').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;LS.set('counter',b.dataset.n);renderCounters()});
function renderCounters(){var names=allNames(),cur=LS.get('counter',names[0]);if(names.indexOf(cur)<0)cur=names[0];
  $('cbtns').innerHTML=names.map(function(n){return '<button type="button" data-n="'+esc(n)+'" class="'+(n===cur?'on':'')+'">'+esc(n)+'</button>'}).join('');
  $('counter').innerHTML=names.map(function(n){return '<option'+(n===cur?' selected':'')+'>'+esc(n)+'</option>'}).join('')}
$('counter').onchange=function(){LS.set('counter',this.value)};
$('addname').onclick=function(){var n=(prompt('Counter name')||'').trim();if(!n)return;var ns=LS.get('names',[]);if(ns.indexOf(n)<0)ns.push(n);LS.set('names',ns);LS.set('counter',n);renderCounters()};
function whName(w){var x=WH.filter(function(a){return a.id===w})[0];return x?x.name:w}
function showLast(){var lc=lastByWh[wh];$('lastsaved').textContent=lc?whName(wh)+' last saved '+fmt(lc.timestamp)+' by '+lc.counter:whName(wh)+': not saved yet'}
function renderWh(){if(!WH.some(function(x){return x.id===wh}))wh='W1';$('whsw').innerHTML=WH.map(function(x){return '<button type="button" data-w="'+x.id+'">'+esc(x.name)+'</button>'}).join('');$('whsw').querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.dataset.w===wh)});var x=WH.filter(function(a){return a.id===wh})[0];$('whsrc').textContent=x?x.source:'';renderGroups();renderGuide();showLast()}
$('whsw').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;wh=b.dataset.w;LS.set('wh',wh);renderWh()});
// ---------- Text Order (sms: link + copy; never auto-sends) ----------
function today(){return new Date().toLocaleDateString([],{month:'numeric',day:'numeric',year:'numeric'})}
function smsBody(o){var L=['Fiesta order - '+o.loc,'Date: '+o.date];if(o.to)L.push('To: '+o.to);if(o.counter)L.push('By: '+o.counter);if(o.id)L.push('Order #: '+o.id);L.push('');
  o.lines.forEach(function(l){L.push('- '+l.name+': '+qtyU(l.qty,l.uom))});if(o.note){L.push('');L.push('Note: '+o.note)}return L.join('\n')}
function showText(k,o){var body=smsBody(o),box=$('txt'+k);$('txt'+k+'go').href='sms:?&body='+encodeURIComponent(body);
  $('txt'+k+'cp').onclick=function(){var done=function(){toast('Order copied')};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(body).then(done,function(){prompt('Copy this order:',body)});else prompt('Copy this order:',body)};
  box.hidden=false}
// after a confirmed save: wipe that location's draft qtys + Case/Unit picks (back to Case)
function clearWh(w){PRODUCTS.forEach(function(p){if(p.warehouse===w){delete draft[p.id];delete uomPref[p.id]}});LS.set('draft',draft);LS.set('cuom',uomPref)}
$('savecount').onclick=function(){
  var rows=PRODUCTS.filter(function(p){return p.warehouse===wh&&p.countable}).map(function(p){var v=draft[p.id]||{};return{product_id:p.id,name:p.name,group:p.group,on_hand:v.hand===undefined?'':v.hand,order:v.order===undefined?'':v.order,order_uom:cuom(p.id)}})
    .filter(function(r){return r.on_hand!==''||r.order!==''});
  if(!rows.length){toast('Enter at least one count first');return}
  var b=this;b.disabled=true;
  var snap={loc:whName(wh),date:today(),counter:$('counter').value,lines:rows.filter(function(r){return +r.order>0}).map(function(r){return{name:r.name,qty:r.order,uom:r.order_uom}})};$('txtc').hidden=true;
  var sw=wh;api('saveCount',{counter:$('counter').value,warehouse:sw,rows:rows}).then(function(lc){lastByWh[sw]=lc;if(snap.lines.length){snap.id=lc&&(lc.id||lc.count_id)||'';showText('c',snap)}lastByWh[sw]=lc;clearWh(sw);if(wh===sw){renderGroups();renderGuide()}showLast();toast('Count saved ✓ - cleared for a new count');refresh()}).catch(function(e){toast('Save failed: '+e.message)}).then(function(){b.disabled=false});
};

// ---------- new order ----------
var CUST=(C.CUSTOMERS||[]).concat([{name:'Warehouse 1',ship_to:'',drop:'Warehouse 1 (transfer from Warehouse 2)',w1:true}]);
function renderDest(){$('dest').innerHTML='<option value="">Choose…</option>'+CUST.map(function(x,i){return '<option value="'+i+'">'+esc(x.name)+'</option>'}).join('')+'<option value="__other">Other (type it)</option>';$('shipvia').value=C.SHIP_VIA_DEFAULT||''}
$('dest').onchange=function(){var v=this.value,c=CUST[v];$('destother').hidden=v!=='__other';$('shipto').value=c?c.ship_to:'';$('drop').value=c?c.drop:'';
  var al=c&&c.alert?'⚠ '+c.alert:(c&&c.w1&&srcwh()==='W1'?'⚠ Warehouse 1 as destination is a transfer: set From warehouse to Warehouse 2':'');$('destalert').hidden=!al;$('destalert').textContent=al};
function srcwh(){return $('srcwh').value}
function unitOk(w){return w==='W1'||w==='TRL'||w==='TRB'}  // W2 = Specialty Blends' warehouse: cases only
$('srcwh').onchange=function(){if(!unitOk(srcwh()))lines.forEach(function(l){l.uom='case'});lines=[];renderLines();$('search').dispatchEvent(new Event('input'))};
$('search').addEventListener('input',function(){var q=this.value.trim().toLowerCase();
  if(!q){$('results').innerHTML='';return}
  $('results').innerHTML=PRODUCTS.filter(function(p){return p.warehouse===srcwh()&&(p.name+' '+p.group+' '+p.note).toLowerCase().indexOf(q)>=0}).slice(0,15)
   .map(function(p){return '<div class="res"><div><b>'+esc(p.name)+'</b><div class="inote">'+esc(p.group)+(p.unit?' · '+esc(p.unit):'')+(p.slip_only?' · slip item':'')+'</div></div><button class="btn teal small" data-add="'+p.id+'">Add</button></div>'}).join('')||'<p class="muted">No match in '+whName(srcwh())+'</p>'});
$('results').addEventListener('click',function(e){var b=e.target.closest('[data-add]');if(!b)return;var id=b.dataset.add,l=lines.filter(function(x){return x.id===id})[0];
  if(l)l.qty++;else lines.push({id:id,qty:1,bo:0,uom:'case'});renderLines();toast('Added '+BYID[id].name)});
function mini(i,k,v,lab){return '<div class="field"><span>'+lab+'</span><div class="step"><button data-i="'+i+'" data-k="'+k+'" data-d="-1">−</button><input inputmode="numeric" data-i="'+i+'" data-k="'+k+'" value="'+v+'"><button class="plus" data-i="'+i+'" data-k="'+k+'" data-d="1">+</button></div></div>'}
function renderLines(){var uo=unitOk(srcwh());if(!uo)lines.forEach(function(l){l.uom='case'});$('lines').innerHTML=lines.length?lines.map(function(l,i){var p=BYID[l.id],u=uomOf(l),h=packHint(p);return '<div class="item"><div class="iname">'+esc(p.name)+'</div><div class="inote">'+esc(p.group)+(uo?'':' · cases only (Warehouse 2)')+'</div>'+
  (uo?'<div class="seg uom" role="group" aria-label="Case or unit"><button type="button" data-uom="case" data-i="'+i+'" class="'+(u==='case'?'on':'')+'">Case</button><button type="button" data-uom="unit" data-i="'+i+'" class="'+(u==='unit'?'on':'')+'">Unit</button></div>':'')+
  (h?'<div class="inote packhint">Pack: '+esc(h)+'</div>':'')+'<div class="fields">'+
  mini(i,'qty',l.qty,'Ordered ('+(u==='unit'?'units':'cases')+')')+mini(i,'bo',l.bo,'Back ordered')+'</div><div class="inote">Shipped: <b>'+qtyU(Math.max(0,l.qty-l.bo),u)+'</b></div></div>'}).join(''):'<p class="muted">No items yet</p>'}
$('lines').addEventListener('click',function(e){var ub=e.target.closest('button[data-uom]');if(ub){lines[ub.dataset.i].uom=unitOk(srcwh())?ub.dataset.uom:'case';renderLines();return}var b=e.target.closest('button[data-d]');if(!b)return;var l=lines[b.dataset.i];l[b.dataset.k]=Math.max(0,l[b.dataset.k]+parseInt(b.dataset.d,10));if(l.qty<=0)lines.splice(b.dataset.i,1);else if(l.bo>l.qty)l.bo=l.qty;renderLines()});
$('lines').addEventListener('change',function(e){var i=e.target;if(!i.dataset.i)return;var l=lines[i.dataset.i],n=parseInt(i.value.replace(/\D/g,''),10)||0;l[i.dataset.k]=n;if(l.qty<=0)lines.splice(i.dataset.i,1);else if(l.bo>l.qty)l.bo=l.qty;renderLines()});
$('saveorder').onclick=function(){
  var dv=$('dest').value,dest=dv==='__other'?$('destother').value.trim():(CUST[dv]||{}).name;
  if(!dest){toast('Pick the customer');return}if(!$('ddate').value){toast('Pick a delivery date');return}if(!lines.length){toast('Add at least one product');return}
  var items=lines.map(function(l){var p=BYID[l.id];return{product_id:l.id,name:p.name,group:p.group,unit:p.unit||'',qty:l.qty,back_ordered:l.bo,shipped:Math.max(0,l.qty-l.bo),uom:unitOk(srcwh())?uomOf(l):'case'}});
  var snap={loc:whName(srcwh()),to:dest,date:$('ddate').value,counter:$('counter').value,note:$('onote').value.trim(),lines:items.filter(function(i){return i.qty>0}).map(function(i){return{name:i.name,qty:i.qty,uom:i.uom}})};$('txto').hidden=true;
  var b=this;b.disabled=true;
  api('createOrder',{created_by:$('counter').value,source_warehouse:srcwh(),destination:dest,ship_to:$('shipto').value.trim(),drop_spot:$('drop').value.trim(),delivery_date:$('ddate').value,
     slip_no:$('slipno').value.trim(),slip_date:$('slipdate').value,ship_via:$('shipvia').value.trim(),po_no:$('pono').value.trim(),tax_no:$('taxno').value.trim(),permit_no:$('permitno').value.trim(),items:items,note:$('onote').value.trim()})
   .then(function(r){snap.id=r&&(r.id||r.order_id)||'';showText('o',snap);lines=[];renderLines();['onote','search','slipno','slipdate','pono','taxno','permitno','shipto','drop'].forEach(function(k){$(k).value=''});$('results').innerHTML='';$('dest').value='';$('destother').value='';$('destother').hidden=true;$('ddate').value='';$('shipvia').value=C.SHIP_VIA_DEFAULT||'';$('destalert').hidden=true;toast('Order saved ✓');return refresh()})
   .catch(function(e){toast('Save failed: '+e.message)}).then(function(){b.disabled=false});
};

// ---------- orders list ----------
$('filter').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;filter=b.dataset.f;
  $('filter').querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});renderOrders()});
function renderOrders(){var list=orders.filter(function(o){return filter==='all'||(filter==='sbpending'?(o.sb_invoice_expected&&!o.sb_invoice_received):filter==='open'?(o.status!=='delivered'&&o.status!=='recorded'):o.status===filter)})
  .sort(function(a,b){return (a.delivery_date+a.created).localeCompare(b.delivery_date+b.created)});
  $('orders').innerHTML=list.length?list.map(function(o){var st=o.status||'open';return '<div class="card ord '+(st==='delivered'?'done':st)+'"><h3>'+esc(o.destination)+' <span class="badge '+st+'">'+st.toUpperCase()+'</span>'+(o.prior?' <span class="badge prior">OPENING ENTRY</span>':'')+(o.included_in?' <span class="badge confirm">IN OPENING ENTRY</span>':'')+(o.sb_invoice_expected?(o.sb_invoice_received?' <span class="badge sbok">SB INVOICE ✓</span>':' <span class="badge sb">SB INVOICE EXPECTED</span>'):'')+'</h3>'+
    (o.drop_spot?'<div><b>Drop:</b> '+esc(o.drop_spot)+'</div>':'')+
    '<div><b>Deliver:</b> '+esc(o.delivery_date)+' · from '+esc(whName(o.source_warehouse))+(o.slip_no?' · Slip '+esc(o.slip_no):'')+'</div>'+
    '<ul>'+(o.items||[]).map(function(i){return '<li><b>'+qtyU(i.qty,uomOf(i))+'</b> × '+esc(i.name)+(i.needs_confirm?' <i>("'+esc(i.owner_wording||'')+'")</i> <span class="badge confirm">UNCONFIRMED</span>':(i.owner_wording?' <i>("'+esc(i.owner_wording)+'")</i>':''))+(i.back_ordered?' <i>('+qtyU(i.back_ordered,uomOf(i))+' back ordered, '+qtyU(i.shipped,uomOf(i))+' shipped)</i>':'')+'</li>'}).join('')+'</ul>'+
    (o.note?'<div><b>Note:</b> '+esc(o.note)+'</div>':'')+'<div class="inote">'+esc(o.id)+' · by '+esc(o.created_by)+' · '+esc(fmt(o.created))+'</div>'+
    (o.sb_invoice_expected?(o.sb_invoice_received?'<div class="inote">✓ SB invoice received'+(o.sb_invoice_number?' #'+esc(o.sb_invoice_number):'')+' · '+esc(fmt(o.sb_invoice_received_at))+'</div>':'<div class="sbbox">Pulled from Warehouse 2: Specialty Blends should invoice Fiesta.<input placeholder="Invoice # (optional)" data-invno="'+esc(o.id)+'"><button class="btn teal big" data-inv="'+esc(o.id)+'">Mark SB invoice received</button></div>'):'')+
    (o.labels_checked?'<div class="inote">✓ Labels checked '+esc(fmt(o.labels_checked_at))+'</div>':'')+
    (st==='open'?'<label class="lbl"><input type="checkbox" data-chk="'+esc(o.id)+'"> Case labels checked against slip before load leaves</label><button class="btn teal big" data-load="'+esc(o.id)+'" disabled>Mark loaded / out for delivery</button>':'')+
    (st==='loaded'?'<button class="btn green big" data-deliver="'+esc(o.id)+'">Mark delivered</button>':'')+
    (st==='delivered'?'<div><b>Received by:</b> '+esc(o.received_by)+' · '+esc(fmt(o.received_at))+'</div>'+(o.signature?(/^data:image\//.test(o.signature)?'<img class="sigimg" alt="signature" src="'+esc(o.signature)+'">':'<div class="inote">Signature: '+esc(o.signature)+'</div>'):''):'')+'</div>'}).join(''):'<p class="muted">No '+(filter==='all'?'':filter==='sbpending'?'SB-invoice-pending ':filter+' ')+'orders.</p>'}
$('orders').addEventListener('change',function(e){var c=e.target.closest('[data-chk]');if(!c)return;var b=$('orders').querySelector('[data-load="'+c.dataset.chk+'"]');if(b)b.disabled=!c.checked});
$('orders').addEventListener('click',function(e){
  var b=e.target.closest('[data-load]');if(b){var c=$('orders').querySelector('[data-chk="'+b.dataset.load+'"]');if(!c||!c.checked){toast('Check the case labels first');return}
    b.disabled=true;api('markLoaded',{id:b.dataset.load,labels_checked:true,by:$('counter').value}).then(function(){toast('Loaded ✓');return refresh()}).catch(function(e){toast('Failed: '+e.message);b.disabled=false});return}
  var iv=e.target.closest('[data-inv]');if(iv){var inp=$('orders').querySelector('[data-invno="'+iv.dataset.inv+'"]');iv.disabled=true;
    api('markInvoiceReceived',{id:iv.dataset.inv,invoice_number:inp?inp.value.trim():'',by:$('counter').value}).then(function(){toast('SB invoice received ✓');return refresh()}).catch(function(e){toast('Failed: '+e.message);iv.disabled=false});return}
  var d=e.target.closest('[data-deliver]');if(d)openSheet(d.dataset.deliver)});
// delivery sheet with signature
var sheetId=null,cv=$('sig'),cx=cv.getContext('2d'),drawn=false,drawing=false;
function sizeSig(){var r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;cv.width=r.width*dpr;cv.height=r.height*dpr;cx.setTransform(dpr,0,0,dpr,0,0);cx.lineWidth=3;cx.lineCap='round';cx.strokeStyle='#000';cx.fillStyle='#fff';cx.fillRect(0,0,r.width,r.height);drawn=false}
function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}
cv.addEventListener('pointerdown',function(e){drawing=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);e.preventDefault()});
cv.addEventListener('pointermove',function(e){if(!drawing)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();drawn=true;e.preventDefault()});
cv.addEventListener('pointerup',function(){drawing=false});
function sigData(){var t=document.createElement('canvas');t.width=300;t.height=150;var c=t.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,300,150);c.drawImage(cv,0,0,300,150);return t.toDataURL('image/png')}
function nowLocal(){var d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function openSheet(id){sheetId=id;var o=orders.filter(function(x){return x.id===id})[0];$('shdest').textContent=o?o.destination:'';$('shitems').innerHTML=o?(o.items||[]).map(function(i){var q=(i.shipped!=null&&i.shipped!=='')?i.shipped:i.qty;return '<li><b>'+qtyU(q,uomOf(i))+'</b> × '+esc(i.name)+'</li>'}).join(''):'';$('rcvby').value='';$('rcvat').value=nowLocal();$('sheet').hidden=false;sizeSig()}
$('sigclear').onclick=sizeSig;$('shcancel').onclick=function(){$('sheet').hidden=true};
$('shsave').onclick=function(){var n=$('rcvby').value.trim();if(!n){toast('Enter who received it');return}if(!drawn){toast('Get a signature');return}
  var b=this;b.disabled=true;api('markDelivered',{id:sheetId,received_by:n,signature:sigData(),received_at:new Date($('rcvat').value).toISOString(),by:$('counter').value})
   .then(function(){$('sheet').hidden=true;toast('Delivered ✓');return refresh()}).catch(function(e){toast('Failed: '+e.message)}).then(function(){b.disabled=false})};

function refresh(){return api('state').then(function(s){orders=s.orders||[];lastByWh=s.lastCounts||{};receipts=s.receipts||[];latestCounts=mergeLatest(s.latestCounts);remapItems(orders);remapItems(receipts);showLast();renderLastCounts();renderOrders();renderRcvList();renderBal()}).catch(function(e){toast('Could not load: '+e.message)})}

// ---------- receive from Specialty Blends (into W2) ----------
function w2prods(){return PRODUCTS.filter(function(p){return p.warehouse==='W2'&&p.countable})}
function renderRecv(){$('rcvitems').innerHTML=w2prods().map(function(p){var v=rlines[p.id]||'';return '<div class="item"><div class="iname">'+esc(p.name)+'</div>'+(p.unit?'<div class="unit">Unit: '+esc(p.unit)+'</div>':'')+
  '<div class="fields"><div class="field"><span>Qty received</span><div class="step"><button data-rid="'+p.id+'" data-d="-1">−</button><input inputmode="numeric" data-rid="'+p.id+'" value="'+v+'"><button class="plus" data-rid="'+p.id+'" data-d="1">+</button></div></div></div></div>'}).join('')}
$('rcvitems').addEventListener('click',function(e){var b=e.target.closest('button[data-d]');if(!b)return;var n=Math.max(0,(rlines[b.dataset.rid]||0)+parseInt(b.dataset.d,10));rlines[b.dataset.rid]=n;b.parentNode.querySelector('input').value=n||''});
$('rcvitems').addEventListener('input',function(e){var i=e.target;if(!i.dataset.rid)return;i.value=i.value.replace(/\D/g,'');rlines[i.dataset.rid]=parseInt(i.value,10)||0});
$('saverecv').onclick=function(){var items=w2prods().filter(function(p){return rlines[p.id]>0}).map(function(p){return{product_id:p.id,name:p.name,unit:p.unit||'',qty:rlines[p.id]}});
  if(!items.length){toast('Tap + on at least one product');return}var who=$('rcvwho').value.trim();if(!who){toast('Enter who received it');return}
  var b=this;b.disabled=true;api('saveReceipt',{items:items,ref_number:$('rcvref').value.trim(),expected_id:expId,received_by:who,received_at:$('rcvwhen').value?new Date($('rcvwhen').value).toISOString():'',note:$('rcvnote').value.trim()})
   .then(function(){rlines={};expId='';renderRecv();$('rcvref').value='';$('rcvnote').value='';toast('Delivery received ✓');return refresh()}).catch(function(e){toast('Save failed: '+e.message)}).then(function(){b.disabled=false})};
var expId='';
function renderExp(){var ex=receipts.filter(function(r){return r.status==='expected'});$('rcvexp').innerHTML=ex.map(function(r){return '<div class="card exp"><span class="badge confirm">EXPECTED - NOT RECEIVED</span><ul>'+r.items.map(function(i){return '<li>'+esc(i.expected||i.qty)+' × '+esc(i.name)+'</li>'}).join('')+'</ul><div class="inote">'+esc(r.note)+'</div><button class="btn teal big" data-exp="'+esc(r.id)+'">It arrived: receive this</button></div>'}).join('')}
$('rcvexp').addEventListener('click',function(e){var b=e.target.closest('[data-exp]');if(!b)return;var r=receipts.filter(function(x){return x.id===b.dataset.exp})[0];expId=r.id;rlines={};r.items.forEach(function(i){rlines[i.product_id]=+i.qty||0});renderRecv();toast('Enter the actual case counts');$('rcvitems').scrollIntoView()});
function renderRcvList(){renderExp();var rec=receipts.filter(function(r){return (r.status||'received')==='received'});$('rcvlist').innerHTML=rec.length?rec.slice().reverse().map(function(r){return '<div class="card"><b>'+esc(fmt(r.received_at))+'</b> · by '+esc(r.received_by)+(r.ref_number?' · #'+esc(r.ref_number):'')+(r.kind==='return'?' <span class="badge prior">RETURN</span>':'')+
  '<ul>'+(r.items||[]).map(function(i){return '<li><b>'+i.qty+'</b> × '+esc(i.name)+'</li>'}).join('')+'</ul>'+(r.note?'<div class="inote">'+esc(r.note)+'</div>':'')+'</div>'}).join(''):'<p class="muted">No SB deliveries logged yet.</p>'}
$('rsw').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;$('rsw').querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});$('recvpane').hidden=b.dataset.r!=='recv';$('balpane').hidden=b.dataset.r!=='bal';renderBal()});
function renderBal(){var rin={},out={},opn={},unk=[],unconf={};
  receipts.filter(function(r){return (r.status||'received')==='received'}).forEach(function(r){(r.items||[]).forEach(function(i){rin[i.product_id]=(rin[i.product_id]||0)+(+i.qty||0)})});
  orders.filter(function(o){return o.source_warehouse==='W2'&&!o.included_in}).forEach(function(o){(o.items||[]).forEach(function(i){var q=+(i.shipped!=null&&i.shipped!==''?i.shipped:i.qty)||0;
    if(!i.product_id){unk.push(i);return}if(i.needs_confirm)unconf[i.product_id]=(unconf[i.product_id]?unconf[i.product_id]+', ':'')+q+' cs "'+(i.owner_wording||'')+'"';var m=(o.status==='open')?opn:out;m[i.product_id]=(m[i.product_id]||0)+q})});
  var rows=w2prods().map(function(p){var r=rin[p.id]||0,o=out[p.id]||0,c=latestCounts[p.id],net=r-o;
    var cf=unconf[p.id];return '<tr><td>'+esc(p.name)+(cf?'<div class="inote"><span class="badge confirm">UNCONFIRMED</span> incl. '+cf+'</div>':'')+(opn[p.id]?'<div class="inote">'+qtyU(opn[p.id],'case')+' more on open orders</div>':'')+'</td><td>'+r+'</td><td>'+o+'</td><td class="'+(net<0?'neg':'')+'">'+(net>0?'+':'')+net+'</td><td>'+(c?esc(c.on_hand)+'<div class="inote">'+esc(fmt(c.timestamp))+'</div>':(p.last_known?'<span class="lastk">'+esc(p.last_known)+' (Oct 12)</span>':'–'))+'</td></tr>'}).join('');
  $('bal').innerHTML='<div class="card" style="padding:6px"><table class="bal"><tr><th>W2 product</th><th>In (cs)</th><th>Out (cs)</th><th>Net (cs)</th><th>Last count</th></tr>'+rows+'</table></div>'+
   (unk.length?'<div class="card"><b>Pulled, product not confirmed</b> (not in the table above - Justin to confirm):<ul>'+unk.map(function(i){return '<li><b>'+qtyU(i.qty,'case')+'</b> × "'+esc(i.owner_wording||i.name)+'"'+(i.mapping_note?'<div class="inote">'+esc(i.mapping_note)+'</div>':'')+'</li>'}).join('')+'</ul></div>':'')+
   (receipts.some(function(r){return r.status==='expected'})?'<p class="muted"><b>Expected (not counted above):</b> '+receipts.filter(function(r){return r.status==='expected'}).map(function(r){return esc(r.items_summary)}).join('; ')+'</p>':'')+'<p class="muted">In = SB deliveries logged on Receive. Out = loaded/delivered/recorded orders from Warehouse 2 (each one = an SB invoice). Net = In − Out. Warehouse 2 is cases only. Negative net is expected until the opening stock and earlier SB deliveries are logged.</p>'}

// ---------- boot ----------
$('demo').hidden=!DEMO;$('ddate').value=today();
fetch('products.json?v=20261014d').then(function(r){return r.json()}).then(function(j){GROUPS=j.groups;PRODUCTS=j.products;WH=j.warehouses;SEEDS=j.seed_orders||[];EXPECTED=j.expected_receipts||[];PRODUCTS.forEach(function(p){BYID[p.id]=p});
  renderCounters();renderWh();renderDest();renderLines();
  if(!DEMO&&!LS.get('pin',''))askPin();else refresh();
}).catch(function(e){toast('Could not load products: '+e.message)});
})();
