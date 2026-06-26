/* NYC Rentals Dashboard - app logic */
(function () {
  "use strict";

  var DATA = window.RENTAL_DATA || { listings: [], brokers: {}, criteria: {} };
  var LS_KEY = "nycRentalsState_v1";

  // ---------- persistence ----------
  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveState(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  var state = loadState();
  state.byId = state.byId || {};       // per-listing user overrides
  state.everSeen = state.everSeen || []; // ids the user has ever viewed
  if (!state.firstVisit) state.firstVisit = new Date().toISOString();

  function ov(id) { return state.byId[id] || (state.byId[id] = {}); }
  function persist() { saveState(state); }

  // ---------- merge data + overrides ----------
  function listings() {
    return DATA.listings.filter(function (l) { return !l.offMarket; }).map(function (l) {
      var o = state.byId[l.id] || {};
      var status = o.status || l.status;
      var contacted = o.contacted != null ? o.contacted : l.contacted;
      return Object.assign({}, l, {
        status: status,
        contacted: contacted,
        contactedDate: o.contactedDate || l.contactedDate,
        showing: o.showing || null,
        note: o.note || l.notes || "",
        passed: !!o.passed,
        isNew: state.everSeen.indexOf(l.id) === -1 && !l.offMarket,
      });
    });
  }

  // ---------- UI state ----------
  var ui = {
    q: "", hood: "all", status: "all", beds: "all",
    minP: "", maxP: "", sort: "hood", view: "grouped",
  };

  var SRC_META = { streeteasy: "StreetEasy", renthop: "RentHop", craigslist: "Craigslist" };
  var MODE = DATA.mode || "owner"; // "owner" = full private view; "shared" = roommates, listings only
  var OWNER = MODE === "owner";

  // ---------- helpers ----------
  function fmt$(n) { return n == null ? "--" : "$" + n.toLocaleString(); }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var STATUS_META = {
    new: { label: "New", cls: "s-new" },
    seen: { label: "Seen", cls: "s-seen" },
    contacted: { label: "Contacted", cls: "s-contacted" },
    showing_scheduled: { label: "Showing booked", cls: "s-showing" },
    toured: { label: "Toured", cls: "s-toured" },
    applied: { label: "Applied", cls: "s-applied" },
    passed: { label: "Passed", cls: "s-passed" },
    off_market: { label: "Off-market", cls: "s-off" },
  };

  // ---------- filtering ----------
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
      if (ui.beds !== "all" && String(l.beds) !== ui.beds && !(ui.beds === "5" && l.beds >= 5)) return false;
      if (ui.minP && (l.priceNum == null || l.priceNum < +ui.minP)) return false;
      if (ui.maxP && (l.priceNum == null || l.priceNum > +ui.maxP)) return false;
      if (q) {
        var hay = (l.building + " " + l.unit + " " + l.neighborhood + " " + (l.amenities || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortList(list) {
    var s = ui.sort;
    return list.slice().sort(function (a, b) {
      if (s === "price_asc") return (a.priceNum || 1e9) - (b.priceNum || 1e9);
      if (s === "price_desc") return (b.priceNum || -1) - (a.priceNum || -1);
      if (s === "new") return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      if (s === "beds") return (b.beds || 0) - (a.beds || 0);
      return a.neighborhood.localeCompare(b.neighborhood) || (a.priceNum || 0) - (b.priceNum || 0);
    });
  }

  // ---------- rendering ----------
  function card(l) {
    var sm = STATUS_META[OWNER ? l.status : (l.isNew ? "new" : "seen")] || STATUS_META.seen;
    var photo = l.photo ? '<div class="ph" style="background-image:url(\'' + esc(l.photo) + '\')"></div>'
      : '<div class="ph noph">No photo</div>';
    var pp = l.perPerson4 ? '<span class="pp">' + fmt$(l.perPerson4) + '/person (÷4)</span>' : "";
    var amen = (l.amenities || []).slice(0, 6).map(function (a) { return '<span class="chip">' + esc(a) + "</span>"; }).join("");
    var brokerHtml = "";
    if (l.broker) brokerHtml = '<div class="broker">' + esc(l.broker.name) + " · " + esc(l.broker.company || "") + "</div>";
    var newBadge = l.isNew ? '<span class="newbadge">NEW</span>' : "";
    var srcBadge = '<span class="srcbadge src-' + l.source + '">' + (SRC_META[l.source] || l.source) + '</span>';
    var offCls = l.offMarket ? " off" : "";
    var showHtml = l.showing ? '<div class="showing">Showing: ' + esc(l.showing) + "</div>" : "";
    var noteHtml = l.note ? '<div class="note">' + esc(l.note) + "</div>" : "";
    return '' +
      '<div class="card' + offCls + '" data-id="' + l.id + '">' +
      photo + newBadge + srcBadge +
      '<div class="body">' +
      '<div class="row1"><span class="price">' + fmt$(l.priceNum) + "</span>" + pp + "</div>" +
      '<div class="addr">' + esc(l.building) + (l.unit ? " #" + esc(l.unit) : "") + "</div>" +
      '<div class="meta">' + esc(l.neighborhood) + ' · ' + (l.beds || "?") + " bd / " + (l.baths || "?") + " ba" + (l.sqft ? " · " + l.sqft + " ft²" : "") + "</div>" +
      '<div class="badges"><span class="badge ' + sm.cls + '">' + sm.label + "</span>" + (l.offMarket ? '<span class="badge s-off">Off-market</span>' : "") + "</div>" +
      (amen ? '<div class="chips">' + amen + "</div>" : "") +
      (OWNER ? (brokerHtml + showHtml + noteHtml) : "") +
      '<div class="actions">' +
      '<a class="btn view" href="' + esc(l.url) + '" target="_blank" rel="noopener">View</a>' +
      (OWNER ?
        ('<button class="btn act" data-act="contact">Contact</button>' +
         '<button class="btn act" data-act="showing">Showing</button>' +
         '<button class="btn act" data-act="note">Note</button>') : "") +
      '<button class="btn act ' + (l.passed ? "on" : "") + '" data-act="pass">' + (l.passed ? "Hidden" : "Hide") + "</button>" +
      "</div>" +
      "</div></div>";
  }

  function render() {
    var all = listings();
    var filtered = sortList(apply(all));
    // stats
    var live = all.filter(function (l) { return !l.offMarket; });
    document.getElementById("stats").innerHTML =
      stat(live.length, "Live") +
      stat(all.filter(function (l) { return l.isNew; }).length, "New", "s-new") +
      (OWNER ? stat(all.filter(function (l) { return l.contacted; }).length, "Contacted", "s-contacted") : "") +
      (OWNER ? stat(all.filter(function (l) { return l.status === "showing_scheduled"; }).length, "Showings", "s-showing") : "") +
      stat((DATA.archived || []).length, "Archived", "s-off");

    var host = document.getElementById("grid");
    if (!filtered.length) { host.innerHTML = '<div class="empty">No listings match these filters.</div>'; return; }

    if (ui.view === "grouped" && ui.sort === "hood") {
      var groups = {};
      filtered.forEach(function (l) { (groups[l.neighborhood] = groups[l.neighborhood] || []).push(l); });
      var keys = Object.keys(groups).sort();
      host.innerHTML = keys.map(function (k) {
        return '<section class="hood"><h2>' + esc(k) + ' <span class="cnt">' + groups[k].length + "</span></h2>" +
          '<div class="cards">' + groups[k].map(card).join("") + "</div></section>";
      }).join("");
    } else {
      host.innerHTML = '<div class="cards">' + filtered.map(card).join("") + "</div>";
    }
  }
  function stat(n, label, cls) {
    return '<div class="statbox ' + (cls || "") + '"><div class="n">' + n + '</div><div class="l">' + label + "</div></div>";
  }

  // ---------- neighborhoods for dropdown ----------
  function hoodOptions() {
    var set = {};
    DATA.listings.forEach(function (l) { set[l.neighborhood] = (set[l.neighborhood] || 0) + 1; });
    var opts = ['<option value="all">All neighborhoods</option>'];
    Object.keys(set).sort().forEach(function (k) { opts.push('<option value="' + esc(k) + '">' + esc(k) + " (" + set[k] + ")</option>"); });
    return opts.join("");
  }

  // ---------- comms ----------
  var TEMPLATE = "Hi! Is there any way we can do a virtual tour? We're a group of 4 (can be 5 if flex) and our budget is absolute max $12k/month for 4. We all have very qualified guarantors. Is there any wiggle room on the price or other units that fit our budget with a similar look or location? Thanks! Best regards, Rene Nicolas";

  function doContact(l) {
    navigator.clipboard && navigator.clipboard.writeText(TEMPLATE);
    var o = ov(l.id); o.contacted = true; o.status = "contacted"; o.contactedDate = new Date().toISOString().slice(0, 10);
    persist();
    window.open(l.url, "_blank", "noopener");
    toast("Inquiry template copied + listing opened. Marked Contacted.");
    markSeen(l.id); render();
  }
  function doShowing(l) {
    var v = prompt("Showing date/time for " + l.building + (l.unit ? " #" + l.unit : "") + ":", l.showing || "");
    if (v == null) return;
    var o = ov(l.id); o.showing = v.trim(); o.status = v.trim() ? "showing_scheduled" : o.status; persist(); render();
  }
  function doNote(l) {
    var v = prompt("Note for " + l.building + ":", l.note || "");
    if (v == null) return;
    var o = ov(l.id); o.note = v.trim(); persist(); render();
  }
  function doPass(l) {
    var o = ov(l.id); o.passed = !o.passed; o.status = o.passed ? "passed" : "seen"; persist(); render();
  }
  function markSeen(id) { if (state.everSeen.indexOf(id) === -1) { state.everSeen.push(id); persist(); } }

  function toast(msg) {
    var t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ---------- wire up ----------
  function bind() {
    document.getElementById("hoodSel").innerHTML = hoodOptions();
    document.getElementById("gen").textContent = (OWNER ? "\uD83D\uDD12 Private \u00b7 " : "\uD83D\uDC65 Shared \u00b7 ") + "Updated " + new Date(DATA.generatedAt).toLocaleString();
    var c = DATA.criteria || {};
    document.getElementById("crit").textContent =
      (c.beds || "") + " · " + (c.budgetTotal || "") + " · " + (c.moveIn || "");

    document.getElementById("q").addEventListener("input", function (e) { ui.q = e.target.value; render(); });
    document.getElementById("hoodSel").addEventListener("change", function (e) { ui.hood = e.target.value; render(); });
    document.getElementById("statusSel").addEventListener("change", function (e) { ui.status = e.target.value; render(); });
    document.getElementById("bedsSel").addEventListener("change", function (e) { ui.beds = e.target.value; render(); });
    document.getElementById("sortSel").addEventListener("change", function (e) { ui.sort = e.target.value; render(); });
    document.getElementById("minP").addEventListener("input", function (e) { ui.minP = e.target.value; render(); });
    document.getElementById("maxP").addEventListener("input", function (e) { ui.maxP = e.target.value; render(); });
    document.getElementById("markAll").addEventListener("click", function () {
      listings().forEach(function (l) { markSeen(l.id); }); render(); toast("All marked as seen.");
    });
    document.getElementById("export").addEventListener("click", exportCsv);

    document.getElementById("grid").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]"); if (!btn) return;
      var id = e.target.closest(".card").getAttribute("data-id");
      var l = listings().find(function (x) { return x.id === id; });
      var act = btn.getAttribute("data-act");
      if (act === "contact") doContact(l);
      else if (act === "showing") doShowing(l);
      else if (act === "note") doNote(l);
      else if (act === "pass") doPass(l);
    });
    // mark seen when opening a listing
    document.getElementById("grid").addEventListener("click", function (e) {
      var a = e.target.closest("a.view"); if (!a) return;
      var id = e.target.closest(".card").getAttribute("data-id"); markSeen(id); setTimeout(render, 50);
    });
  }

  function exportCsv() {
    var rows = [["Building", "Unit", "Neighborhood", "Price", "Beds", "Baths", "Status", "Contacted", "Showing", "URL"]];
    listings().forEach(function (l) {
      rows.push([l.building, l.unit, l.neighborhood, l.priceNum || "", l.beds || "", l.baths || "", l.status, l.contacted ? "yes" : "", l.showing || "", l.url]);
    });
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "nyc-rentals-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  }

  bind();
  render();
})();
