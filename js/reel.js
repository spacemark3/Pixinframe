(() => {
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1 · CONTENT — the only thing you edit.

   Add or remove chapters, add or remove videos inside a chapter: the
   depth maths below derives everything (fractional depths, scroll
   length, rail, numerals) from this array. Nothing else to touch.
   ═══════════════════════════════════════════════════════════════════ */
const chapters = [
  {
    title: "Guess",
    description: "Black-and-white campaign film for the house — edit, grade and finishing on the final cut.",
    videos: [
      "assets/Guess.mp4"
    ]
  },
  {
    title: "Marciano",
    description: "Monochrome fashion piece for Marciano — filming and post through to the delivered edit.",
    videos: [
      "assets/Marciano.mp4"
    ]
  },
  {
    title: "Adidas",
    description: "Edit for the AS Roma 25/26 second kit launch — cut, grade pass and finishing for the campaign release.",
    videos: [
      "assets/Adidas.mp4"
    ]
  },
  {
    title: "12AM",
    description: "Pants — direction, final edit and sound design on the brand's street-fashion short film.",
    videos: [
      "assets/12AM.mp4"
    ]
  },
  {
    title: "D.A.W.G.",
    description: "The THIR$TY merch launch and the San Siro director's cut — direction, filming and final edit.",
    videos: [
      "assets/DAWG.mp4",
    ]
  },
  {
    title: "Ydez3",
    description: "Music-driven visual piece — shot and cut end to end.",
    videos: [
      "assets/YDEZ3648.MP4"
    ]
  },
  {
    title: "Progetto ADI",
    description: "Intervista Guerriero — a 2'30\" documentary interview, from production to the final cut.",
    videos: [
      "assets/ADI_intervista.mp4"
    ]
  }
];

/* ═══════════════════════════════════════════════════════════════════
   2 · TUNING — feel, not content.
   ═══════════════════════════════════════════════════════════════════ */
const SPAN          = 0.00;   /* share of a chapter slot spent traversing its
                                 videos; the remaining 0.14 is the chapter cut */
const PERSP         = 1200;   /* must match .depth-stack perspective          */
const FAR_UNIT      = 240;    /* px pushed back per unit of depth ahead       */
const NEAR_UNIT     = 620;    /* px pulled toward camera per unit passed      */
const NEAR_EASE     = 1.0;    /* 1 = responds the instant a layer is passed   */
const FADE_OUT      = 0.40;   /* depth over which a passed layer fades away   */
const DIM_DEPTH     = 0.9;    /* depth at which a layer reaches full dimming  */
const DIM_FLOOR     = 0.62;   /* darkest a receding layer gets                */
const CULL_RANGE    = 1.05;   /* beyond this a layer is hidden entirely       */
const NEVER_PAUSE   = false;   /* once a layer has loaded it keeps playing for
                                 the life of the page — nothing ever stops    */
const PLAY_RANGE    = 1.35;   /* only consulted when NEVER_PAUSE is false;
                                 must exceed CULL_RANGE or a visible layer
                                 could be found paused                        */
const LOAD_RANGE    = 2.2;    /* src is attached this far out, so a layer is
                                 buffered and running well before it is seen  */
const SCROLL_UNIT_VH= 125;    /* viewport heights of scroll per depth unit    */
const TAU           = 52;     /* inertia time constant, ms — higher = heavier */
const SHOW_LABELS   = true;   /* placeholder captions when a video is missing */
const AUDIO_FADE    = 0.55;   /* depth over which the focused layer's audio
                                 fades up and away — only ever one layer is
                                 audible, so chapters never talk over each other */
const AUDIO_DUCK    = 0.9;    /* how far audio ducks through a chapter cut     */

/* ═══════════════════════════════════════════════════════════════════
   3 · BUILD — flatten the data into one depth-sorted layer list.
   ═══════════════════════════════════════════════════════════════════ */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const pad2  = n => String(n).padStart(2,'0');

const stack    = document.getElementById('depthStack');
const numerals = document.getElementById('numerals');
const railFill = document.getElementById('railFill');
const railIdx  = document.getElementById('railIdx');
const cutFlash = document.getElementById('cutFlash');
const copyEl   = document.getElementById('chapterCopy');
const titleEl  = document.getElementById('chapterTitle');
const descEl   = document.getElementById('chapterDesc');
const trackEl  = document.getElementById('track');
const reduced  = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CH = chapters.length;

/* layers[]: one entry per video, carrying its absolute position on the
   dolly axis. Chapter c owns axis positions [c, c+1]; its videos are
   spread across [c, c+SPAN] at evenly spaced fractional depths. */
const layers = [];
chapters.forEach((chapter, c) => {
  const n = chapter.videos.length;
  chapter.videos.forEach((src, i) => {
    const depth = n > 1 ? i / (n - 1) : 0;      /* 0 … 1 within the chapter */
    layers.push({ chapter: c, index: i, count: n, depth, src, z: c + depth * SPAN });
  });
});
layers.sort((a, b) => a.z - b.z);

const TOTAL   = layers.length;
const CAM_MAX = layers[TOTAL - 1].z;

/* deterministic placeholder palette — also the video-failure fallback */
function placeholderVars(c, i){
  const hue = (c * 47 + 26) % 360;
  const l   = 40 - i * 4;
  return `--ph1:hsl(${hue} 12% ${l}%);` +
         `--ph2:hsl(${hue} 14% ${(l * 0.48).toFixed(1)}%);` +
         `--ph3:hsl(${(hue + 10) % 360} 16% ${(l * 0.2).toFixed(1)}%)`;
}

layers.forEach(L => {
  const el = document.createElement('div');
  el.className = 'layer no-video';               /* placeholder until a video loads */
  el.innerHTML =
    '<div class="layer-inner">' +
      '<div class="ph" style="' + placeholderVars(L.chapter, L.index) + '">' +
        (SHOW_LABELS
          ? '<span class="ph-tag">' + chapters[L.chapter].title + ' · ' +
            pad2(L.index + 1) + ' / ' + pad2(L.count) + '</span>'
          : '') +
      '</div>' +
      '<video muted loop playsinline preload="none"></video>' +
      '<div class="layer-dim"></div>' +
    '</div>';

  L.el    = el;
  L.dim   = el.querySelector('.layer-dim');
  L.video = el.querySelector('video');
  L.zi    = null;
  L.attached = false;
  L.failed   = false;
  L.playing  = false;
  L.visible  = true;

  /* graceful fallback: a missing or undecodable file just leaves the
     procedural placeholder in place */
  L.video.addEventListener('error', () => { L.failed = true; el.classList.add('no-video'); });
  L.video.addEventListener('loadeddata', () => { if (!L.failed) el.classList.remove('no-video'); });

  stack.appendChild(el);
});

/* chapter numerals — same stacked fill/outline treatment as before,
   now set to the chapter title instead of a "01" index */
chapters.forEach((chapter, c) => {
  const n = document.createElement('div');
  n.className = 'num';
  n.innerHTML = '<span class="num-squeeze"><span class="num-stack">' +
                '<span class="layer out"></span><span class="layer fill"></span></span></span>';
  const t = chapter.title;
  n.querySelector('.fill').textContent = t;
  n.querySelector('.out').textContent  = t;
  numerals.appendChild(n);
});
const nums = [...numerals.querySelectorAll('.num')];

/* a hidden, text-less probe carries the *base* --num-size for this
   breakpoint — kept separate from the real numerals because those get
   scaled down per-title by fitNumerals() below, and the vertical rhythm
   (stride) must stay the same regardless of which title is longest */
const sizeProbe = document.createElement('div');
sizeProbe.className = 'num';
sizeProbe.style.cssText = 'visibility:hidden; position:fixed; left:0; top:0;';
document.body.appendChild(sizeProbe);

/* measured once, not every frame — reading computed style per tick forced
   a style/layout flush that alone cost more than the whole render */
let stride = 0;
function measure(){
  const cs = getComputedStyle(sizeProbe);
  stride = parseFloat(cs.fontSize) * (parseFloat(cs.getPropertyValue('--num-stride')) || .94);
}
measure();

/* long titles ("THIR$TY × D.A.W.G.") would otherwise blow past the
   viewport at the numeral's full display size — shrink just enough per
   title to fit a comfortable max width, leaving short ones untouched */
function fitNumerals(){
  const maxW = Math.min(innerWidth * 0.88, 1600);
  nums.forEach(n => {
    n.style.removeProperty('--num-size');
    const box = n.querySelector('.num-squeeze');
    const natural = box.getBoundingClientRect().width;
    if (natural > maxW){
      const base = parseFloat(getComputedStyle(n).fontSize);
      n.style.setProperty('--num-size', (base * (maxW / natural)).toFixed(2) + 'px');
    }
  });
}
fitNumerals();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNumerals);

/* the scroll track is just height — its length falls out of the data */
trackEl.style.height = (CAM_MAX * SCROLL_UNIT_VH + 100) + 'svh';

/* ═══════════════════════════════════════════════════════════════════
   4 · CAMERA — scroll drives one continuous position on the dolly axis.
   ═══════════════════════════════════════════════════════════════════ */
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let target = 0, cam = 0, vel = 0, last = 0;
let activeChapter = -1;

function readScroll(){ target = clamp(scrollY / maxScroll() * CAM_MAX, 0, CAM_MAX); }
function goToLayer(i){
  const L = layers[clamp(i, 0, TOTAL - 1)];
  scrollTo({ top: L.z / CAM_MAX * maxScroll(), behavior: reduced ? 'auto' : 'smooth' });
}

/* the layer the camera is currently closest to — the reel's "focus", used
   by the rail, by keyboard stepping and by the audio router */
function nearestIndex(){
  let n = 0, best = Math.abs(layers[0].z - cam);
  for (let k = 1; k < TOTAL; k++){
    const d = Math.abs(layers[k].z - cam);
    if (d < best){ best = d; n = k; }
  }
  return n;
}

function setChapter(c){
  if (c === activeChapter) return;
  activeChapter = c;
  titleEl.textContent = chapters[c].title;
  descEl.textContent  = chapters[c].description;
  /* restart the wipe */
  copyEl.classList.remove('is-on'); void copyEl.offsetWidth; copyEl.classList.add('is-on');
}

/* ═══════════════════════════════════════════════════════════════════
   5 · AUDIO — one voice at a time.

   Every layer plays muted so autoplay is never blocked. Three or four
   of them are running at once, so unmuting the lot would stack their
   soundtracks; instead only the focused layer is ever audible, its gain
   riding the same distance the visuals do, and ducking through the cut
   between chapters. Sound stays off until the viewer asks for it —
   browsers require a gesture before a playing video may unmute.
   ═══════════════════════════════════════════════════════════════════ */
const soundBtn   = document.getElementById('soundToggle');
const soundLabel = document.getElementById('soundLabel');
let soundOn = false;

function applyGain(L, g){
  const v = L.video;
  if (g > 0.002){
    if (Math.abs(v.volume - g) > 0.01) v.volume = g;
    if (v.muted) v.muted = false;
  } else {
    if (!v.muted) v.muted = true;
    if (v.volume !== 0) v.volume = 0;
  }
}

/* gain for the focused layer: fades with distance, dips across the cut */
function focusGain(L, gap){
  const ad = Math.abs(L.z - cam);
  return clamp(1 - ad / AUDIO_FADE, 0, 1) *
         (1 - Math.sin(gap * Math.PI) * AUDIO_DUCK);
}

function routeAudio(nearest, gap){
  for (let k = 0; k < TOTAL; k++){
    const L = layers[k];
    const live = soundOn && k === nearest && L.playing && !L.failed;
    applyGain(L, live ? focusGain(L, gap) : 0);
  }
}

function setSound(on){
  soundOn = on;
  soundBtn.classList.toggle('is-on', on);
  soundBtn.setAttribute('aria-pressed', String(on));
  soundLabel.textContent = on ? 'Audio On' : 'Audio Off';

  if (!on){
    layers.forEach(L => applyGain(L, 0));
    return;
  }
  /* unmute synchronously inside the gesture — Safari pauses a video that
     is unmuted outside one, so this cannot wait for the next frame */
  const k = nearestIndex();
  const L = layers[k];
  if (L && !L.failed && L.attached){
    applyGain(L, Math.max(focusGain(L, 0), 0.05));
    if (!L.playing){
      L.playing = true;
      const pr = L.video.play();
      if (pr && pr.catch) pr.catch(() => {});
    }
  }
}

soundBtn.addEventListener('click', () => setSound(!soundOn));

/* ═══════════════════════════════════════════════════════════════════
   6 · RENDER
   ═══════════════════════════════════════════════════════════════════ */
function render(now){
  const dt   = Math.min(48, now - last || 16.7); last = now;
  const prev = cam;
  cam += (target - cam) * (reduced ? 1 : 1 - Math.exp(-dt / TAU));
  if (Math.abs(target - cam) < 0.00005) cam = target;
  vel = (cam - prev) * (16.7 / dt);

  /* ── depth stack ── */
  for (let k = 0; k < TOTAL; k++){
    const L   = layers[k];
    const rel = L.z - cam;                 /* >0 ahead of camera, <0 passed */
    const ad  = Math.abs(rel);

    /* ── video lifecycle ──
       Runs before the cull test on purpose: a layer must be able to load
       and start while it is still off-camera, so that by the time it is
       visible it is already running rather than spinning up. */
    if (!L.attached && ad <= LOAD_RANGE){
      L.attached = true;
      L.video.preload = 'auto';
      L.video.src = L.src;
    }
    const shouldPlay = (NEVER_PAUSE || ad <= PLAY_RANGE) && !L.failed && L.attached;
    if (shouldPlay && !L.playing){
      L.playing = true;
      const pr = L.video.play();
      if (pr && pr.catch) pr.catch(() => {});
    } else if (!shouldPlay && L.playing){
      L.playing = false;
      L.video.pause();
    }

    if (ad > CULL_RANGE){
      if (L.visible){
        L.visible = false;
        L.el.style.visibility = 'hidden';
        L.el.style.willChange = 'auto';   /* release the compositor layer */
      }
      /* the element is hidden, so the browser already de-prioritises its
         decode — but the video itself keeps running, so scrolling back
         never lands on a stalled or black frame */
      if (!NEVER_PAUSE && L.playing){ L.playing = false; L.video.pause(); }
      continue;
    }
    if (!L.visible){
      L.visible = true;
      L.el.style.visibility = 'visible';
      L.el.style.willChange = 'transform, opacity';
    }

    /* Z: gentle recession ahead, accelerating rush past the camera behind */
    const z = rel >= 0
      ? -rel * FAR_UNIT
      :  Math.pow(-rel, NEAR_EASE) * NEAR_UNIT;

    /* the overscan in .layer-inner absorbs the perspective divide, so the
       plane keeps covering the frame at every depth */
    const opacity = rel >= 0 ? 1 : clamp(1 + rel / FADE_OUT, 0, 1);
    const dim     = rel >= 0 ? (1 - DIM_FLOOR) * clamp(rel / DIM_DEPTH, 0, 1) : 0;

    L.el.style.transform  = 'translate3d(0,0,' + z.toFixed(2) + 'px)';
    L.el.style.opacity    = opacity.toFixed(3);
    L.dim.style.opacity   = dim.toFixed(3);

    const zi = Math.round(1000 - rel * 100);
    if (zi !== L.zi){ L.zi = zi; L.el.style.zIndex = zi; }   /* restacking is not free */
  }

  /* ── chapter coordinate ──
     Holds steady at the active chapter for the whole traversal of its
     videos, then ramps to the next one across the cut. The numerals and
     the copy both key off this, so they can never disagree. */
  const ci  = Math.min(CH - 1, Math.floor(cam));
  const f   = cam - ci;
  const gap = f > SPAN ? (f - SPAN) / (1 - SPAN) : 0;      /* 0 … 1 across the cut */
  const chapterCam = ci + gap;

  /* ── chapter numerals: same rhythm + velocity-driven 3D swing ── */
  for (let c = 0; c < CH; c++){
    const d = c - chapterCam, ad = Math.abs(d);
    const n = nums[c];
    const fill = clamp(1 - 2 * ad, 0, 1);
    n.style.transform = 'translate(-50%,-50%) translateY(' + (d * stride).toFixed(2) + 'px)';
    n.style.opacity   = ad > 3.4 ? 0 : clamp(1 / (1 + 0.9 * ad), 0, 1).toFixed(3);
    n.querySelector('.fill').style.opacity = fill.toFixed(3);
    n.querySelector('.out').style.opacity  = (1 - fill * .92).toFixed(3);
  }
  const v = clamp(vel * 9, -1, 1);
  numerals.style.transform =
    'perspective(1400px) rotateX(' + (v * 13).toFixed(2) + 'deg) rotateZ(' +
    (-v * 17).toFixed(2) + 'deg) scale(' + (1 - Math.abs(v) * .06).toFixed(3) + ')';

  /* ── chapter cut: dip through the gap between two project stacks ── */
  cutFlash.style.opacity = (Math.sin(gap * Math.PI) * 0.34).toFixed(3);

  /* text swaps at the midpoint of the cut — the deepest point of the dip,
     and exactly where the numeral crossfade hands over */
  setChapter(clamp(gap > 0.5 ? ci + 1 : ci, 0, CH - 1));

  /* ── rail: global position across every video in the reel ── */
  railFill.style.transform = 'scaleY(' + (cam / CAM_MAX).toFixed(4) + ')';
  const nearest = nearestIndex();

  /* ── audio: one voice at a time, ducked through the cut ── */
  routeAudio(nearest, gap);

  const idxText = pad2(nearest + 1) + ' — ' + pad2(TOTAL);
  if (railIdx.textContent !== idxText) railIdx.textContent = idxText;

  requestAnimationFrame(render);
}

addEventListener('scroll', readScroll, { passive:true });
addEventListener('resize', () => { readScroll(); measure(); fitNumerals(); });
readScroll(); cam = target;
setChapter(0);
requestAnimationFrame(render);

/* ── keyboard: step between videos, not pixels ── */
addEventListener('keydown', e => {
  const nearest = nearestIndex();
  if (e.key === 'ArrowDown' || e.key === 'PageDown'){ e.preventDefault(); goToLayer(nearest + 1); }
  if (e.key === 'ArrowUp'   || e.key === 'PageUp'  ){ e.preventDefault(); goToLayer(nearest - 1); }
  if (e.key === 'Home'){ e.preventDefault(); goToLayer(0); }
  if (e.key === 'End' ){ e.preventDefault(); goToLayer(TOTAL - 1); }
  if (e.key === 'm' || e.key === 'M'){ e.preventDefault(); setSound(!soundOn); }
});

/* ── playback watchdog ──
   A browser may pause media on its own: a backgrounded tab, a hidden
   element, a decoder under pressure, a network stall. Nothing in the
   render loop would notice, because the loop only calls play() on the
   transition into range. This sweeps once a second and restarts anything
   that should be running but is not — cheap insurance against the reel
   quietly freezing. */
function resumeAll(){
  for (let k = 0; k < TOTAL; k++){
    const L = layers[k];
    if (!L.attached || L.failed || !L.playing) continue;
    if (L.video.paused || L.video.ended){
      const pr = L.video.play();
      if (pr && pr.catch) pr.catch(() => {});
    }
  }
}
setInterval(resumeAll, 1000);
addEventListener('visibilitychange', () => { if (!document.hidden) resumeAll(); });
addEventListener('pageshow', resumeAll);

/* ── camcorder HUD: recording timer ──
   Derived from a fixed origin every tick rather than incremented, so it
   cannot drift or be disturbed by scrolling. */
const timerEl = document.getElementById('recTimer');
const startedAt = performance.now();
function tickTimer(){
  const s = Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
  timerEl.textContent = pad2(Math.floor(s / 3600)) + ':' +
                        pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60);
}
tickTimer();
setInterval(tickTimer, 250);

})();
