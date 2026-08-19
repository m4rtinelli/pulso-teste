/* ============================================================
   Pulso · comportamentos
   Um IIFE por seção, cada um dono só do seu elemento. Os loops
   de animação e os timers só correm com a seção na tela.
   ============================================================ */

(function(){
"use strict";

var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var css = function(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

/* ---------------- tema ---------------- */
var themeBtn = document.getElementById("theme");
themeBtn.addEventListener("click", function(){
  var dark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
  themeBtn.textContent = dark ? "☾" : "☀";
});

/* ---------------- relógio ---------------- */
var clock = document.getElementById("clock");
setInterval(function(){
  var d = new Date(), p = function(n){ return String(n).padStart(2,"0"); };
  clock.textContent = p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());
}, 1000);

/* ---------------- trilho + revelação ---------------- */
var secs = [].slice.call(document.querySelectorAll(".sec"));
var rail = document.getElementById("rail");
secs.forEach(function(s){
  var a = document.createElement("a");
  a.href = "#" + s.id;
  a.setAttribute("data-label", s.dataset.label);
  rail.appendChild(a);
});
var links = [].slice.call(rail.children);

var revealObs = new IntersectionObserver(function(es){
  es.forEach(function(e){ if (e.isIntersecting) e.target.classList.add("vis"); });
}, { threshold: 0.15 });
secs.forEach(function(s){ revealObs.observe(s); });

var railObs = new IntersectionObserver(function(es){
  es.forEach(function(e){
    if (!e.isIntersecting) return;
    var i = secs.indexOf(e.target);
    links.forEach(function(l, j){ l.classList.toggle("on", j === i); });
  });
}, { threshold: 0.5 });
secs.forEach(function(s){ railObs.observe(s); });

/* Roda um loop de animação apenas enquanto o elemento estiver visível. */
function whenVisible(el, step){
  var live = false, raf = 0, t0 = performance.now();
  /* movimento reduzido: desenha um quadro e para por aí */
  if (reduce){ requestAnimationFrame(function(){ step(0.7, performance.now()); }); return; }
  function frame(t){ if(!live) return; step((t - t0) / 1000, t); raf = requestAnimationFrame(frame); }
  new IntersectionObserver(function(es){
    es.forEach(function(e){
      if (e.isIntersecting && !live){ live = true; t0 = performance.now() - 1; raf = requestAnimationFrame(frame); }
      else if (!e.isIntersecting && live){ live = false; cancelAnimationFrame(raf); }
    });
  }, { threshold: 0.05 }).observe(el);
}

/* Timer que só corre com o elemento na tela. */
function whenVisibleTick(el, ms, fn){
  var id = 0;
  new IntersectionObserver(function(es){
    es.forEach(function(e){
      if (e.isIntersecting && !id) id = setInterval(fn, ms);
      else if (!e.isIntersecting && id){ clearInterval(id); id = 0; }
    });
  }, { threshold: 0.15 }).observe(el);
}

/* Canvas com DPR correto, redimensionado com o elemento. */
function fitCanvas(cv){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize(){
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv._w = r.width; cv._h = r.height;
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener("resize", resize);
  return cv.getContext("2d");
}

/* ============ 01 · halo ============ */
(function(){
  var btn = document.getElementById("btn-halo");
  var out = document.getElementById("halo-count");
  var n = 0;
  btn.addEventListener("click", function(e){
    var r = btn.getBoundingClientRect();
    var d = document.createElement("span");
    d.className = "ripple";
    d.style.left = (e.clientX - r.left) + "px";
    d.style.top = (e.clientY - r.top) + "px";
    d.style.width = d.style.height = Math.max(r.width, r.height) / 4 + "px";
    btn.appendChild(d);
    setTimeout(function(){ d.remove(); }, 700);
    n++;
    out.textContent = n + (n === 1 ? " disparo" : " disparos");
  });
})();

/* ============ 02 · enxame ============
   Cada nó pulsa na fase que sorteou. Um fator de coerência sobe a cada
   ~15s e puxa todas as fases para o mesmo ponto: o campo passa de
   cintilação para batida em uníssono, e volta. */
(function(){
  var cv = document.getElementById("c-swarm");
  var ctx = fitCanvas(cv);
  var parts = [], waves = [], mx = -999, my = -999;
  var nEl = document.getElementById("swarm-n"), cEl = document.getElementById("swarm-coh");

  function seed(){
    var w = cv._w, h = cv._h;
    var target = Math.round(Math.max(50, Math.min(130, (w * h) / 3200)));
    parts = [];
    for (var i = 0; i < target; i++){
      parts.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * 14, vy: (Math.random() - .5) * 14,
        r: 1.6 + Math.random() * 2.6,
        ph: Math.random() * Math.PI * 2,
        boost: 0
      });
    }
    nEl.textContent = parts.length;
  }
  seed();
  if (window.ResizeObserver) new ResizeObserver(function(){ seed(); }).observe(cv);

  cv.addEventListener("pointermove", function(e){
    var r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
  });
  cv.addEventListener("pointerleave", function(){ mx = my = -999; });
  cv.addEventListener("pointerdown", function(e){
    var r = cv.getBoundingClientRect();
    waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: 0 });
  });

  var last = 0;
  whenVisible(cv, function(t){
    var dt = Math.min(.05, t - last); last = t;
    var w = cv._w, h = cv._h, acc = css("--accent") || "#fff";
    ctx.clearRect(0, 0, w, h);

    /* coerência: quase sempre zero, com picos curtos de sincronia */
    var coh = Math.pow(Math.max(0, Math.sin(t * .42)), 6);
    cEl.textContent = Math.round(coh * 100) + "%";

    /* ondas de choque emitidas pelo clique */
    waves = waves.filter(function(v){ return v.t < 2.4; });
    waves.forEach(function(v){
      v.t += dt;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.t * 420, 0, 6.2832);
      ctx.strokeStyle = acc; ctx.globalAlpha = Math.max(0, .45 - v.t * .22);
      ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    });

    /* ligações locais: só aparecem perto do ponteiro ou no pico de coerência */
    ctx.lineWidth = 1; ctx.strokeStyle = acc;
    for (var i = 0; i < parts.length; i++){
      var a = parts[i];
      for (var j = i + 1; j < parts.length; j++){
        var b = parts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > 9500) continue;
        var near = Math.min(Math.hypot(a.x - mx, a.y - my), Math.hypot(b.x - mx, b.y - my));
        var k = (1 - d2 / 9500) * (near < 160 ? .45 : .08 + coh * .16);
        ctx.globalAlpha = k * .45;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    parts.forEach(function(p){
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0) p.x += w; if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;

      waves.forEach(function(v){
        var d = Math.hypot(p.x - v.x, p.y - v.y), front = v.t * 420;
        if (Math.abs(d - front) < 48) p.boost = Math.max(p.boost, 1 - Math.abs(d - front) / 48);
      });
      p.boost *= .955;

      var dm = Math.hypot(p.x - mx, p.y - my);
      var near = dm < 175 ? (1 - dm / 175) : 0;
      /* a fase é apagada conforme a coerência sobe → todos batem juntos */
      var s = .5 + .5 * Math.sin(t * 2.2 + p.ph * (1 - coh));
      var amp = .75 + near * .9 + p.boost * 1.7 + coh * .5;
      var rr = p.r * (.55 + s * amp);
      var al = .12 + s * (.5 + near * .35 + coh * .25) + p.boost * .45;

      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.2832);
      ctx.fillStyle = acc; ctx.globalAlpha = Math.min(1, al); ctx.fill();

      /* halo largo: é ele que faz a batida se ler como luz */
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 2.6, 0, 6.2832);
      ctx.globalAlpha = Math.min(.3, (s * .10) + near * .12 + p.boost * .18 + coh * .06);
      ctx.fill(); ctx.globalAlpha = 1;
    });
  });
})();

