/* Founders' Debate: reader application.
   No framework, no network beyond this site's own files. All text reaches the page through
   DOM text nodes (never innerHTML), and every URL passes through safeUrl(). */
(function () {
  "use strict";

  // ---------------------------------------------------------------- data loading
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.getAttribute("src") || "";
    return s.replace(/assets\/js\/app\.js.*$/, "");
  })();
  var DATA_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,150}$/;
  var pending = Object.create(null);
  var store = Object.create(null);
  var BUILD = (function () {
    var m = document.querySelector('meta[name="fd-build"]');
    var v = m && m.getAttribute("content") || "dev";
    return /^[a-z0-9-]{1,40}$/.test(v) ? v : "dev";
  })();

  // The only channel data files use. Non-writable and frozen, and it accepts only keys the app asked for.
  Object.defineProperty(window, "FD", {
    value: Object.freeze({
      put: function (key, value) {
        if (typeof key !== "string" || !pending[key]) return;
        store[key] = value;
        var p = pending[key];
        delete pending[key];
        p.resolve(value);
      }
    }),
    writable: false, configurable: false, enumerable: false
  });
  // Lookup tables keyed by route text must not inherit from Object.prototype ("__proto__", "constructor"...).
  function dict(o) {
    var d = Object.create(null);
    if (o) for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) d[k] = o[k];
    return d;
  }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function need(key) {
    if (!DATA_KEY_RE.test(key)) return Promise.reject(new Error("bad data key"));
    if (store[key]) return Promise.resolve(store[key]);
    if (pending[key]) return pending[key].promise;
    var entry = {};
    entry.promise = new Promise(function (resolve, reject) { entry.resolve = resolve; entry.reject = reject; });
    pending[key] = entry;
    var s = document.createElement("script");
    s.src = ROOT + "data/" + key.split(".").join("/") + ".js?v=" + encodeURIComponent(BUILD);
    s.async = true;
    var timer = setTimeout(function () { fail(new Error("timeout")); }, 30000);
    function fail(err) {
      clearTimeout(timer);
      if (pending[key]) { delete pending[key]; entry.reject(err); }
      s.remove();
    }
    s.onload = function () { clearTimeout(timer); if (pending[key]) fail(new Error("data file did not register")); };
    s.onerror = function () { fail(new Error("could not load " + key)); };
    document.head.appendChild(s);
    return entry.promise;
  }

  // FNV-1a hash: must match build/scripts/build_site.py chunk_of()
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function chunkKey(workId) {
    var group = workId.split(".")[0];
    var n = CORE.chunks[group];
    if (!n) return null;
    return "works." + group + "-" + (fnv1a(workId) % n);
  }
  function loadWork(workId) {
    var key = chunkKey(workId);
    if (!key) return Promise.reject(new Error("unknown work"));
    return need(key).then(function (chunk) {
      if (!has(chunk.works, workId)) throw new Error("work not found");
      return chunk.works[workId];
    });
  }

  // ---------------------------------------------------------------- DOM helpers
  var ALLOWED_HOSTS = /^(www\.)?(archives\.gov|gutenberg\.org|archive\.org|loc\.gov|tile\.loc\.gov|guides\.loc\.gov|constitution\.org|oll\.libertyfund\.org|commons\.wikimedia\.org|upload\.wikimedia\.org|en\.wikipedia\.org|founders\.archives\.gov|nps\.gov|govinfo\.gov|avalon\.law\.yale\.edu|csac\.history\.wisc\.edu|copyright\.gov|masshist\.org|memory\.loc\.gov|lcweb2\.loc\.gov|catalog\.hathitrust\.org|hdl\.huntington\.org|financial\.gwpapers\.org|edu\.lva\.virginia\.gov|quod\.lib\.umich\.edu|en\.wikisource\.org)$/;
  function safeUrl(u) {
    if (typeof u !== "string") return null;
    if (/^#[a-z0-9._~-]*$/.test(u)) return u;
    if (/^assets\/[a-z0-9._\/-]+$/i.test(u) && u.indexOf("..") < 0) return ROOT + u;
    var m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>\\]*)?$/i.exec(u);
    if (m && ALLOWED_HOSTS.test(m[1].toLowerCase())) return u;
    return null;
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "href") {
          var su = safeUrl(v);
          if (su) {
            el.setAttribute("href", su);
            if (/^https:/.test(su)) { el.setAttribute("rel", "noopener noreferrer"); el.setAttribute("target", "_blank"); }
          }
        } else if (k === "src") { var ss = safeUrl(v); if (ss) el.setAttribute("src", ss); }
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (/^(id|role|tabindex|title|alt|type|lang|for|name|placeholder|value|width|height|loading|decoding|hidden|aria-[a-z]+|data-[a-z-]+)$/.test(k)) el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function icon(name) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("class", "icon");
    s.setAttribute("aria-hidden", "true");
    var u = document.createElementNS(SVGNS, "use");
    u.setAttribute("href", "#i-" + name.replace(/[^a-z-]/g, ""));
    s.appendChild(u);
    return s;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function store_get(k) { try { return window.localStorage.getItem("fd." + k); } catch (e) { return null; } }
  function store_set(k, v) { try { window.localStorage.setItem("fd." + k, v); } catch (e) { /* storage unavailable */ } }

  // Inline renderer for source text: _italic_, ^{sup} / ^x superscripts, [12] page or note markers.
  var INLINE_RE = /(_[^_\n]{1,200}_)|(\^\{[^}]{1,12}\})|(\^[A-Za-z]{1,4})|(\[\d{1,4}\])/g;
  function renderInline(str) {
    var frag = document.createDocumentFragment();
    var last = 0, m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(str))) {
      if (m.index > last) frag.appendChild(document.createTextNode(str.slice(last, m.index)));
      if (m[1]) frag.appendChild(h("em", { text: m[1].slice(1, -1) }));
      else if (m[2]) frag.appendChild(h("sup", { text: m[2].slice(2, -1) }));
      else if (m[3]) frag.appendChild(h("sup", { text: m[3].slice(1) }));
      else if (m[4]) frag.appendChild(h("span", { class: "pg", text: m[4] }));
      last = m.index + m[0].length;
    }
    if (last < str.length) frag.appendChild(document.createTextNode(str.slice(last)));
    return frag;
  }
  function renderWithMark(str, a, b) {
    var frag = document.createDocumentFragment();
    frag.appendChild(renderInline(str.slice(0, a)));
    var mk = h("mark");
    mk.appendChild(renderInline(str.slice(a, b)));
    frag.appendChild(mk);
    frag.appendChild(renderInline(str.slice(b)));
    return frag;
  }

  // ---------------------------------------------------------------- labels
  var SIDES = [
    ["draft", "Drafting Record"], ["congress", "In Congress"], ["convention", "In the Federal Convention"],
    ["federalist", "In Defense of the Constitution"], ["antifederalist", "In Opposition"],
    ["ratifying_convention", "State Ratifying Conventions"], ["correspondence", "Letters"],
    ["other", "Related Writings"], ["later", "Later Recollections"]
  ];
  var SIDE_SHORT = { draft: "Drafts", congress: "Congress", convention: "Convention", federalist: "Federalist",
    antifederalist: "Anti-Federalist", ratifying_convention: "Ratifying", correspondence: "Letters", other: "Related", later: "Later" };
  var REL = { direct_discussion: "Discusses This Passage", explicit_response: "Direct Reply", same_debate: "Same Controversy",
    thematic: "Related Idea", drafting_history: "Drafting History" };
  var STATUS = {
    official_transcription: ["Official Transcription", "Transcribed by the National Archives from the original document."],
    digital_transcription: ["Digital Transcription", "Keyed transcription of a printed edition. Not checked against the manuscript or first printing."],
    unreviewed_ocr: ["Unreviewed OCR", "Machine-read text of a scanned book. Expect misread letters (for example \"8c\" for \"&\"). Check the scan before quoting."],
    corrected_ocr: ["Corrected OCR", "Machine-read text of a scanned book, with misread words corrected against a second transcription and the printing's spelling kept. Some words are still as the machine read them. Check the scan before quoting."]
  };
  function isOcr(st) { return st === "unreviewed_ocr" || st === "corrected_ocr"; }
  var ROLE_LABEL = {
    declaration_signer: "Signed the Declaration", constitution_signer: "Signed the Constitution",
    convention_nonsigner: "Convention Delegate, Did Not Sign", declaration_committee_of_five: "Committee of Five",
    articles_drafting_committee: "Articles of Confederation Committee"
  };
  var TAB_OF_KIND = { letter: "letters", diary: "letters", notes: "papers", essay: "essays", pamphlet: "essays", sermon: "essays",
    poem: "essays", address: "essays", book: "essays", memoir: "essays", biography: "essays", speech: "speeches",
    official: "papers", resolution: "papers", report: "papers", petition: "papers", draft: "papers" };
  var TAB_LABEL = { letters: "Letters & Diaries", essays: "Essays & Pamphlets", speeches: "Speeches", papers: "Papers & Notes" };

  function statusChip(st) {
    var s = STATUS[st] || STATUS.digital_transcription;
    return h("span", { class: "chip" + (isOcr(st) ? " ocr" : ""), title: s[1] }, s[0]);
  }
  function years(p) { return (p.by || "?") + " - " + (p.dy || "?"); }
  function monogram(name) {
    var parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
    return (parts[0] ? parts[0][0] : "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  }
  function portrait(pid, cls) {
    var p = CORE.people[pid] || { n: "?" };
    var box = h("div", { class: "portrait " + (cls || "") });
    if (p.img) box.appendChild(h("img", { src: p.img, alt: "Portrait of " + p.n, loading: "lazy", decoding: "async", width: 480, height: 600 }));
    else box.appendChild(h("div", { class: "mono", "aria-hidden": "true", text: monogram(p.n) }));
    return box;
  }

  // ---------------------------------------------------------------- routing
  var ROUTE_RE = /^[a-z0-9._~-]{0,200}$/;
  var DOC_VIEWS = { declaration: 1, constitution: 1, articles: 1, proposed: 1 };
  var CORE = null;
  var state = { route: null, docRendered: null, glossFrom: null, lastDocRoute: "declaration", focusPerson: null, highlight: null };
  var viewEl, glossEl, scrimEl;

  function parseRoute() {
    var raw = (location.hash || "").slice(1);
    if (!ROUTE_RE.test(raw)) raw = "";
    var i = raw.indexOf("~");
    var view = i < 0 ? raw : raw.slice(0, i);
    var arg = i < 0 ? "" : raw.slice(i + 1);
    if (!view) view = "home";
    return { raw: raw, view: view, arg: arg };
  }
  function go(route) { location.hash = "#" + route; }

  function onRoute() {
    var r = parseRoute();
    var prev = state.route;
    state.route = r;
    document.querySelectorAll(".nav a").forEach(function (a) {
      var t = a.getAttribute("data-view");
      if (t === r.view || (t === "constitution" && r.view === "constitution")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (DOC_VIEWS[r.view] && CORE.docs[r.view]) {
      state.lastDocRoute = r.view;
      if (state.docRendered !== r.view) { renderDoc(r.view); window.scrollTo(0, 0); }
      if (r.arg) openGloss(r.view, r.arg, prev);
      else closeGlossUI();
      setTitle(CORE.docs[r.view].title);
      return;
    }
    closeGlossUI();
    state.docRendered = null;
    window.scrollTo(0, 0);
    if (r.view === "home") renderHome();
    else if (r.view === "signers") renderSigners(r.arg);
    else if (r.view === "debates") renderDebates();
    else if (r.view === "sources") renderSources();
    else if (r.view === "library") renderLibrary();
    else if (r.view === "person" && CORE.people[r.arg]) renderPerson(r.arg);
    else if (r.view === "work" && r.arg) renderWork(r.arg);
    else renderHome();
  }
  function setTitle(t) { document.title = t ? t + " | Founders' Debate" : "Founders' Debate"; }
  function newView() {
    clear(viewEl);
    viewEl.classList.remove("enter");
    void viewEl.offsetWidth;
    viewEl.classList.add("enter");
    return viewEl;
  }

  // ---------------------------------------------------------------- home
  function renderHome() {
    setTitle("");
    var v = newView();
    var img = CORE.images;
    var hero = h("section", { class: "home-hero" },
      h("div", null,
        h("h1", { class: "h-doc" }, "Read the Founding Documents With the ", h("em", { text: "Arguments" }), " Behind Every Line"),
        h("p", { class: "lede", text: "Open any marked clause to see what delegates, pamphleteers and newspaper essayists said about it in 1787 and 1788. Tap a signer's name to read their own letters and writings." }),
        h("div", { class: "home-cta" },
          h("a", { class: "btn", href: "#constitution" }, icon("scroll"), "Read the Constitution"),
          h("a", { class: "btn ghost", href: "#declaration" }, "Read the Declaration"))),
      img.trumbull ? h("figure", { class: "hero-figure" },
        h("img", { src: img.trumbull.file, alt: "John Trumbull's painting of the committee presenting the draft Declaration to Congress", width: img.trumbull.width, height: img.trumbull.height, decoding: "async" }),
        h("figcaption", { class: "meta", text: img.trumbull.caption })) : null);
    var plates = h("div", { class: "plates" },
      plate("declaration", img.declaration, "In Congress, July 4, 1776. Fifty-six delegates signed the engrossed copy, most on August 2."),
      plate("constitution", img.constitution, "Signed September 17, 1787, by thirty-nine delegates; ratified 1788. Shown with all twenty-seven amendments."));
    var faces = h("div", { class: "faces", role: "list" });
    CORE.order.declaration.forEach(function (pid) {
      var p = CORE.people[pid];
      faces.appendChild(h("a", { class: "face", role: "listitem", href: "#person~" + pid }, portrait(pid), h("span", { text: p.n })));
    });
    var strip = h("section", { class: "strip" },
      h("div", { class: "strip-head" }, h("h2", { class: "h-sec", text: "The Signers of the Declaration" }),
        h("a", { class: "link-btn", href: "#signers" }, "All Signers & Delegates", icon("arrow-right"))),
      faces);
    var argued = h("div", { class: "argued" });
    CORE.topDebates.forEach(function (d) {
      argued.appendChild(h("a", { href: "#" + d.doc + "~" + d.anchor },
        h("span", { class: "label", text: d.label }), h("span", { class: "t", text: d.topic }),
        h("span", { class: "meta", text: d.n + " Sources" })));
    });
    var debates = h("section", { class: "strip" },
      h("div", { class: "strip-head" }, h("h2", { class: "h-sec", text: "Where the Argument Was Sharpest" }),
        h("a", { class: "link-btn", href: "#debates" }, "Every Debated Clause", icon("arrow-right"))),
      argued);
    append(v, [hero, plates, strip, debates]);
  }
  function plate(docId, im, blurb) {
    var d = CORE.docs[docId];
    return h("a", { class: "plate", href: "#" + docId },
      im ? h("img", { src: im.file, alt: im.alt, loading: "lazy", width: im.width, height: im.height }) : h("div", { class: "portrait" }),
      h("div", null,
        h("h2", { text: d.title }),
        h("p", { text: blurb }),
        h("div", { class: "facts" },
          h("span", { class: "chip wax", text: d.debatedCount + " Debated Passages" }),
          h("span", { class: "chip", text: d.signerCount + " Signers" }))));
  }

  // ---------------------------------------------------------------- documents
  function renderDoc(docId) {
    var d = CORE.docs[docId];
    state.docRendered = docId;
    var v = newView();
    var layout = h("div", { class: "doc-layout", id: "doc-layout" });
    var toc = h("nav", { class: "toc", "aria-label": "Contents" });
    var docEl = h("article", { class: "doc", id: "doc", "aria-label": d.title });
    var head = h("header", { class: "doc-head" },
      d.dateline ? h("p", { class: "dateline", text: d.dateline }) : null,
      h("h1", { class: "h-doc", text: d.title }),
      h("div", { class: "meta" },
        h("span", { text: d.source_note }),
        h("a", { href: d.source_url }, "Source Transcription", icon("arrow-square-out")),
        d.parchment && d.parchment.commons ? h("a", { href: d.parchment.commons }, "View the Parchment", icon("arrow-square-out")) : null),
      d.debatedCount ? h("div", { class: "legend" },
        h("span", null, h("b", { class: "sample-d", text: "Passages ruled in the margin" }), " open the record of the argument over them."),
        d.signerCount ? h("span", null, h("b", { class: "sample-p", text: "Dotted names" }), " open a signer's life and writings.") : null) : null);
    docEl.appendChild(head);

    var tocItems = [];
    d.paragraphs.forEach(function (p) {
      var el = renderParagraph(docId, p);
      if (el) {
        docEl.appendChild(el);
        if (p.toc) tocItems.push([p.toc, el, p.tocSub]);
      }
    });
    if (d.signerGroups && d.signerGroups.length) tocItems.push(["The Signers", renderSigners_inDoc(d, docEl)]);
    if (d.after) d.after.forEach(function (sec) {
      var secHead = h("h2", { class: "art", id: "sec-" + sec.id, text: sec.title });
      docEl.appendChild(secHead);
      tocItems.push([sec.title, secHead, false, true]);
      if (sec.intro) docEl.appendChild(h("p", { class: "p amend-dates", text: sec.intro }));
      sec.paragraphs.forEach(function (p) {
        var el = renderParagraph(docId, p);
        if (el) { docEl.appendChild(el); if (p.toc) tocItems.push([p.toc, el, p.tocSub]); }
      });
    });
    tocItems.forEach(function (t) {
      if (t[3]) { toc.appendChild(h("span", { class: "label", text: t[0] })); return; }
      toc.appendChild(h("a", { class: t[2] ? "sub" : null, href: "#" + docId, onclick: function (e) { e.preventDefault(); t[1].scrollIntoView({ behavior: "smooth", block: "start" }); } }, t[0]));
    });
    if (!tocItems.length) toc.appendChild(h("span", { class: "label", text: d.short || d.title }));
    glossEl = h("aside", { class: "gloss", id: "gloss", hidden: true, "aria-label": "Commentary", tabindex: "-1" });
    append(layout, [toc, docEl, glossEl]);
    v.appendChild(layout);
  }

  function renderParagraph(docId, p) {
    var cls = "p";
    var tag = "p";
    if (p.k === "article") { return h("h2", { class: "art", "data-anchor": p.id, text: p.t }); }
    if (p.k === "section") { return h("h3", { class: "sec", "data-anchor": p.id, text: p.t }); }
    if (p.k === "amend-h") { return h("h3", { class: "amend-h", "data-anchor": p.id, text: p.t }); }
    if (p.k === "amend-dates") return h("p", { class: "amend-dates", text: p.t });
    if (p.k === "amend-note") return h("p", { class: "amend-note", text: p.t });
    if (p.k === "attest") cls += " attest";
    if (p.k === "preamble") cls += " preamble";
    if (p.k === "dateline") cls += " dateline-p";
    if (p.k === "title") cls += " title-p";
    if (p.k === "grievance") cls += " grievance";
    var deb = CORE.debated[p.id];
    var sup = CORE.superseded[p.id];
    if (deb) cls += " debated";
    if (sup) cls += " superseded";
    var el = h(tag, { class: cls, "data-anchor": p.id, id: "a-" + p.id.replace(/\./g, "-") });
    if (p.label) el.appendChild(h("span", { class: "cite", "aria-hidden": "true", text: p.label }));
    el.appendChild(h("span", { class: "ptext", text: p.t }));
    if (sup) sup.forEach(function (s) {
      el.appendChild(h("span", { class: "changed" }, h("span", { class: "chip", title: s.note, text: s.short })));
    });
    if (deb) {
      el.appendChild(h("span", { class: "count", "aria-hidden": "true" }, String(deb.n)));
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", (p.label ? p.label + ". " : "") + deb.topic + ". Open " + deb.n + " sources.");
      var open = function (e) {
        if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
        var sel = window.getSelection && window.getSelection();
        if (e.type === "click" && sel && String(sel).length > 2) return; // let people select text
        e.preventDefault();
        go(docId + "~" + p.id);
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", open);
    }
    return el;
  }

  function renderSigners_inDoc(d, docEl) {
    var box = h("section", { class: "signers", "aria-label": "Signers" });
    box.appendChild(h("h2", { text: d.signersHeading }));
    if (d.signersNote) box.appendChild(h("p", { class: "meta", text: d.signersNote }));
    var grid = h("div", { class: "signer-grid" });
    d.signerGroups.forEach(function (g) {
      var ul = h("ul");
      g.names.forEach(function (n) {
        var li = h("li");
        if (n.pid && CORE.people[n.pid]) {
          li.appendChild(h("button", { class: "name-btn", type: "button", "data-person": n.pid, onclick: function () { go(state.docRendered + "~" + n.pid); } },
            h("span", { class: "as-signed", text: n.t }),
            n.t !== CORE.people[n.pid].n ? h("small", { text: CORE.people[n.pid].n }) : null));
        } else li.appendChild(h("span", { text: n.t }));
        ul.appendChild(li);
      });
      grid.appendChild(h("div", { class: "state-group" }, h("span", { class: "label", text: g.state }), ul));
    });
    box.appendChild(grid);
    if (d.attest) box.appendChild(h("p", { class: "attest-block", text: d.attest }));
    docEl.appendChild(box);
    return box;
  }

  // ---------------------------------------------------------------- gloss panel
  function isAnchor(arg) { return /^(constitution|declaration|bill_of_rights|articles|amendments)\.p\d{4}$/.test(arg); }
  function openGloss(docId, arg, prevRoute) {
    state.glossFrom = prevRoute && prevRoute.view === docId && !prevRoute.arg ? "doc" : "direct";
    var layout = document.getElementById("doc-layout");
    glossEl = document.getElementById("gloss");
    if (!layout || !glossEl) return;
    document.querySelectorAll(".p.is-open, .name-btn.is-open").forEach(function (x) { x.classList.remove("is-open"); });
    layout.classList.add("has-gloss");
    glossEl.hidden = false;
    quoteOpen = null;
    applySheetH();
    showScrim(true);
    var inner = h("div", { class: "gloss-inner" });
    clear(glossEl).appendChild(inner);
    if (isAnchor(arg)) {
      var target = document.querySelector('[data-anchor="' + arg + '"]');
      if (target) { target.classList.add("is-open"); alignWithGloss(target, !!prevRoute && prevRoute.view === docId); }
      renderClauseGloss(inner, docId, arg);
    } else if (CORE.people[arg]) {
      var btn = document.querySelector('.name-btn[data-person="' + arg + '"]');
      if (btn) { btn.classList.add("is-open"); if (!prevRoute || prevRoute.view !== docId) btn.scrollIntoView({ block: "center" }); }
      renderPersonGloss(inner, arg);
    } else {
      inner.appendChild(h("p", { class: "empty", text: "Nothing to show for this link." }));
    }
    glossEl.scrollTop = 0;
    setTimeout(function () { try { glossEl.focus({ preventScroll: true }); } catch (e) { glossEl.focus(); } }, 30);
  }
  // Scroll the selected passage so its first line sits level with the top of the commentary panel
  // (the panel is sticky just below the masthead). Runs after the layout narrows to make room for it.
  function alignWithGloss(el, inPage) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var mast = document.querySelector(".masthead");
        var top = (mast ? mast.getBoundingClientRect().bottom : 64) + 16;
        var g = document.getElementById("gloss");
        var cs = g && getComputedStyle(g);
        if (cs && cs.position === "sticky" && parseFloat(cs.top) > 0) top = parseFloat(cs.top); // side-by-side layout
        var y = el.getBoundingClientRect().top + window.pageYOffset - top;
        // glide for a short hop within the page; jump when arriving from elsewhere or travelling far
        var near = Math.abs(y - window.pageYOffset) < window.innerHeight * 1.5;
        window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: inPage && near && !reduce ? "smooth" : "auto" });
      });
    });
  }
  function closeGlossUI() {
    var layout = document.getElementById("doc-layout");
    if (layout) layout.classList.remove("has-gloss");
    var g = document.getElementById("gloss");
    if (g) { g.hidden = true; clear(g); }
    quoteOpen = null;
    document.querySelectorAll(".p.is-open, .name-btn.is-open").forEach(function (x) { x.classList.remove("is-open"); });
    showScrim(false);
  }
  function closeGloss() {
    var view = state.route.view;
    var direct = function () { history.replaceState(null, "", "#" + view); onRoute(); };
    if (state.glossFrom !== "doc") { direct(); return; }
    var before = location.hash;
    history.back();
    // if the previous history entry had the same address, back() changes nothing: close directly
    setTimeout(function () { if (location.hash === before && glossEl && !glossEl.hidden) direct(); }, 250);
  }
  function showScrim(on) {
    var narrow = window.matchMedia("(max-width: 1080px)").matches;
    if (on && narrow) {
      // The scrim must live in the same stacking context as the sheet (inside <main>), or it paints
      // over the sheet and swallows every tap and scroll meant for it.
      if (!scrimEl) { scrimEl = h("div", { class: "scrim", onclick: closeGloss }); document.getElementById("main").appendChild(scrimEl); }
      document.body.classList.add("sheet-open");
    } else {
      if (scrimEl) { scrimEl.remove(); scrimEl = null; }
      document.body.classList.remove("sheet-open");
    }
  }
  // The panel's header: on a phone it stays pinned to the top of the sheet, carries the grab handle,
  // and folds the passage into a dropdown under the label (beside the text the passage is visible, so
  // the dropdown is hidden there).
  function glossTop(labelText, quote) {
    var top = h("div", { class: "gloss-top" + (quote ? " has-quote" : "") }, h("span", { class: "label", text: labelText }));
    var panel = null;
    if (quote) {
      panel = h("div", { class: "clause-quote", id: "gloss-quote", hidden: true }, quote);
      var btn = h("button", { class: "quote-toggle", type: "button", "aria-expanded": "false", "aria-controls": "gloss-quote",
        onclick: function () { if (quoteOpen) closeQuote(); else { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); quoteOpen = { btn: btn, panel: panel }; } } },
        h("span", { class: "label", text: labelText }), icon("caret-down"));
      top.appendChild(btn);
    }
    top.appendChild(h("button", { class: "tool-btn gloss-close", type: "button", "aria-label": "Close", onclick: closeGloss }, icon("x")));
    return h("div", { class: "gloss-head" }, grabHandle(), top, panel);
  }
  var quoteOpen = null; // the passage dropdown while it is open: { btn, panel }
  function closeQuote() {
    if (!quoteOpen) return;
    quoteOpen.panel.hidden = true;
    quoteOpen.btn.setAttribute("aria-expanded", "false");
    quoteOpen = null;
  }

  // Phone sheet height: the reader drags the handle to set it, and it is kept until the page reloads.
  // A drag that ends low enough closes the sheet, as on a phone's own sheets.
  var sheetH = null;
  function sheetMax() {
    var mast = document.querySelector(".masthead");
    return Math.max(200, window.innerHeight - (mast ? mast.getBoundingClientRect().bottom : 64) - 24); // keeps a band of scrim to tap closed
  }
  function applySheetH() {
    var g = document.getElementById("gloss");
    if (!g) return;
    if (sheetH) { g.style.setProperty("--sheet-h", Math.min(sheetH, sheetMax()) + "px"); g.classList.add("sized"); }
    else { g.style.removeProperty("--sheet-h"); g.classList.remove("sized"); }
  }
  function setSheetH(px) { sheetH = Math.round(Math.min(sheetMax(), Math.max(160, px))); applySheetH(); }
  function grabHandle() {
    var startY = 0, startH = 0, dragging = false, moved = false;
    var grab = h("button", { class: "grab", type: "button", "aria-label": "Resize Panel", title: "Drag to Resize",
      onpointerdown: function (e) {
        if (e.button > 0) return;
        dragging = true; moved = false; startY = e.clientY; startH = glossEl.getBoundingClientRect().height;
        try { grab.setPointerCapture(e.pointerId); } catch (x) { /* capture is a nicety */ }
      },
      onpointermove: function (e) {
        if (!dragging) return;
        if (Math.abs(e.clientY - startY) > 4) moved = true;
        if (moved) setSheetH(startH + startY - e.clientY);
      },
      onpointerup: function (e) {
        if (!dragging) return;
        dragging = false;
        if (moved && startH + startY - e.clientY < 120) { sheetH = null; closeGloss(); }
      },
      onpointercancel: function () { dragging = false; },
      // a tap (or Enter) toggles between full height and a little over half
      onclick: function () {
        if (moved) { moved = false; return; }
        var max = sheetMax();
        setSheetH(glossEl.getBoundingClientRect().height >= max - 8 ? max * 0.55 : max);
      },
      onkeydown: function (e) {
        var step = e.key === "ArrowUp" ? 48 : e.key === "ArrowDown" ? -48 : 0;
        if (step) { e.preventDefault(); setSheetH(glossEl.getBoundingClientRect().height + step); }
      } });
    return grab;
  }

  function renderClauseGloss(inner, docId, anchor) {
    var deb = CORE.debated[anchor];
    var para = CORE.anchorText[anchor];
    inner.appendChild(glossTop(para && para.label ? para.label : "Passage", deb && para ? para.t : null));
    if (!deb) {
      inner.appendChild(h("h2", { text: "No Recorded Debate Linked Yet" }));
      inner.appendChild(h("p", { class: "summary", text: "This passage has no sources linked to it in this edition." }));
      return;
    }
    inner.appendChild(h("h2", { text: deb.topic }));
    var body = h("div", { class: "gloss-body" }, skeleton(5));
    inner.appendChild(body);
    need("debates").then(function (D) {
      clear(body);
      var clauses = deb.cids.map(function (cid) { return D.clauses[cid]; }).filter(Boolean);
      clauses.forEach(function (c, i) {
        if (i > 0) body.appendChild(h("h3", { class: "h-sub gloss-sub", text: c.topic }));
        if (c.summary) body.appendChild(h("p", { class: "summary" }, c.summary, h("span", { class: "summary-by meta", text: "Summary written for this site." })));
        body.appendChild(renderEntries(c.entries, anchor));
      });
    }).catch(function (e) { clear(body).appendChild(errorBox(e)); });
  }

  function renderEntries(entries, anchor) {
    var wrap = h("div");
    var counts = {};
    entries.forEach(function (e) { counts[e.side] = (counts[e.side] || 0) + 1; });
    var sidesPresent = SIDES.filter(function (s) { return counts[s[0]]; });
    var active = "all";
    var filters = h("div", { class: "filters", role: "group", "aria-label": "Filter sources" });
    function mkFilter(key, label, n) {
      return h("button", { class: "filter", type: "button", "aria-pressed": key === active ? "true" : "false",
        onclick: function () { active = key; filters.querySelectorAll(".filter").forEach(function (b) { b.setAttribute("aria-pressed", b === this ? "true" : "false"); }, this); draw(); } },
        label + " " + n);
    }
    if (sidesPresent.length > 1) {
      filters.appendChild(mkFilter("all", "All", entries.length));
      sidesPresent.forEach(function (s) { filters.appendChild(mkFilter(s[0], SIDE_SHORT[s[0]], counts[s[0]])); });
      wrap.appendChild(filters);
    }
    var list = h("div");
    wrap.appendChild(list);
    function draw() {
      clear(list);
      sidesPresent.forEach(function (s) {
        if (active !== "all" && active !== s[0]) return;
        var group = h("section", { class: "side-group" }, h("h3", null, s[1], h("span", { class: "n", text: "(" + counts[s[0]] + ")" })));
        entries.forEach(function (e) { if (e.side === s[0]) group.appendChild(renderEntry(e, anchor)); });
        list.appendChild(group);
      });
    }
    draw();
    return wrap;
  }

  function renderEntry(e, anchor) {
    var by = [];
    if (e.sp && CORE.people[e.sp]) {
      by.push(h("button", { class: "speaker-btn", type: "button", onclick: function () { go("person~" + e.sp); } }, CORE.people[e.sp].n));
    } else if (e.by) by.push(e.by);
    if (e.dl) by.push((by.length ? ", " : "") + e.dl);
    var foot = h("div", { class: "entry-foot" },
      h("button", { class: "link-btn", type: "button", onclick: function () { state.highlight = { work: e.w, loc: e.loc, from: location.hash }; go("work~" + e.w); } }, icon("book-open"), "Read in Full"),
      h("span", { class: "chip", text: REL[e.rel] || "Related" }),
      isOcr(e.st) ? statusChip(e.st) : null);
    return h("article", { class: "entry side-" + e.side },
      h("div", { class: "entry-head" }, h("span", { class: "entry-title", text: e.title }), h("span", { class: "entry-by" }, by)),
      h("blockquote", null, renderInline(e.ex)),
      e.note ? h("p", { class: "note", text: e.note }) : null,
      foot);
  }

  function renderPersonGloss(inner, pid) {
    var p = CORE.people[pid];
    inner.appendChild(glossTop(p.st || ""));
    inner.appendChild(personHeader(pid, false));
    var body = h("div", null, skeleton(4));
    inner.appendChild(body);
    need("people." + pid).then(function (P) {
      clear(body);
      body.appendChild(bioBlock(P, true));
      body.appendChild(worksBlock(pid, P, 8));
      body.appendChild(h("p", { class: "more-btn" }, h("a", { class: "btn ghost", href: "#person~" + pid }, "Open " + p.n + "'s Page", icon("arrow-right"))));
    }).catch(function (e) { clear(body).appendChild(errorBox(e)); });
  }

  function personHeader(pid, big) {
    var p = CORE.people[pid];
    var roles = h("div", { class: "roles" });
    (p.r || []).forEach(function (r) { if (ROLE_LABEL[r]) roles.appendChild(h("span", { class: "chip" + (r === "declaration_signer" || r === "constitution_signer" ? " wax" : ""), text: ROLE_LABEL[r] })); });
    var life = [];
    if (p.bl || p.dl) life.push((p.bl || "?") + " to " + (p.dl || "?"));
    if (p.st) life.push(p.st);
    return h("div", { class: "person-card" },
      portrait(pid),
      h("div", null,
        big ? h("h1", { class: "h-sec", text: p.n }) : h("h2", { text: p.n }),
        h("div", { class: "life", text: life.join(". ") }),
        roles,
        big && p.img && p.pn ? h("p", { class: "portrait-note", text: p.pn }) : null));
  }

  function bioBlock(P, clamp) {
    var box = h("div");
    (P.bios || []).forEach(function (b, i) {
      var sec = h("section", { class: "bio" + (clamp ? " clamped" : "") });
      if (clamp && i > 0) {
        // a second sketch stays folded so the writings list stays near the top
        var more = h("button", { class: "link-btn", type: "button", "aria-expanded": "false", onclick: function () {
          sec.hidden = !sec.hidden;
          more.setAttribute("aria-expanded", sec.hidden ? "false" : "true");
        } }, icon("caret-down"), "Also: The Sketch From " + b.title);
        sec.hidden = true;
        box.appendChild(h("p", { class: "bio" }, more));
      }
      sec.appendChild(h("p", { class: "source-line" }, "From ", h("a", { href: b.url, text: b.title }), ". Public domain."));
      var txt = h("div", { class: "bio-text" });
      b.paragraphs.forEach(function (t) { txt.appendChild(h("p", { text: t })); });
      sec.appendChild(txt);
      if (clamp) {
        var btn = h("button", { class: "link-btn", type: "button", "aria-expanded": "false", onclick: function () {
          var c = sec.classList.toggle("clamped");
          btn.setAttribute("aria-expanded", c ? "false" : "true");
          btn.lastChild.textContent = c ? "Read the Full Sketch" : "Show Less";
        } }, icon("caret-down"), "Read the Full Sketch");
        sec.appendChild(btn);
      }
      box.appendChild(sec);
      if (clamp && i === 0) clamp = true;
    });
    if (!(P.bios || []).length) box.appendChild(h("p", { class: "empty", text: "No public-domain biographical sketch is included for this person yet." }));
    return box;
  }

  function worksBlock(pid, P, limit) {
    var tabs = {};
    (P.works || []).forEach(function (w) {
      var t = w.tab || TAB_OF_KIND[w.k] || "papers";
      (tabs[t] = tabs[t] || []).push(w);
    });
    if (P.speeches && P.speeches.length) tabs.speeches = (tabs.speeches || []).concat(P.speeches.map(function (s) {
      return { id: s.day, t: "Speeches in the Convention, " + s.dl, d: s.date, dl: s.dl, k: "notes", sub: s.n + (s.n === 1 ? " Remark" : " Remarks") + " Reported by Madison", speaker: true };
    }));
    var order = ["letters", "essays", "speeches", "papers"].filter(function (t) { return tabs[t] && tabs[t].length; });
    var box = h("section", { class: "writings", "aria-label": "Writings" });
    if (!order.length) {
      box.appendChild(h("h3", { class: "h-sub", text: "Writings" }));
      box.appendChild(h("p", { class: "empty", text: "No writings by this person are included yet. Their letters and papers survive in the collections listed on the Sources page." }));
      return box;
    }
    var tablist = h("div", { class: "tabs", role: "tablist" });
    var panel = h("div", { role: "tabpanel" });
    var current = order[0];
    order.forEach(function (t) {
      tablist.appendChild(h("button", { class: "tab", role: "tab", type: "button", "aria-selected": t === current ? "true" : "false",
        onclick: function () { current = t; tablist.querySelectorAll(".tab").forEach(function (b, i) { b.setAttribute("aria-selected", order[i] === t ? "true" : "false"); }); draw(); } },
        TAB_LABEL[t], h("span", { class: "n", text: String(tabs[t].length) })));
    });
    var q = "";
    var shown = limit || 60;
    var search = h("input", { class: "input", type: "search", placeholder: "Filter by Title, Recipient or Year", "aria-label": "Filter writings", id: "filter-" + pid,
      oninput: function () { q = search.value.trim().toLowerCase(); shown = limit || 60; draw(); } });
    function draw() {
      clear(panel);
      var items = tabs[current].slice().sort(function (a, b) { return (a.d || "9999").localeCompare(b.d || "9999"); });
      if (q) items = items.filter(function (w) { return ((w.t || "") + " " + (w.rc || "") + " " + (w.dl || "") + " " + (w.d || "")).toLowerCase().indexOf(q) >= 0; });
      var ul = h("ul", { class: "work-list" });
      items.slice(0, shown).forEach(function (w) {
        ul.appendChild(h("li", null, h("button", { class: "work-row", type: "button", onclick: function () {
          state.highlight = w.speaker ? { work: w.id, person: pid, from: location.hash } : null;
          go("work~" + w.id);
        } },
          h("span", { class: "wd", text: w.dl || w.d || "Undated" }),
          h("span", null, h("span", { class: "wt", text: w.t }),
            h("span", { class: "ws", text: [w.rc ? "To " + w.rc : "", w.sub || "", isOcr(w.st) ? STATUS[w.st][0] : ""].filter(Boolean).join(". ") })))));
      });
      if (!items.length) panel.appendChild(h("p", { class: "empty", text: "No writings match that filter." }));
      panel.appendChild(ul);
      if (items.length > shown) panel.appendChild(h("button", { class: "btn ghost more-btn", type: "button", onclick: function () { shown += 80; draw(); } }, "Show More (" + (items.length - shown) + " Left)"));
    }
    append(box, [h("h3", { class: "h-sub", text: "Writings" }), tablist, h("div", { class: "list-tools" }, search), panel]);
    draw();
    return box;
  }

  // ---------------------------------------------------------------- person page
  function renderPerson(pid) {
    var p = CORE.people[pid];
    setTitle(p.n);
    var v = newView();
    var wrap = h("div", { class: "reader" });
    var main = h("div", { class: "reader-main" },
      h("div", { class: "reader-back" }, h("button", { class: "link-btn", type: "button", onclick: back }, icon("arrow-left"), "Back")),
      personHeader(pid, true));
    var body = h("div", null, skeleton(6));
    main.appendChild(body);
    var aside = h("aside", { class: "aside" });
    append(wrap, [main, aside]);
    v.appendChild(wrap);
    need("people." + pid).then(function (P) {
      clear(body);
      body.appendChild(bioBlock(P, true));
      body.appendChild(worksBlock(pid, P, 60));
      var dl = h("dl");
      if (P.portrait) dl.appendChild(dd("Portrait", [P.portrait.artist ? P.portrait.artist + ". " : "", P.portrait.work_date ? P.portrait.work_date + ". " : "", h("a", { href: P.portrait.url, text: "Wikimedia Commons" }), ". Public domain."]));
      if (p.bl) dl.appendChild(dd("Born", p.bl + (P.birthplace ? ", " + P.birthplace : "")));
      if (p.dl) dl.appendChild(dd("Died", p.dl));
      if (P.appearances && P.appearances.length) dl.appendChild(dd("Signed", P.appearances.join("; ")));
      dl.appendChild(dd("About These Texts", "Letters come mainly from Letters of Delegates to Congress (Library of Congress), read by machine from scans. Each text links to its scanned edition."));
      if (P.finding) dl.appendChild(dd("More of Their Papers", P.finding.map(function (f, i) { return [i ? ", " : "", h("a", { href: f.url, text: f.title })]; })));
      aside.appendChild(dl);
    }).catch(function (e) { clear(body).appendChild(errorBox(e)); });
  }
  function dd(t, c) { return h("div", null, h("dt", { text: t }), h("dd", null, c)); }
  function back() {
    if (history.length > 1 && state.cameInternal) history.back();
    else go(state.lastDocRoute || "");
  }

  // ---------------------------------------------------------------- reader
  function renderWork(wid) {
    var v = newView();
    setTitle("Reading");
    var main = h("div", { class: "reader-main" },
      h("div", { class: "reader-back" }, h("button", { class: "link-btn", type: "button", onclick: back }, icon("arrow-left"), "Back")));
    var body = h("div", null, skeleton(10));
    var aside = h("aside", { class: "aside" });
    main.appendChild(body);
    v.appendChild(h("div", { class: "reader" }, main, aside));
    loadWork(wid).then(function (w) {
      setTitle(w.title);
      clear(body);
      var byline = h("div", { class: "byline" });
      if (w.authors && w.authors.length) w.authors.forEach(function (a, i) {
        if (CORE.people[a]) append(byline, [i ? " and " : "", h("a", { href: "#person~" + a, text: CORE.people[a].n })]);
      });
      else if (w.author_label) byline.appendChild(h("span", { text: w.author_label }));
      if (w.pseudonym && !(w.author_label || "").match(w.pseudonym)) byline.appendChild(h("span", { text: "Signed “" + w.pseudonym + "”" }));
      if (w.date_label) byline.appendChild(h("span", { text: w.date_label }));
      if (w.recipient) byline.appendChild(h("span", { text: "To " + w.recipient }));
      byline.appendChild(statusChip(w.text_status));
      append(body, [h("h1", { text: w.title }), w.subtitle ? h("p", { class: "subtitle", text: w.subtitle }) : null, byline]);
      if (w.excerpt_only) body.appendChild(h("p", { class: "note meta", text: "This transcription is an excerpt, not the complete essay." }));
      var text = h("div", { class: "text", lang: "en" });
      var hl = state.highlight && state.highlight.work === wid ? state.highlight : null;
      var firstMark = null;
      w.paras.forEach(function (pr, i) {
        var type = pr[0], str = pr[1];
        var el = h(type === "h" ? "h2" : "p", { class: type === "p" ? null : type });
        var spk = w.speakers && w.speakers[i];
        if (hl && hl.loc && i >= hl.loc[0] && i <= hl.loc[2]) {
          var a = i === hl.loc[0] ? hl.loc[1] : 0;
          var b = i === hl.loc[2] ? hl.loc[3] : str.length;
          el.appendChild(renderWithMark(str, a, b));
          if (!firstMark) firstMark = el;
        } else el.appendChild(renderInline(str));
        if (spk && CORE.people[spk]) {
          el.setAttribute("data-speaker", spk);
          if (hl && hl.person === spk) { el.classList.add("focus-person"); if (!firstMark) firstMark = el; }
        }
        text.appendChild(el);
      });
      body.appendChild(text);
      if (w.prev || w.next) body.appendChild(h("nav", { class: "series-nav", "aria-label": "Series" },
        w.prev ? h("a", { class: "link-btn", href: "#work~" + w.prev[0] }, icon("arrow-left"), w.prev[1]) : h("span"),
        w.next ? h("a", { class: "link-btn", href: "#work~" + w.next[0] }, w.next[1], icon("arrow-right")) : null));
      // provenance
      var s = STATUS[w.text_status] || STATUS.digital_transcription;
      var dl = h("dl");
      dl.appendChild(dd("Edition", w.edition));
      dl.appendChild(dd("Source", [h("a", { href: w.source_url, text: hostOf(w.source_url) }), w.scan_url ? [" · ", h("a", { href: w.scan_url, text: "Page Scan" })] : null]));
      if (w.date_type) dl.appendChild(dd("Date", (w.date_label || "Undated") + " (" + w.date_type + ")"));
      if (w.attribution_note) dl.appendChild(dd("Authorship", w.attribution_note));
      if (w.note) dl.appendChild(dd("Context", w.note));
      if (w.editorial_source_note) dl.appendChild(dd("Editors' Source Note", w.editorial_source_note));
      append(aside, [dl, h("div", { class: "status-box" + (isOcr(w.text_status) ? "" : " ok") }, h("strong", { text: s[0] + ". " }), s[1],
        w.layout_note ? " " + w.layout_note : "")]);
      if (firstMark) setTimeout(function () { firstMark.scrollIntoView({ block: "center" }); }, 60);
    }).catch(function (e) { clear(body).appendChild(errorBox(e)); });
  }
  function hostOf(u) { var m = /^https:\/\/(?:www\.)?([^\/]+)/.exec(u || ""); return m ? m[1] : "source"; }

  // ---------------------------------------------------------------- signers directory
  function renderSigners(arg) {
    setTitle("Signers");
    var v = newView();
    var mode = arg === "constitution" || arg === "convention" ? arg : "declaration";
    var head = h("header", { class: "doc-head" },
      h("h1", { class: "h-doc", text: "Signers & Delegates" }),
      h("p", { class: "lede", text: "Fifty-six men signed the Declaration of Independence. Thirty-nine signed the Constitution; sixteen other delegates attended the Convention without signing. Six men signed both." }));
    var tools = h("div", { class: "dir-tools", role: "group", "aria-label": "Show" });
    [["declaration", "Declaration Signers"], ["constitution", "Constitution Signers"], ["convention", "All Convention Delegates"]].forEach(function (m) {
      tools.appendChild(h("a", { class: "filter", href: "#signers~" + m[0], "aria-pressed": m[0] === mode ? "true" : "false" }, m[1]));
    });
    append(v, [head, tools]);
    var list = CORE.order[mode];
    var byState = {};
    var states = [];
    list.forEach(function (pid) {
      var st = CORE.people[pid].st || "Other";
      if (mode !== "declaration" && CORE.people[pid].cst) st = CORE.people[pid].cst;
      if (!byState[st]) { byState[st] = []; states.push(st); }
      byState[st].push(pid);
    });
    states.forEach(function (st) {
      var grid = h("div", { class: "dir-grid" });
      byState[st].forEach(function (pid) {
        var p = CORE.people[pid];
        var c = p.c || {};
        var bits = [years(p)];
        if (c.w) bits.push(c.w.toLocaleString("en-US") + (c.w === 1 ? " Writing" : " Writings"));
        if (c.s) bits.push("Spoke on " + c.s + (c.s === 1 ? " Day" : " Days"));
        grid.appendChild(h("a", { class: "card", href: "#person~" + pid }, portrait(pid), h("span", { class: "nm", text: p.n }), h("span", { class: "sub", text: bits.join(". ") })));
      });
      var n = byState[st].length;
      v.appendChild(h("section", { class: "dir-state" }, h("h2", null, st, h("span", { class: "meta", text: n + (mode === "convention" ? (n === 1 ? " Delegate" : " Delegates") : (n === 1 ? " Signer" : " Signers")) })), grid));
    });
  }

  // ---------------------------------------------------------------- debates index
  function renderDebates() {
    setTitle("Debates");
    var v = newView();
    v.appendChild(h("header", { class: "doc-head" },
      h("h1", { class: "h-doc", text: "Every Debated Passage" }),
      h("p", { class: "lede", text: "Each entry links a clause to what was said about it: in the Federal Convention's closed sessions, in the newspaper war over ratification, and in the state conventions. Every quotation was checked by machine against its source text." })));
    var idx = h("div", { class: "debate-index" });
    CORE.debateIndex.forEach(function (grp) {
      var rows = h("div", { class: "debate-rows" });
      grp.items.forEach(function (d) {
        var c = h("div", { class: "c" });
        Object.keys(d.sides).forEach(function (s) { c.appendChild(h("span", { class: "chip", text: SIDE_SHORT[s] + " " + d.sides[s] })); });
        rows.appendChild(h("a", { class: "debate-row", href: "#" + d.doc + "~" + d.anchor },
          h("span", { class: "where", text: d.label }), h("span", null, h("span", { class: "t", text: d.topic }), c)));
      });
      idx.appendChild(h("section", null, h("h2", { text: grp.title }), rows));
    });
    v.appendChild(idx);
  }

  // ---------------------------------------------------------------- library
  // Writings in print before and during the founding, each readable in full; long works fold their parts away.
  function renderLibrary() {
    setTitle("Library");
    var v = newView();
    var L = CORE.library;
    v.appendChild(h("header", { class: "doc-head" }, h("h1", { class: "h-doc", text: "Library" }), h("p", { class: "lede", text: L.lede })));
    var shelf = h("div", { class: "library" });
    L.shelf.forEach(function (b) {
      var many = b.parts.length > 1;
      var item = h("article", { class: "lib-item", id: "lib-" + b.key },
        h("h2", { class: "lib-title", text: b.title }),
        h("p", { class: "lib-meta" }, h("span", { text: b.by + ". " + b.years + "." }), statusChip(b.st),
          many ? h("span", { class: "meta", text: b.parts.length + " Parts" }) : null),
        h("p", { class: "lib-blurb", text: b.blurb }));
      var actions = h("div", { class: "lib-actions" },
        h("a", { class: "btn ghost", href: "#work~" + b.parts[0][0] }, many ? "Read From the Beginning" : "Read in Full", icon("arrow-right")));
      if (many) {
        var list = h("ol", { class: "lib-parts", id: "lib-parts-" + b.key, hidden: true });
        b.parts.forEach(function (p) { list.appendChild(h("li", null, h("a", { href: "#work~" + p[0], text: p[1] }))); });
        var toggle = h("button", { class: "link-btn lib-toggle", type: "button", "aria-expanded": "false", "aria-controls": "lib-parts-" + b.key,
          onclick: function () {
            var open = list.hidden;
            list.hidden = !open;
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            toggle.lastChild.textContent = open ? "Hide the Parts" : "Show All " + b.parts.length + " Parts";
          } }, icon("caret-down"), h("span", { text: "Show All " + b.parts.length + " Parts" }));
        actions.appendChild(toggle);
        append(item, [actions, list]);
      } else item.appendChild(actions);
      shelf.appendChild(item);
    });
    v.appendChild(shelf);
  }

  // ---------------------------------------------------------------- sources
  function renderSources() {
    setTitle("Sources");
    var v = newView();
    var S = CORE.sources;
    var stats = h("div", { class: "stat-line" });
    S.stats.forEach(function (s) { stats.appendChild(h("div", null, h("b", { text: s[0] }), h("span", { text: s[1] }))); });
    v.appendChild(h("header", { class: "doc-head wide" }, h("h1", { class: "h-doc", text: "Sources & Methods" }),
      h("p", { class: "lede", text: S.lede }), stats));
    var grid = h("div", { class: "sources" });
    S.sections.forEach(function (sec) {
      var s = h("section", null, h("h2", { text: sec.title }));
      (sec.paras || []).forEach(function (t) { s.appendChild(h("p", { text: t })); });
      if (sec.items) {
        var ul = h("ul");
        sec.items.forEach(function (it) { ul.appendChild(h("li", null, it.url ? h("a", { href: it.url, text: it.title }) : h("span", { text: it.title }), it.detail ? ". " + it.detail : "")); });
        s.appendChild(ul);
      }
      grid.appendChild(s);
    });
    v.appendChild(grid);
    var more = h("section", { class: "strip" }, h("h2", { class: "h-sec", text: "More Founding Documents" }));
    var ml = h("div", { class: "home-cta" });
    ["articles", "proposed"].forEach(function (id) { if (CORE.docs[id]) ml.appendChild(h("a", { class: "btn ghost", href: "#" + id, text: CORE.docs[id].title })); });
    more.appendChild(ml);
    v.appendChild(more);
    var cred = h("div", { class: "credits" });
    CORE.portraitCredits.forEach(function (c) { cred.appendChild(h("p", null, h("strong", { text: c.n + ": " }), c.credit + " ", h("a", { href: c.url, text: "Commons" }))); });
    v.appendChild(h("section", { class: "strip" }, h("h2", { class: "h-sec", text: "Portrait Credits" }), cred));
  }

  // ---------------------------------------------------------------- shared bits
  function skeleton(n) {
    var s = h("div", { class: "skeleton", "aria-hidden": "true" });
    for (var i = 0; i < n; i++) s.appendChild(h("span"));
    return s;
  }
  function errorBox(e) {
    var msg = location.protocol === "file:" ?
      "This text could not be loaded. Keep the site folder together (index.html, assets and data side by side) and open index.html again." :
      "This text could not be loaded. Check your connection and reload the page.";
    if (window.console) console.warn("[founders-debate]", e && e.message);
    return h("div", { class: "error-box", role: "alert" }, h("strong", { text: "Couldn't open this. " }), msg);
  }

  function applyTheme(t) {
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return "light"; // daylight unless candlelight was chosen
  }
  var SIZES = ["1.02rem", "1.13rem", "1.26rem", "1.4rem"];
  function applySize(i) {
    document.documentElement.style.setProperty("--reader-size", SIZES[i]);
  }

  function boot() {
    viewEl = document.getElementById("view");
    var saved = store_get("theme");
    if (saved) applyTheme(saved);
    var sz = parseInt(store_get("size") || "1", 10);
    if (!(sz >= 0 && sz < SIZES.length)) sz = 1;
    applySize(sz);
    document.getElementById("theme-btn").addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next); store_set("theme", next);
      toast(next === "dark" ? "Candlelight On" : "Daylight On");
    });
    document.getElementById("size-btn").addEventListener("click", function () {
      sz = (sz + 1) % SIZES.length; applySize(sz); store_set("size", String(sz));
      toast("Text Size " + (sz + 1) + " of " + SIZES.length);
    });
    document.getElementById("skip").addEventListener("click", function (e) { e.preventDefault(); var m = document.getElementById("main"); m.focus(); m.scrollIntoView(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && quoteOpen) { e.preventDefault(); var b = quoteOpen.btn; closeQuote(); b.focus(); return; }
      if (e.key === "Escape" && glossEl && !glossEl.hidden) { e.preventDefault(); closeGloss(); }
    });
    // a click anywhere outside the open passage dropdown folds it away
    document.addEventListener("click", function (e) { if (quoteOpen && !quoteOpen.panel.contains(e.target) && !quoteOpen.btn.contains(e.target)) closeQuote(); }, true);
    window.addEventListener("hashchange", function () { state.cameInternal = true; onRoute(); });
    need("core").then(function (c) {
      ["people", "docs", "debated", "superseded", "anchorText", "chunks", "images"].forEach(function (k) { c[k] = dict(c[k]); });
      CORE = c;
      onRoute();
    }).catch(function (e) {
      clear(viewEl).appendChild(errorBox(e));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
