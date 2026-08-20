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


/* ============ capa · marca do globo ============
   A mesma geometria do gerador: projeção ortográfica de verdade, com
   silhueta aberta ("e"), um meridiano e um paralelo recortados onde
   passam para trás da esfera. O ponteiro pilota rotação e inclinação, e
   o cruzamento dos dois eixos é que aponta para ele — mesma amplitude
   (45°/28°) e mesma suavização (0.14 por quadro) do app. */
(function(){
  var mark = document.getElementById("mark");
  var g = document.getElementById("mk");
  if (!mark || !g) return;

  var R = 88;                        /* raio na viewBox centrada da capa */
  var AP = .15, GAP = 40, ANCHOR = true;   /* abertura do "e", como no preset */
  var REST_Y = 22, REST_X = 10;      /* pose de repouso: um três-quartos */
  var AMPY = 45, AMPX = 28, EASE = .14;

  var tY = 0, tX = 0, cY = 0, cX = 0, raf = 0, viva = false;
  var NS = "http://www.w3.org/2000/svg", pool = [];

  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function rad(a){ return a * Math.PI / 180; }
  function lerpPt(a, b, t){ return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

  /* gira em Y, depois inclina em X; z > 0 é a metade da frente */
  function project(lat, lon, rotY, rotX){
    var la = rad(lat), lo = rad(lon);
    var x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
    var x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    var z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
    var y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    var z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
    return { x: x1 * R, y: -y2 * R, z: z2 };
  }

  function ptsToD(pts){
    var u = [], eps = 1e-6;
    for (var i = 0; i < pts.length; i++){
      var q = u[u.length - 1];
      if (q && Math.abs(pts[i].x - q.x) < eps && Math.abs(pts[i].y - q.y) < eps) continue;
      u.push(pts[i]);
    }
    if (u.length < 2) return "";
    var d = "";
    for (var k = 0; k < u.length; k++) d += (k ? "L" : "M") + u[k].x.toFixed(2) + " " + u[k].y.toFixed(2);
    return d;
  }

  /* todo ponto de z = 0 está sobre a silhueta: reescalar para o raio põe
     o corte em cima dela, e não por dentro como faria a corda interpolada */
  function onRim(p){
    var m = Math.hypot(p.x, p.y) || 1;
    return { x: p.x * R / m, y: p.y * R / m };
  }
  function corte(a, b){ return onRim(lerpPt(a, b, a.z / (a.z - b.z))); }

  /* parte o anel nos trechos da frente e fecha cada ponta na borda */
  function recorta(pts){
    var n = pts.length, runs = [], cur = null;
    for (var i = 0; i < n; i++){
      if (pts[i].z >= 0){
        if (!cur){ cur = []; if (i > 0) cur.push(corte(pts[i - 1], pts[i])); runs.push(cur); }
        cur.push(pts[i]);
      } else if (cur){
        cur.push(corte(pts[i - 1], pts[i]));
        cur = null;
      }
    }
    /* anel cortado no índice 0: as duas pontas são o mesmo trecho */
    if (runs.length > 1 && pts[0].z >= 0 && pts[n - 1].z >= 0){
      runs.push(runs.pop().concat(runs.shift()));
    }
    return runs.map(ptsToD).filter(Boolean);
  }

  function meridiano(lon, rotY, rotX){
    var pts = [], i;
    for (i = 0; i <= 72; i++) pts.push(project(-90 + 180 * i / 72, lon, rotY, rotX));
    for (i = 1; i <= 72; i++) pts.push(project(90 - 180 * i / 72, lon + 180, rotY, rotX));
    pts.push(pts[0]);
    return pts;
  }
  /* amostrar já no ângulo girado mantém o desenho idêntico em qualquer
     rotação, em vez de cintilar sub-pixel com a fase das amostras */
  function paralelo(lat, rotY, rotX){
    var pts = [], off = rotY * 180 / Math.PI;
    for (var i = 0; i <= 96; i++) pts.push(project(lat, -180 + 360 * i / 96 - off, rotY, rotX));
    return pts;
  }
  /* ângulo 0 = 3h, onde o equador toca a silhueta: é ali que a abertura
     do "e" nasce, qualquer que seja a rotação */
  /* O corte reto vale só na ponta de baixo da abertura; todo o resto do
     desenho é arredondado. Como no SVG o linecap vale para as duas pontas
     do mesmo caminho, o aro vai reto nas duas e a de cima é devolvida ao
     arredondado por um segmento à parte, desenhado por cima dela: a tampa
     redonda dele reconstrói a que o aro perdeu, e a outra ponta do
     segmento fica enterrada dentro do próprio aro. */
  function silhueta(){
    var span = AP * 144;
    var s = ANCHOR ? span : GAP + span / 2;
    var e = ANCHOR ? 360 : GAP + 360 - span / 2;
    var pts = [];
    for (var i = 0; i <= 120; i++){
      var a = rad(s + (e - s) * i / 120);
      pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
    }
    /* "de cima" é medido, não suposto: com a abertura solta do vértice o
       aro pode começar por qualquer lado */
    var u = pts.length - 1;
    var cima = pts[0].y <= pts[u].y ? [pts[1], pts[0]] : [pts[u - 1], pts[u]];
    return [{ d: ptsToD(pts), aro: 1 }, { d: ptsToD(cima), aro: 0 }];
  }

  function via(i){
    if (!pool[i]){ pool[i] = document.createElementNS(NS, "path"); g.appendChild(pool[i]); }
    return pool[i];
  }
  function desenha(){
    var rotY = rad(REST_Y + cY), rotX = rad(REST_X + cX);
    var ds = silhueta();
    var linha = function(d){ ds.push({ d: d, aro: 0 }); };
    recorta(meridiano(0, rotY, rotX)).forEach(linha);
    recorta(paralelo(0, rotY, rotX)).forEach(linha);
    var n = Math.max(ds.length, pool.length);
    for (var i = 0; i < n; i++){
      var p = via(i);
      if (i < ds.length){
        p.setAttribute("d", ds[i].d);
        p.setAttribute("class", ds[i].aro ? "aro" : "");
        p.removeAttribute("display");
      } else p.setAttribute("display", "none");
    }
  }

  function tick(){
    var dY = tY - cY, dX = tX - cX;
    if (Math.abs(dY) < .08 && Math.abs(dX) < .08){
      cY = tY; cX = tX; desenha(); raf = 0; return;
    }
    cY += dY * EASE; cX += dX * EASE;
    desenha();
    raf = requestAnimationFrame(tick);
  }
  function acorda(){ if (!raf) raf = requestAnimationFrame(tick); }
  function repouso(){ tY = tX = 0; acorda(); }

  desenha();
  if (reduce) return;   /* movimento reduzido: fica na pose de repouso */

  window.addEventListener("pointermove", function(e){
    if (!viva || e.pointerType === "touch") return;
    var r = mark.getBoundingClientRect();
    var nx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
    var ny = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
    tY = nx * AMPY; tX = ny * AMPX;
    acorda();
  });
  document.addEventListener("pointerleave", repouso);
  window.addEventListener("blur", repouso);

  /* fora da capa o ponteiro não pilota mais, e a marca volta ao repouso */
  new IntersectionObserver(function(es){
    es.forEach(function(e){
      viva = e.isIntersecting;
      if (!viva) repouso();
    });
  }, { threshold: 0.25 }).observe(mark);
})();

/* ============ 01 · impulso ============
   Marcha lenta constante e um surto no clique: a casca recua, a câmara
   acende e o escape sai por baixo do botão. O empuxo volta sozinho para
   a marcha lenta em pouco mais de um segundo. */
(function(){
  var cv = document.getElementById("c-thrust");
  var ctx = fitCanvas(cv);
  var btn = document.getElementById("btn-thrust");
  var shell = document.getElementById("btn-shell");
  var cut = document.getElementById("btn-cut");
  var out = document.getElementById("thrust-count");
  var parts = [], power = .12, acc = 0, shown = -1;

  /* a boca do escape é a base do botão, medida a cada quadro */
  function nozzle(){
    var r = btn.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.bottom - c.top - 6, w: r.width * .42 };
  }

  btn.addEventListener("click", function(e){
    power = 1;
    shell.classList.remove("fire"); void shell.offsetWidth; shell.classList.add("fire");
    var r = btn.getBoundingClientRect();
    var d = document.createElement("span");
    d.className = "ripple";
    d.style.left = (e.clientX - r.left) + "px";
    d.style.top = (e.clientY - r.top) + "px";
    d.style.width = d.style.height = Math.max(r.width, r.height) / 4 + "px";
    btn.appendChild(d);
    setTimeout(function(){ d.remove(); }, 700);
  });
  cut.addEventListener("click", function(){ power = 0; });

  var last = 0;
  whenVisible(cv, function(t){
    var dt = Math.min(.05, t - last); last = t;
    var w = cv._w, h = cv._h, col = css("--accent");
    ctx.clearRect(0, 0, w, h);

    power += (.12 - power) * Math.min(1, dt * 1.9);   /* tudo tende à marcha lenta */
    var n = nozzle();

    /* jato colado no bocal: o núcleo que não apaga */
    var jl = 54 + power * 150;
    var g = ctx.createLinearGradient(0, n.y, 0, n.y + jl);
    g.addColorStop(0, col); g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.globalAlpha = .14 + power * .4;
    ctx.beginPath();
    ctx.moveTo(n.x - n.w * .62, n.y);
    ctx.lineTo(n.x + n.w * .62, n.y);
    ctx.lineTo(n.x + n.w * .18, n.y + jl);
    ctx.lineTo(n.x - n.w * .18, n.y + jl);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    /* emissão proporcional ao empuxo */
    acc += (12 + power * 250) * dt;
    while (acc >= 1){
      acc -= 1;
      parts.push({
        x: n.x + (Math.random() - .5) * n.w,
        y: n.y,
        vx: (Math.random() - .5) * 46,
        vy: 70 + power * 520 + Math.random() * 90,
        life: 0, max: .5 + Math.random() * .5,
        r: .8 + Math.random() * 1.6
      });
    }

    ctx.strokeStyle = col; ctx.lineCap = "round";
    parts = parts.filter(function(p){
      p.life += dt;
      if (p.life > p.max || p.y > h + 20) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= .99;
      var k = 1 - p.life / p.max;
      ctx.globalAlpha = k * .8;
      ctx.lineWidth = p.r * k * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * .02, p.y - p.vy * .022);   /* rastro no sentido do voo */
      ctx.stroke();
      return true;
    });
    ctx.globalAlpha = 1;

    var pc = Math.round(power * 100);
    if (pc !== shown){
      shown = pc;
      out.textContent = pc <= 13 ? "marcha lenta" : "empuxo " + pc + "%";
    }
  });
})();