/* ============ 03 · aviso ============
   Três pulsos de evento (sino, badge, borda) disparam uma vez na chegada.
   O ponto de não lido é o único que repete: pulso de estado. */
(function(){
  var bell = document.getElementById("bell");
  var badge = document.getElementById("bell-badge");
  var stack = document.getElementById("stack");
  var clear = document.getElementById("bell-clear");
  var msgs = [
    "novo preset salvo",
    "render concluído · 600×600",
    "Marina comentou no globo",
    "sequência exportada em svg",
    "padrão sincronizado",
    "backup do traçado feito"
  ];
  var unread = 0, i = 0;

  function dismiss(el){
    if (!el || el._go) return;
    el._go = 1; el.classList.add("out");
    setTimeout(function(){ el.remove(); }, 460);
  }

  function fire(){
    var el = document.createElement("div");
    el.className = "toast fresh";
    var dot = document.createElement("span"); dot.className = "un";
    var box = document.createElement("div");
    var tx = document.createElement("div"); tx.className = "tx"; tx.textContent = msgs[i % msgs.length];
    var tm = document.createElement("div"); tm.className = "tm"; tm.textContent = "agora mesmo";
    box.appendChild(tx); box.appendChild(tm);
    el.appendChild(dot); el.appendChild(box);
    stack.insertBefore(el, stack.firstChild);
    requestAnimationFrame(function(){ el.classList.add("in"); });
    i++;

    unread++; badge.textContent = unread; badge.classList.add("on");
    bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring");

    while (stack.children.length > 3) dismiss(stack.lastChild);
    setTimeout(function(){ dismiss(el); }, 6000);
  }

  bell.addEventListener("click", fire);
  clear.addEventListener("click", function(){
    unread = 0; badge.classList.remove("on");
    [].slice.call(stack.children).forEach(dismiss);
  });
  whenVisibleTick(stack, 4200, fire);
  setTimeout(function(){
    if (stack.getBoundingClientRect().top < window.innerHeight) fire();
  }, 600);
})();

