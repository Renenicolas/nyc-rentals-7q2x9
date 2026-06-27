/* NYC Rentals Dashboard - app logic */
(function () {
  "use strict";

  var DATA = window.RENTAL_DATA || { listings: [], brokers: {}, criteria: {} };
  function isOwner(){return DATA.mode==="owner"||sessionStorage.getItem("nycRentalsMode")==="owner";}

  var LS_KEY = "nycRentalsState_v1";

  function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveState(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  var state = loadState();
  state.byId = state.byId || {}; state.everSeen = state.everSeen || [];
  if (!state.firstVisit) state.firstVisit = new Date().toISOString();
  function ov(id) { return state.byId[id] || (state.byId[id] = {}); }
  function persist() { saveState(state); }

  function listings() {
    return DATA.listings.filter(function (l) { return !l.offMarket; }).map(function (l) {
      var o = state.byId[l.id] || {};
      var starred = o.liked != null ? !!o.liked : !!l.starred;
      return Object.assign({}, l, {
        status: o.status || l.status, contacted: o.contacted != null ? o.contacted : l.contacted,
        contactedDate: o.contactedDate || l.contactedDate, showing: o.showing || null,
        note: o.note || l.notes || "", passed: !!o.passed, starred: starred,
        isNew: state.everSeen.indexOf(l.id) === -1 && !l.offMarket,
      });
    });
  }

  var ui = { q:"", hood:"all", status:"all", beds:"all", minP:"", maxP:"", sort:"starred" };
  var SRC_META = { streeteasy:"StreetEasy", renthop:"RentHop", craigslist:"Craigslist", zillow:"Zillow", apartments:"Apartments.com" };
  var SOURCE_ORDER = ["streeteasy","zillow","renthop","apartments","craigslist"];
  var SRC_LABEL = { streeteasy:"\uD83C\uDFE2 StreetEasy", zillow:"\uD83C\uDFE2 Zillow", renthop:"\uD83C\uDFE2 RentHop", apartments:"\uD83C\uDFE2 Apartments.com", craigslist:"\uD83D\uDCCC Craigslist" };
  var SRC_NOTE = { streeteasy:"Most reliable for NYC", zillow:"Highly reliable", renthop:"Reliable aggregator", apartments:"Aggregator", craigslist:"By-owner \u2014 verify carefully" };
  var MODE = DATA.mode || "owner"; var OWNER = MODE === "owner";

  function fmt$(n) { return n == null ? "--" : "$" + n.toLocaleString(); }
  function esc(s) { return (s||"").replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  var STATUS_META = {
    new:{label:"New",cls:"s-new"}, seen:{label:"Seen",cls:"s-seen"}, contacted:{label:"Contacted",cls:"s-contacted"},
    showing_scheduled:{label:"Showing booked",cls:"s-showing"}, in_negotiation:{label:"In negotiation",cls:"s-showing"},
    toured:{label:"Toured",cls:"s-toured"}, applied:{label:"Applied",cls:"s-applied"},
    passed:{label:"Passed",cls:"s-passed"}, off_market:{label:"Off-market",cls:"s-off"},
  };

  function apply(list) {
    var q = ui.q.toLowerCase();
    return list.filter(function (l) {
      if (l.offMarket) return false;
      if (ui.hood !== "all" && l.neighborhood !== ui.hood) return false;
      if (ui.status === "new" && !l.isNew) return false;
      else if (ui.status === "contacted" && !l.contacted) return false;
      else if (ui.status === "passed" && !l.passed) return false;
      else if (ui.status === "showing" && l.status !== "showing_scheduled") return false;
      else if (ui.status === "available" && (l.offMarket || l.contacted)) return false;
      else if (ui.status === "starred" && !l.starred) return false;
      if (ui.beds !== "all" && String(l.beds) !== ui.beds && !(ui.beds === "5" && l.beds >= 5)) return false;
      if (ui.minP && (l.priceNum == null || l.priceNum < +ui.minP)) return false;
      if (ui.maxP && (l.priceNum == null || l.priceNum > +ui.maxP)) return false;
      if (q) { var hay=(l.building+" "+(l.unit||"")+" "+l.neighborhood+" "+(l.amenities||[]).join(" ")+" "+(l.inUnitAmenities||[]).join(" ")+" "+(l.buildingAmenities||[]).join(" ")).toLowerCase(); if(hay.indexOf(q)===-1)return false; }
      return true;
    });
  }

  function sortList(list) {
    var s = ui.sort;
    function sf(a,b){return(b.starred?1:0)-(a.starred?1:0);}
    return list.slice().sort(function(a,b){
      var d=sf(a,b);
      if(s==="starred")return d||(a.priceNum||1e9)-(b.priceNum||1e9);
      if(s==="price_asc")return d||(a.priceNum||1e9)-(b.priceNum||1e9);
      if(s==="price_desc")return d||(b.priceNum||-1)-(a.priceNum||-1);
      if(s==="new")return d||(b.isNew?1:0)-(a.isNew?1:0);
      if(s==="beds")return d||(b.beds||0)-(a.beds||0);
      if(s==="source"){var ia=SOURCE_ORDER.indexOf(a.source),ib=SOURCE_ORDER.indexOf(b.source);if(ia<0)ia=99;if(ib<0)ib=99;return d||ia-ib||(a.priceNum||1e9)-(b.priceNum||1e9);}
      return d||(a.neighborhood||"").localeCompare(b.neighborhood||"")||(a.priceNum||0)-(b.priceNum||0);
    });
  }

  function amenRow(items,cls,icon){
    if(!items||!items.length)return"";
    return'<div class="amen-row"><span class="amen-icon">'+icon+'</span>'+items.slice(0,7).map(function(a){return'<span class="chip '+cls+'">'+esc(a)+'</span>';}).join("")+'</div>';
  }
  function transitHtml(l){
    var t=l.transit;if(!t)return"";
    var parts=[];
    if(t.sixTrain)parts.push('<span class="ts"><span class="tline t6">6</span>'+esc(t.sixTrain.station)+' <span class="tw">'+t.sixTrain.walkMin+'min</span></span>');
    (t.other||[]).forEach(function(o){parts.push('<span class="ts"><span class="tline">'+esc(o.line)+'</span>'+esc(o.station)+' <span class="tw">'+o.walkMin+'min</span></span>');});
    return parts.length?'<div class="transit-row">'+parts.join('')+'</div>':"";
  }
  function groceryHtml(l){
    var g=l.grocery;if(!g||!g.length)return"";
    var parts=g.slice(0,2).map(function(x){return'<span class="gi">\uD83D\uDED2 '+esc(x.name)+' <span class="tw">'+x.walkMin+'min</span></span>';});
    return'<div class="grocery-row">'+parts.join('')+'</div>';
  }

  function card(l){
    var sm=STATUS_META[isOwner()?l.status:(l.isNew?"new":"seen")]||STATUS_META.seen;
    var photo=l.photo?'<div class="ph" style="background-image:url(\''+esc(l.photo)+'\')"></div>':'<div class="ph noph">No photo</div>';
    var pp=l.perPerson4?'<span class="pp">'+fmt$(l.perPerson4)+'/person (÷4)</span>':"";
    var brokerHtml=(l.broker&&isOwner())?'<div class="broker">'+esc(l.broker.name)+" · "+esc(l.broker.company||"")+"</div>":"";
    var newBadge=l.isNew?'<span class="newbadge">NEW</span>':"";
    var srcBadge='<span class="srcbadge src-'+l.source+'">'+(SRC_META[l.source]||l.source)+'</span>';
    var zillowLink=l.zillowUrl?'<a class="z-link" href="'+esc(l.zillowUrl)+'" target="_blank" rel="noopener" title="Also on Zillow">Z</a>':"";
    var starBtn='<button class="star-btn'+(l.starred?" starred":"")+'" data-act="star">'+(l.starred?"★":"☆")+'</button>';
    var showHtml=(l.showing&&isOwner())?'<div class="showing">Showing: '+esc(l.showing)+"</div>":"";
    var noteHtml=(l.note&&isOwner())?'<div class="note">'+esc(l.note)+"</div>":"";
    var inUnit=l.inUnitAmenities||[];var bldg=l.buildingAmenities||[];
    if(!inUnit.length&&!bldg.length){inUnit=l.amenities||[];}
    var inUnitHtml=amenRow(inUnit,"chip-unit","\uD83C\uDFE0 In-unit");
    var bldgHtml=amenRow(bldg,"chip-bldg","\uD83C\uDFE2 Building");
    var tHtml=transitHtml(l); var gHtml=groceryHtml(l);
    return'<div class="card'+(l.offMarket?" off":"")+(l.starred?" is-starred":"")+'" data-id="'+l.id+'">'+
      photo+newBadge+srcBadge+
      '<div class="body">'+
      '<div class="row1"><span class="price">'+fmt$(l.priceNum)+"</span>"+pp+"</div>"+
      '<div class="addr">'+esc(l.building)+(l.unit?" #"+esc(l.unit):"")+zillowLink+"</div>"+
      '<div class="meta">'+esc(l.neighborhood)+" · "+(l.beds||"?")+" bd / "+(l.baths||"?")+" ba"+(l.sqft?" · "+l.sqft+" ft²":"")+" · Aug 2026</div>"+
      '<div class="card-top-row"><div class="badges"><span class="badge '+sm.cls+'">'+sm.label+'</span>'+(l.starred?'<span class="badge s-star">⭐ Starred</span>':'')+'</div><button class="star-btn'+(l.starred?' starred':'')+'" data-act="star"><span class="star-icon">'+(l.starred?'★':'☆')+'</span><span class="star-lbl">'+(l.starred?'Starred':'Star')+'</span></button></div>'+
      (inUnitHtml||bldgHtml?'<div class="amen-section">'+inUnitHtml+bldgHtml+"</div>":"")+
      tHtml+gHtml+
      (isOwner()?brokerHtml+showHtml+noteHtml:"")+
      '<div class="actions">'+
      '<a class="btn view" href="'+esc(l.url)+'" target="_blank" rel="noopener">View</a>'+
      (isOwner()?'<button class="btn act" data-act="contact">Contact</button><button class="btn act" data-act="showing">Showing</button><button class="btn act" data-act="note">Note</button>':"")+
      '<button class="btn act'+(l.passed?" on":"")+'" data-act="pass">'+(l.passed?"Hidden":"Hide")+"</button>"+
      "</div></div></div>";
  }

  function render(){
    var all=listings(); var filtered=sortList(apply(all));
    var live=all.filter(function(l){return!l.offMarket;});
    document.getElementById("stats").innerHTML=
      stat(live.length,"Live")+
      stat(all.filter(function(l){return l.starred;}).length,"Starred","s-star")+
      stat(all.filter(function(l){return l.isNew;}).length,"New","s-new")+
      (isOwner()?stat(all.filter(function(l){return l.contacted;}).length,"Contacted","s-contacted"):"")+
      (isOwner()?stat(all.filter(function(l){return l.status==="showing_scheduled"||l.status==="in_negotiation";}).length,"Active","s-showing"):"")+
      stat((DATA.archived||[]).length,"Archived","s-off");

    var host=document.getElementById("grid");
    if(!filtered.length){host.innerHTML='<div class="empty">No listings match.</div>';return;}

    var starred4=filtered.filter(function(l){return l.starred;});
    var rest4=filtered.filter(function(l){return!l.starred;});
    var starHtml=starred4.length?'<section class="hood starred-sec"><h2>\u2B50 Starred \u2014 Top Picks <span class="cnt">'+starred4.length+'</span></h2><div class="cards">'+starred4.map(card).join("")+"</div></section>":"";

    if(ui.sort==="hood"||ui.sort==="source"){
      var bySource=ui.sort==="source"; var groups={};
      rest4.forEach(function(l){var k=bySource?l.source:l.neighborhood;(groups[k]=groups[k]||[]).push(l);});
      var keys2=Object.keys(groups).sort(function(a,b){if(bySource){var ia=SOURCE_ORDER.indexOf(a),ib=SOURCE_ORDER.indexOf(b);return(ia<0?99:ia)-(ib<0?99:ib);}return a.localeCompare(b);});
      host.innerHTML=starHtml+keys2.map(function(k){
        var title=bySource?(SRC_LABEL[k]||k):esc(k);
        var note=bySource&&SRC_NOTE[k]?'<span class="srcnote">'+SRC_NOTE[k]+"</span>":"";
        return'<section class="hood"><h2>'+title+' <span class="cnt">'+groups[k].length+"</span>"+note+"</h2>"+'<div class="cards">'+groups[k].map(card).join("")+"</div></section>";
      }).join("");
    } else {
      host.innerHTML=starHtml+(rest4.length?'<div class="cards">'+rest4.map(card).join("")+"</div>":"");
    }
  }

  function stat(n,label,cls){return'<div class="statbox '+(cls||"")+'"><div class="n">'+n+'</div><div class="l">'+label+"</div></div>";}

  function hoodOptions(){
    var set={};DATA.listings.forEach(function(l){set[l.neighborhood]=(set[l.neighborhood]||0)+1;});
    var opts=['<option value="all">All neighborhoods</option>'];
    Object.keys(set).sort().forEach(function(k){opts.push('<option value="'+esc(k)+'">'+esc(k)+" ("+set[k]+")</option>");});
    return opts.join("");
  }

  var TEMPLATE="Hi! Is there any way we can do a virtual tour? We're a group of 4 (can be 5 if flex) and our budget is absolute max $12k/month for 4. We all have very qualified guarantors. Is there any wiggle room on the price or other units that fit our budget with a similar look or location? Thanks! Best regards, Rene Nicolas";

  function doContact(l){navigator.clipboard&&navigator.clipboard.writeText(TEMPLATE);var o=ov(l.id);o.contacted=true;o.status="contacted";o.contactedDate=new Date().toISOString().slice(0,10);persist();window.open(l.url,"_blank","noopener");toast("Inquiry template copied + listing opened.");markSeen(l.id);render();}
  function doShowing(l){var v=prompt("Showing for "+l.building+(l.unit?" #"+l.unit:"")+":",l.showing||"");if(v==null)return;var o=ov(l.id);o.showing=v.trim();o.status=v.trim()?"showing_scheduled":o.status;persist();render();}
  function doNote(l){var v=prompt("Note for "+l.building+":",l.note||"");if(v==null)return;ov(l.id).note=v.trim();persist();render();}
  function doPass(l){var o=ov(l.id);o.passed=!o.passed;o.status=o.passed?"passed":"seen";persist();render();}
  function doStar(l){var o=ov(l.id);o.liked=!l.starred;persist();toast(o.liked?"\u2B50 Starred! Floated to top.":"Star removed.");render();}
  function doLogout(){var K="nycRentalsAuth";sessionStorage.removeItem(K);localStorage.removeItem(K);location.reload();}
  function markSeen(id){if(state.everSeen.indexOf(id)===-1){state.everSeen.push(id);persist();}}
  function toast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove("show");},2600);}

  function bind(){
    document.getElementById("hoodSel").innerHTML=hoodOptions();
    document.getElementById("gen").textContent=(isOwner()?"\uD83D\uDD12 Private \u00b7 ":"\uD83D\uDC65 Shared \u00b7 ")+"Updated "+new Date(DATA.generatedAt).toLocaleString();
    var c=DATA.criteria||{};
    document.getElementById("crit").textContent=(c.beds||"")+" · "+(c.budgetTotal||"")+" · "+(c.moveIn||"");
    document.getElementById("q").addEventListener("input",function(e){ui.q=e.target.value;render();});
    document.getElementById("hoodSel").addEventListener("change",function(e){ui.hood=e.target.value;render();});
    document.getElementById("statusSel").addEventListener("change",function(e){ui.status=e.target.value;render();});
    document.getElementById("bedsSel").addEventListener("change",function(e){ui.beds=e.target.value;render();});
    document.getElementById("sortSel").addEventListener("change",function(e){ui.sort=e.target.value;render();});
    document.getElementById("minP").addEventListener("input",function(e){ui.minP=e.target.value;render();});
    document.getElementById("maxP").addEventListener("input",function(e){ui.maxP=e.target.value;render();});
    document.getElementById("markAll").addEventListener("click",function(){listings().forEach(function(l){markSeen(l.id);});render();toast("All marked as seen.");});
    var lBtn=document.getElementById("logoutBtn");if(lBtn)lBtn.addEventListener("click",doLogout);
    document.getElementById("export").addEventListener("click",exportCsv);
    document.getElementById("toursBtn").addEventListener("click",openTours);
    var cBtn=document.getElementById("contactsBtn");
    if(isOwner()&&(DATA.contacts||[]).length){cBtn.style.display="";cBtn.addEventListener("click",openContacts);}
    var mBtn=document.getElementById("messagesBtn");
    if(isOwner()&&(DATA.threads||[]).length){mBtn.style.display="";mBtn.addEventListener("click",openMessages);}
    document.getElementById("modalClose").addEventListener("click",closeModal);
    document.getElementById("modal").addEventListener("click",function(e){if(e.target.id==="modal")closeModal();});
    document.getElementById("grid").addEventListener("click",function(e){
      var btn=e.target.closest("[data-act]");if(!btn)return;
      var cardEl=e.target.closest(".card");if(!cardEl)return;
      var id=cardEl.getAttribute("data-id");
      var l=listings().find(function(x){return x.id===id;});if(!l)return;
      var act=btn.getAttribute("data-act");
      if(act==="star")doStar(l);else if(act==="contact")doContact(l);else if(act==="showing")doShowing(l);else if(act==="note")doNote(l);else if(act==="pass")doPass(l);
    });
    document.getElementById("grid").addEventListener("click",function(e){
      var a=e.target.closest("a.view");if(!a)return;
      var cardEl=e.target.closest(".card");if(!cardEl)return;
      markSeen(cardEl.getAttribute("data-id"));setTimeout(render,50);
    });
  }

  function closeModal(){document.getElementById("modal").classList.remove("open");}
  function openModal(title,html){document.getElementById("modalTitle").textContent=title;document.getElementById("modalBody").innerHTML=html;document.getElementById("modal").classList.add("open");}
  function dayLabel(d){var dt=new Date(d+"T12:00:00");var today=new Date().toISOString().slice(0,10);var tmr=new Date(Date.now()+86400000).toISOString().slice(0,10);var lbl=dt.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});if(d===today)lbl+=' <span class="daytag today">TODAY</span>';else if(d===tmr)lbl+=' <span class="daytag">TOMORROW</span>';return lbl;}
  function tourRow(t){
    var vid=t.video?'<a href="'+esc((t.video.split(" ")[0])||t.video)+'" target="_blank" rel="noopener">\u25B6 Watch video</a> ':"";
    var star=t.priority?' <span class="tour-star">\u2B50</span>':"";
    return'<div class="tour'+(t.priority?" prio":"")+'"><div class="when">'+esc(t.time||"By appt")+star+'</div>'+
      '<div><div class="ta">'+esc(t.addr)+'<span class="ttype">'+esc(t.type)+'</span></div>'+
      '<div class="tmeta">'+esc(t.neighborhood||"")+(t.note?" \u00b7 "+esc(t.note):"")+'</div>'+vid+'</div></div>';
  }
  function openTours(){
    var tours=DATA.tours||[];if(!tours.length){openModal("\uD83D\uDCC5 Tours",'<p class="cmut">No tours yet.</p>');return;}
    var dated=tours.filter(function(t){return t.date;}).sort(function(a,b){return a.date.localeCompare(b.date)||(a.sortMin||0)-(b.sortMin||0);});
    var undated=tours.filter(function(t){return!t.date;}).sort(function(a,b){return(b.priority?1:0)-(a.priority?1:0);});
    var byDay={};dated.forEach(function(t){(byDay[t.date]=byDay[t.date]||[]).push(t);});
    var html=Object.keys(byDay).sort().map(function(d){return'<div class="dayhdr">'+dayLabel(d)+'</div>'+byDay[d].map(tourRow).join("");}).join("");
    if(undated.length)html+='<div class="dayhdr">By appointment / pending schedule</div>'+undated.map(tourRow).join("");
    openModal("\uD83D\uDCC5 Apartment Tours ("+tours.length+")",html);
  }
  function openMessages(){
    var thr=DATA.threads||[];
    var order={"awaiting your reply":0,"in negotiation":1,"awaiting broker":2};
    thr=thr.slice().sort(function(a,b){return(order[a.status]||9)-(order[b.status]||9);});
    var statCls=function(s){return/negotiation/.test(s)?"stat-neg":/your reply/.test(s)?"stat-reply":"stat-wait";};
    var html=thr.map(function(t,i){
      var msgs=(t.msgs||[]).map(function(m){return'<div class="msg '+m.from+'"><span class="who">'+(m.from==="me"?"You":esc(t.broker||"Broker"))+" \u00b7 "+esc(m.date||"")+'</span><div>'+esc(m.text)+'</div></div>';}).join("");
      var rid="reply"+i;
      return'<div class="thr"><div class="thr-head"><div><span class="ta">'+esc(t.addr)+'</span> <span class="tb">'+esc(t.broker||"")+" \u00b7 "+esc(t.channel)+'</span></div><span class="stat '+statCls(t.status)+'">'+esc(t.status)+'</span></div>'+
        msgs+'<div class="reply"><div class="rl">\u2728 Suggested reply</div><div class="rt" id="'+rid+'">'+esc(t.suggestedReply)+'</div><button class="copy" data-copy="'+rid+'">Copy reply</button></div></div>';
    }).join("");
    openModal("\uD83D\uDCAC Broker Messages ("+thr.length+") \u2014 private",html);
    document.getElementById("modalBody").addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var txt=document.getElementById(b.getAttribute("data-copy")).textContent;navigator.clipboard&&navigator.clipboard.writeText(txt);b.textContent="Copied \u2713";setTimeout(function(){b.textContent="Copy reply";},1500);});
  }
  function openContacts(){
    var cs=DATA.contacts||[];
    var statCls=function(s){return/negotiation/.test(s)?"stat-neg":/your reply/.test(s)?"stat-reply":"stat-wait";};
    var html='<div class="ct" style="font-weight:700;color:#cfd6e4"><div>Broker</div><div>Company</div><div>Phone</div><div>Listings / Status</div></div>'+
      cs.map(function(c){return'<div class="ct"><div class="cn">'+esc(c.name||"?")+'<div class="cmut">'+esc(c.channel)+'</div></div><div>'+esc(c.company||"")+'</div><div>'+(c.phone?'<a href="tel:'+esc(c.phone.replace(/[^\d+]/g,""))+'">'+esc(c.phone)+'</a>':'<span class="cmut">\u2014</span>')+'<div class="cmut">'+esc(c.email||"")+'</div></div><div><div class="cmut">'+esc((c.listings||[]).join(", "))+'</div><span class="stat '+statCls(c.status)+'">'+esc(c.status)+'</span></div></div>';}).join("");
    openModal("\uD83D\uDCC7 Broker Contacts ("+cs.length+") \u2014 private",html);
  }
  function exportCsv(){
    var rows=[["Building","Unit","Neighborhood","Price","Beds","Baths","Starred","Status","Contacted","Showing","URL"]];
    listings().forEach(function(l){rows.push([l.building,l.unit,l.neighborhood,l.priceNum||"",l.beds||"",l.baths||"",l.starred?"yes":"",l.status,l.contacted?"yes":"",l.showing||"",l.url]);});
    var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    var a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="nyc-rentals-"+new Date().toISOString().slice(0,10)+".csv";a.click();
  }


  // ---- Owner mode: event-driven decrypt ----
  function mergePrivData(priv) {
    DATA.contacts = priv.contacts || [];
    DATA.threads = priv.threads || [];
    DATA.brokers = priv.brokers || {};
    DATA.mode = "owner";
    var lp = priv.listingPrivate || {};
    DATA.listings = DATA.listings.map(function(l){
      var p = lp[l.id]; if(!p) return l;
      return Object.assign({},l,{contacted:p.contacted,contactedDate:p.contactedDate,broker:p.broker,notes:p.notes||"",messages:p.messages||[],status:p.status||l.status,showings:p.showings||[]});
    });
    var cBtn=document.getElementById("contactsBtn");
    if(cBtn&&DATA.contacts.length){
      cBtn.style.display="";
      cBtn.replaceWith(cBtn.cloneNode(true)); // remove stale listeners
      var cBtn2=document.getElementById("contactsBtn");
      cBtn2.style.display="";
      cBtn2.addEventListener("click",openContacts);
    }
    var mBtn=document.getElementById("messagesBtn");
    if(mBtn&&DATA.threads.length){
      mBtn.style.display="";
      mBtn.replaceWith(mBtn.cloneNode(true));
      var mBtn2=document.getElementById("messagesBtn");
      mBtn2.style.display="";
      mBtn2.addEventListener("click",openMessages);
    }
    var lBtn2=document.getElementById("logoutBtn");
    if(lBtn2){lBtn2.replaceWith(lBtn2.cloneNode(true));document.getElementById("logoutBtn").addEventListener("click",doLogout);}
    var gen=document.getElementById("gen");
    if(gen)gen.textContent="🔒 Private · Updated "+new Date(DATA.generatedAt).toLocaleString();
    render();
  }

  document.addEventListener("nycOwnerUnlock",function(e){
    var pw=e.detail&&e.detail.pw; if(!pw||!DATA.privateEncrypted)return;
    var enc=DATA.privateEncrypted;
    var b64=function(s){var b=atob(s);var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;};
    crypto.subtle.importKey("raw",new TextEncoder().encode(pw),{name:"PBKDF2"},false,["deriveKey"])
      .then(function(km){return crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(enc.salt),iterations:100000,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["decrypt"]);})
      .then(function(key){return crypto.subtle.decrypt({name:"AES-GCM",iv:b64(enc.iv)},key,b64(enc.data));})
      .then(function(plain){
        var priv=JSON.parse(new TextDecoder().decode(plain));
        try{sessionStorage.setItem("nycPrivData",JSON.stringify(priv));}catch(e){}
        mergePrivData(priv);
      })
      .catch(function(err){console.error("Decrypt error:",err);});
  });

  document.addEventListener("nycPrivDataReady",function(e){
    try{if(e.detail&&e.detail.cached)mergePrivData(JSON.parse(e.detail.cached));}catch(ex){console.error(ex);}
  });

  bind(); render();
})();