/* ============ 02 · aceleração ============
   O campo inteiro corre para fora do ponto de fuga. A velocidade fica
   em 1× quase o tempo todo e dá surtos curtos: no surto o rastro estica,
   que é como a aceleração se lê — comprimento, não posição. */
(function(){
  var cv = document.getElementById("c-warp");
  var ctx = fitCanvas(cv);
  var vEl = document.getElementById("warp-v"), nEl = document.getElementById("warp-n");
  var st = [], boost = 0, nextPulse = 2.5, fx = .5, fy = .5, last = 0, shown = "";

  function spawn(z){
    return { a: Math.random() * 6.2832, r: .05 + Math.random() * .95, z: z, prev: 0 };
  }
  function seed(){
    var w = cv._w, h = cv._h;
    var n = Math.round(Math.max(90, Math.min(240, (w * h) / 1700)));
    st = [];
    for (var i = 0; i < n; i++) st.push(spawn(.05 + Math.random() * .95));
    nEl.textContent = st.length;
  }
  seed();
  if (window.ResizeObserver) new ResizeObserver(function(){ seed(); }).observe(cv);

  cv.addEventListener("pointermove", function(e){
    var r = cv.getBoundingClientRect();
    fx = (e.clientX - r.left) / r.width;
    fy = (e.clientY - r.top) / r.height;
  });
  cv.addEventListener("pointerleave", function(){ fx = fy = .5; });
  cv.addEventListener("pointerdown", function(){ boost = 1; });

  whenVisible(cv, function(t){
    var dt = Math.min(.05, t - last); last = t;
    var w = cv._w, h = cv._h, col = css("--accent");
    var cx = w * fx, cy = h * fy, R = Math.min(w, h) * .5;
    var diag = Math.hypot(w, h);
    ctx.clearRect(0, 0, w, h);

    if (t > nextPulse){ boost = 1; nextPulse = t + 4 + Math.random() * 3; }
    boost *= Math.pow(.28, dt);                 /* surto decai em ~1.2s */
    var speed = 1 + boost * 8;

    ctx.strokeStyle = col; ctx.lineCap = "round";
    st.forEach(function(p){
      p.prev = p.r * R * (1 / p.z - 1);
      p.z -= dt * .30 * speed;
      if (p.z < .04){ var q = spawn(1); p.a = q.a; p.r = q.r; p.z = 1; p.prev = 0; }
      var rad = p.r * R * (1 / p.z - 1);
      if (rad > diag){ var s = spawn(1); p.a = s.a; p.r = s.r; p.z = 1; return; }
      var ca = Math.cos(p.a), sa = Math.sin(p.a);
      var k = Math.min(1, (1 - p.z) * 1.5);
      ctx.globalAlpha = .12 + k * .8;
      ctx.lineWidth = .6 + k * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + ca * p.prev, cy + sa * p.prev);
      ctx.lineTo(cx + ca * rad, cy + sa * rad);
      ctx.stroke();
    });

    /* o ponto de fuga também bate, no ritmo do surto */
    ctx.globalAlpha = .25 + boost * .6;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, 2 + boost * 5, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;

    var v = speed.toFixed(1) + "×";
    if (v !== shown){ shown = v; vEl.textContent = v; }
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

/* ============ 04 · empuxo ============
   Um bocal, uma pluma e um acelerador. A câmara bate a 7 Hz o tempo
   todo; o que muda com o acelerador é o comprimento da pluma e o
   espaçamento dos diamantes de mach. */
(function(){
  var cv = document.getElementById("c-plume");
  var ctx = fitCanvas(cv);
  var thrEl = document.getElementById("plume-thr"), modeEl = document.getElementById("plume-mode");
  var thr = .35, manual = -1, surge = 0, shown = -1, wasManual = null, last = 0;

  cv.addEventListener("pointermove", function(e){
    var r = cv.getBoundingClientRect();
    manual = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
  });
  cv.addEventListener("pointerleave", function(){ manual = -1; });
  cv.addEventListener("pointerdown", function(){ surge = 1; });

  whenVisible(cv, function(t){
    var dt = Math.min(.05, t - last); last = t;
    var w = cv._w, h = cv._h, col = css("--accent");
    ctx.clearRect(0, 0, w, h);

    surge *= Math.pow(.2, dt);
    var alvo = manual >= 0 ? manual : .45 + .3 * Math.sin(t * .7) * Math.sin(t * .23 + 1);
    thr += (Math.min(1, alvo + surge) - thr) * Math.min(1, dt * 6);

    var cx = w / 2, top = h * .20;
    var bell = Math.min(w, h) * .13;
    var len = h * .28 + h * .48 * thr;
    var beat = .5 + .5 * Math.sin(t * 44);          /* ~7 Hz na câmara */

    /* bocal */
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.globalAlpha = .9;
    ctx.beginPath();
    ctx.moveTo(cx - bell * .5, top - bell * .95); ctx.lineTo(cx - bell, top);
    ctx.moveTo(cx + bell * .5, top - bell * .95); ctx.lineTo(cx + bell, top);
    ctx.moveTo(cx - bell, top); ctx.lineTo(cx + bell, top);
    ctx.stroke();

    /* pluma em fatias: largura oscila, opacidade cai com a distância */
    ctx.fillStyle = col;
    var slices = 46;
    for (var i = 0; i < slices; i++){
      var u = i / slices;
      var y = top + u * len;
      var wob = 1 + .10 * Math.sin(u * 16 - t * 9) + .05 * beat;
      var rad = bell * (1 - u * .5) * (.5 + thr * .6) * wob;
      ctx.globalAlpha = (1 - u) * (.08 + thr * .26);
      ctx.beginPath();
      ctx.ellipse(cx, y, rad, (len / slices) * 1.7, 0, 0, 6.2832);
      ctx.fill();
    }

    /* diamantes de mach: pulsam juntos e se afastam quando o empuxo sobe */
    var nd = 4, sp = (len / (nd + 1)) * (.72 + thr * .5);
    for (var d = 0; d < nd; d++){
      var y2 = top + sp * (d + .85);
      if (y2 > top + len) break;
      var k = (1 - d / nd) * (.3 + thr * .7) * (.65 + .35 * Math.sin(t * 44 - d));
      var rr = bell * (.44 - d * .07) * (.55 + thr * .65);
      ctx.globalAlpha = Math.max(0, k);
      ctx.beginPath();
      ctx.moveTo(cx, y2 - rr * 1.5); ctx.lineTo(cx + rr, y2);
      ctx.lineTo(cx, y2 + rr * 1.5); ctx.lineTo(cx - rr, y2);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* acelerador */
    var gx = w - 40, gy0 = h * .2, gy1 = h * .8;
    ctx.strokeStyle = css("--track"); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx, gy1); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(gx, gy1); ctx.lineTo(gx, gy1 - (gy1 - gy0) * thr); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(gx, gy1 - (gy1 - gy0) * thr, 4.5 + beat * 2.5, 0, 6.2832); ctx.fill();

    var pc = Math.round(thr * 100);
    if (pc !== shown){ shown = pc; thrEl.textContent = pc + "%"; }
    var md = manual >= 0;
    if (md !== wasManual){ wasManual = md; modeEl.textContent = md ? "manual" : "automático"; }
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

/* ============ 10 · manobra ============
   Um slider e um interruptor movidos a empuxo, sem uma curva de easing
   sequer. O controlador é bang-bang: empurra na direção do alvo, vira e
   freia — e começa a frear cedo o bastante para caber a virada, porque
   girar leva tempo e ninguém queima motor girando. O resultado chega com
   velocidade zero no ponto pedido, que é o que easing nenhum garante. */
(function(){
  var cv = document.getElementById("c-move");
  var ctx = fitCanvas(cv);
  var valEl = document.getElementById("mv-val"), stEl = document.getElementById("mv-state");
  var A = 2600;            /* empuxo: aceleração constante, px/s²   */
  var TF = .22;            /* tempo de uma virada de 180°           */
  var last = 0, init = 0, idle = 0, drag = false, shownV = "", shownS = "";

  function mover(){ return { x:0, v:0, target:0, thrust:0, ang:0, want:0, emit:0, puffs:[], state:"acoplado" }; }
  var sl = mover(), tg = mover();
  tg.on = false;

  /* ---- o controlador, um só para os dois componentes ---- */
  function step(m, dt){
    var d = m.target - m.x, sp = Math.abs(m.v);
    var parado = Math.abs(d) < .8 && sp < 8;

    if (parado){
      m.x = m.target; m.v = 0; m.thrust = 0; m.state = "acoplado";
    } else {
      var dir = d >= 0 ? 1 : -1;
      var indo = m.v * dir > 0;
      /* distância de frenagem + o quanto ele ainda anda enquanto gira */
      var freio = (m.v * m.v) / (2 * A) + sp * TF;
      var freando = indo && Math.abs(d) <= freio;
      m.thrust = freando ? (m.v > 0 ? -1 : 1) : dir;
      m.want = m.thrust > 0 ? 0 : Math.PI;
      m.state = freando ? "freando" : "acelerando";
    }

    var da = m.want - m.ang;
    while (da > Math.PI) da -= 6.2832;
    while (da < -Math.PI) da += 6.2832;
    if (Math.abs(da) > .25 && !parado){ m.thrust = 0; m.state = "virada"; }  /* girando não queima */

    if (!parado){
      m.v += m.thrust * A * dt;
      m.x += m.v * dt;
      if (m.x < m.min){ m.x = m.min; m.v = 0; }
      if (m.x > m.max){ m.x = m.max; m.v = 0; }
    }

    var giro = (Math.PI / TF) * dt;
    m.ang += Math.abs(da) < giro ? da : (da > 0 ? giro : -giro);
  }

  /* onde a virada vai acontecer, resolvido de verdade:
     (1/A)·v² + TF·v − (s + u²/2A) = 0 → v de virada → distância até lá */
  function pontoDeVirada(m){
    var s = Math.abs(m.target - m.x), u = Math.abs(m.v);
    var v = (-TF + Math.sqrt(TF * TF + 4 * (s + u * u / (2 * A)) / A)) / (2 / A);
    var p = (v * v - u * u) / (2 * A);
    return m.x + (m.target >= m.x ? 1 : -1) * Math.max(0, p);
  }

  function solta(m, y){
    if (!m.thrust) return;
    m.puffs.push({
      x: m.x - m.thrust * 16, y: y + (Math.random() - .5) * 7,
      vx: -m.thrust * (140 + Math.random() * 240) + m.v * .3,
      vy: (Math.random() - .5) * 70,
      r: 1.4 + Math.random() * 3, life: 0, max: .4 + Math.random() * .4
    });
  }

  function puffs(m, col){
    ctx.fillStyle = col;
    m.puffs = m.puffs.filter(function(p){
      p.life += dtG;
      if (p.life > p.max) return false;
      p.x += p.vx * dtG; p.y += p.vy * dtG; p.vx *= .94; p.vy *= .94;
      var k = 1 - p.life / p.max;
      ctx.globalAlpha = k * .45;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 1.8), 0, 6.2832); ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;
  }

  function rrect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* casco com bocal na traseira, virado para o lado do empuxo */
  function casco(m, y, hw, hh, col, tempo){
    ctx.save();
    ctx.translate(m.x, y);
    ctx.rotate(m.ang);
    if (m.thrust){
      var fl = (18 + 26 * (.8 + .2 * Math.sin(tempo * 40)));
      var g = ctx.createLinearGradient(-hw, 0, -hw - fl, 0);
      g.addColorStop(0, col); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.globalAlpha = .85;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh * .55); ctx.lineTo(-hw, hh * .55);
      ctx.lineTo(-hw - fl, hh * .16); ctx.lineTo(-hw - fl, -hh * .16);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = col;
    rrect(-hw, -hh, hw * 2, hh * 2, Math.min(hw, hh)); ctx.fill();
    ctx.restore();
  }

  var dtG = 0;

  /* ---- entrada ---- */
  function alvoNaPista(e){
    var r = cv.getBoundingClientRect();
    var x = e.clientX - r.left;
    sl.target = Math.max(sl.min, Math.min(sl.max, x));
    idle = -2.4;
  }
  cv.addEventListener("pointerdown", function(e){
    var r = cv.getBoundingClientRect(), y = e.clientY - r.top;
    if (y > cv._h * .60){ tg.on = !tg.on; tg.target = tg.on ? tg.max : tg.min; idle = -2.4; }
    else { drag = true; cv.setPointerCapture(e.pointerId); alvoNaPista(e); }
  });
  cv.addEventListener("pointermove", function(e){ if (drag) alvoNaPista(e); });
  cv.addEventListener("pointerup", function(){ drag = false; });
  cv.addEventListener("pointercancel", function(){ drag = false; });

  whenVisible(cv, function(t){
    var dt = Math.min(.04, t - last); last = t; dtG = dt;
    var w = cv._w, h = cv._h;
    var col = css("--accent"), ink = css("--accent-ink"), trk = css("--track"), mut = css("--text-mut");
    ctx.clearRect(0, 0, w, h);

    /* geometria (recalculada: o canvas pode mudar de tamanho) */
    var x0 = 70, x1 = w - 70, ty = h * .40;
    var cx = w / 2, py = h * .74, pw = 104, ph = 44, kr = 15;
    sl.min = x0; sl.max = x1;
    tg.min = cx - pw / 2 + ph / 2; tg.max = cx + pw / 2 - ph / 2;
    if (!init){
      init = 1;
      sl.x = sl.target = x0 + (x1 - x0) * .25;
      tg.x = tg.target = tg.min;
    }

    /* piloto automático quando ninguém mexe */
    idle += dt;
    if (idle > 3.2 && sl.state === "acoplado" && tg.state === "acoplado"){
      idle = 0;
      sl.target = x0 + (x1 - x0) * Math.random();
      if (Math.random() < .45){ tg.on = !tg.on; tg.target = tg.on ? tg.max : tg.min; }
    }

    step(sl, dt); step(tg, dt);
    sl.emit += 120 * dt; while (sl.emit >= 1){ sl.emit -= 1; solta(sl, ty); }
    tg.emit += 120 * dt; while (tg.emit >= 1){ tg.emit -= 1; solta(tg, py); }

    /* ---------- slider ---------- */
    ctx.lineCap = "round";
    ctx.strokeStyle = trk; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(sl.x, ty); ctx.stroke();

    ctx.strokeStyle = mut; ctx.lineWidth = 1; ctx.globalAlpha = .5;
    for (var i = 0; i <= 10; i++){
      var gx = x0 + (x1 - x0) * i / 10;
      ctx.beginPath(); ctx.moveTo(gx, ty + 16); ctx.lineTo(gx, ty + (i % 5 ? 21 : 25)); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* alvo e ponto de virada previsto */
    if (sl.state !== "acoplado"){
      ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sl.target, ty - 26); ctx.lineTo(sl.target, ty - 14); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (sl.state === "acelerando"){
      var fx = pontoDeVirada(sl);
      ctx.strokeStyle = mut; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fx, ty + 30); ctx.lineTo(fx, ty + 44); ctx.stroke();
      ctx.fillStyle = mut;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = "center";
      ctx.fillText("virada", fx, ty + 58);
    }

    puffs(sl, col);
    casco(sl, ty, 19, 12, col, t);

    /* ---------- interruptor ---------- */
    ctx.fillStyle = tg.on ? col : trk;
    rrect(cx - pw / 2, py - ph / 2, pw, ph, ph / 2); ctx.fill();
    var kc = tg.on ? ink : col;
    puffs(tg, kc);
    casco(tg, py, kr, kr, kc, t);

    /* ---------- leitura ---------- */
    var pct = Math.round((sl.x - x0) / (x1 - x0) * 100) + "%";
    if (pct !== shownV){ shownV = pct; valEl.textContent = pct; cv.setAttribute("aria-valuenow", parseInt(pct, 10)); }
    var st = sl.state === "acoplado" ? (tg.state === "acoplado" ? "acoplado" : tg.state) : sl.state;
    if (st !== shownS){ shownS = st; stEl.textContent = st; }
  });
})();

})();