/* ============ 04 · sonar ============ */
(function(){
  var cv = document.getElementById("c-sonar");
  var ctx = fitCanvas(cv);
  var hitsEl = document.getElementById("sonar-hits");
  var blips = [], period = 4.2, prevAng = 0;

  function seed(){
    blips = [];
    var n = 7 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++){
      blips.push({ a: Math.random() * 6.2832, d: .18 + Math.random() * .78, lit: 0 });
    }
    hitsEl.textContent = blips.length;
  }
  seed();

  whenVisible(cv, function(t){
    var w = cv._w, h = cv._h, cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) * .42;
    var acc = css("--accent"), track = css("--track");
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = track; ctx.lineWidth = 1;
    for (var i = 1; i <= 4; i++){
      ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, 6.2832); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

    var pu = (t / 2.1) % 1;
    ctx.beginPath(); ctx.arc(cx, cy, R * pu, 0, 6.2832);
    ctx.strokeStyle = acc; ctx.globalAlpha = (1 - pu) * .32; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = 1;

    var ang = (t / period) * 6.2832 % 6.2832;
    for (var s = 0; s < 100; s++){
      var a = ang - s * .012;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = acc; ctx.globalAlpha = (1 - s / 100) * .16; ctx.lineWidth = 2.4; ctx.stroke();
    }
    ctx.globalAlpha = 1;

    blips.forEach(function(b){
      var da = ((ang - b.a) % 6.2832 + 6.2832) % 6.2832;
      if (da < .09) b.lit = 1;
      b.lit *= .988;
      var x = cx + Math.cos(b.a) * R * b.d, y = cy + Math.sin(b.a) * R * b.d;
      var rr = 3 + b.lit * 3;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832);
      ctx.fillStyle = acc; ctx.globalAlpha = .16 + b.lit * .84; ctx.fill();
      if (b.lit > .05){
        ctx.beginPath(); ctx.arc(x, y, rr + (1 - b.lit) * 26, 0, 6.2832);
        ctx.strokeStyle = acc; ctx.lineWidth = 1.4; ctx.globalAlpha = b.lit * .5; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    if (ang < prevAng) seed();
    prevAng = ang;
  });
})();

/* ============ 05 · matriz ============ */
(function(){
  var host = document.getElementById("matrix");
  var COLS = 16, ROWS = 9, cells = [];
  host.style.gridTemplateColumns = "repeat(" + COLS + ", 1fr)";
  for (var r = 0; r < ROWS; r++){
    for (var c = 0; c < COLS; c++){
      var s = document.createElement("span");
      host.appendChild(s); cells.push(s);
    }
  }
  var ox = COLS / 2 - .5, oy = ROWS / 2 - .5;
  host.addEventListener("pointermove", function(e){
    var r = host.getBoundingClientRect();
    ox = ((e.clientX - r.left) / r.width) * COLS - .5;
    oy = ((e.clientY - r.top) / r.height) * ROWS - .5;
  });
  host.addEventListener("pointerleave", function(){ ox = COLS / 2 - .5; oy = ROWS / 2 - .5; });

  whenVisible(host, function(t){
    var accent = css("--accent");
    for (var i = 0; i < cells.length; i++){
      var el = cells[i], c = i % COLS, r = (i / COLS) | 0;
      var d = Math.hypot(c - ox, r - oy);
      var u = Math.sin(t * 2.4 - d * .55);   /* uma onda só, lida com atraso */
      var fall = Math.max(0, 1 - d / 11);
      var k = Math.max(0, u) * fall;
      el.style.transform = "scale(" + (.58 + k * .62) + ")";
      el.style.opacity = String(.16 + k * .84);
      el.style.background = k > .06 ? accent : "";
    }
  });
})();

/* ============ 06 · carga ============ */
(function(){
  var fill = document.getElementById("prog-fill");
  var pct = document.getElementById("prog-pct");
  var label = document.getElementById("prog-label");
  var etapas = ["compilando geometria", "resolvendo traçado", "aplicando pontas", "escrevendo svg"];
  var v = 0, i = 0;
  whenVisibleTick(fill, 320, function(){
    v += Math.random() * 7;
    if (v >= 100){ v = 0; i = (i + 1) % etapas.length; label.textContent = etapas[i]; }
    fill.style.width = v.toFixed(1) + "%";
    pct.textContent = Math.round(v) + "%";
  });
})();

/* ============ 08 · respiro ============ */
(function(){
  var word = document.getElementById("breath-word");
  var fases = [["inspire", 4000], ["segure", 3000], ["solte", 5000]];
  var k = 0;
  (function next(){
    word.textContent = fases[k][0];
    var ms = fases[k][1];
    k = (k + 1) % fases.length;
    setTimeout(next, ms);
  })();
})();

/* ============ 09 · compasso ============
   O pulso vira métrica: a cabeça de leitura varre 16 passos e só o que
   está marcado acende na passagem. Clique reescreve o padrão. */
(function(){
  var rowsHost = document.getElementById("seq-rows");
  var stepEl = document.getElementById("seq-step");
  var metro = document.getElementById("metro");
  var nomes = ["bumbo", "caixa", "chimbal", "clave"];
  var pat = [
    [1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,0,0],
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0]
  ];
  var cells = [], rowEls = [];

  nomes.forEach(function(nm, r){
    var row = document.createElement("div"); row.className = "row";
    var lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = nm;
    var steps = document.createElement("div"); steps.className = "steps";
    var arr = [];
    for (var c = 0; c < 16; c++){
      var b = document.createElement("button");
      b.type = "button";
      b.className = "st" + (pat[r][c] ? " on" : "") + (c % 4 === 0 ? " beat" : "");
      b.setAttribute("aria-label", nm + " passo " + (c + 1));
      (function(rr, cc, el){
        el.addEventListener("click", function(){
          pat[rr][cc] = pat[rr][cc] ? 0 : 1;
          el.classList.toggle("on", !!pat[rr][cc]);
        });
      })(r, c, b);
      steps.appendChild(b); arr.push(b);
    }
    row.appendChild(lbl); row.appendChild(steps);
    rowsHost.appendChild(row); cells.push(arr); rowEls.push(row);
  });

  var stepDur = 60 / 96 / 2;   /* colcheias a 96 bpm */
  var cur = -1;
  whenVisible(rowsHost, function(t){
    var s = Math.floor(t / stepDur) % 16;
    if (s === cur) return;
    cur = s;
    stepEl.textContent = "passo " + String(s + 1).padStart(2, "0");
    metro.classList.toggle("on", s % 4 === 0);
    for (var r = 0; r < cells.length; r++){
      for (var c = 0; c < 16; c++) cells[r][c].classList.toggle("now", c === s);
      rowEls[r].classList.toggle("hit", !!pat[r][s]);
    }
  });
})();

/* ============ 10 · letra ============ */
(function(){
  var host = document.getElementById("wordmark");
  var texto = "everblue";
  for (var i = 0; i < texto.length; i++){
    var s = document.createElement("span");
    s.textContent = texto[i];
    s.style.animationDelay = (i * 0.06) + "s";
    host.appendChild(s);
  }
  var caret = document.createElement("span");
  caret.className = "caret";
  host.appendChild(caret);
})();

})();
