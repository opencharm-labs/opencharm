/*!
 * OpenCharm face engine (browser reference implementation).
 * Glyph faces: two typed characters for eyes, one optional mouth, drawn in the
 * charm's identity colour on true black. The firmware port should reproduce
 * this behaviour (see README.md, "The face").
 *
 * API
 *   CharmFace.FACES, CharmFace.ORDER, CharmFace.COLORS, CharmFace.STATES
 *   CharmFace.faceString(face)                -> "^ v ^"
 *   CharmFace.drawGlyphs(ctx, w, h, state)    -> paint one frame (used for 3D textures)
 *   new CharmFace.Face(host, {face, colour, idle, animate})
 *       .set({face, say, hint, ask, dim, instant})
 *       .setColour(colour)
 *       .followIn(element)
 *       .squish()               the key went down: squash and bounce
 *       .setVoiceLevel(0..1)    while listening, the eyes swell with the voice
 *       options: face (id or object), colour (from COLORS), idle (random glances, default true),
 *                animate (blinks, breathing, pops, typing; default true unless reduced motion)
 *   CharmFace.device(host, {face, colour, cord, tappable, idle, animate, shape})
 *       shape: 'device' (default, the real rounded glass) or 'icon' (squircle, like the app icon)
 *       -> {el, face, setColour(c), setKey(css), hit (button when tappable)}
 *   CharmFace.squircle(n, inset) -> SVG path in a 0..100 box (superellipse)
 *
 * No dependencies. MIT (see the licences in the README).
 */
(function (root) {
  "use strict";
  var reduce = !!(
    root.matchMedia &&
    root.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  var SIGNAL = "#FF5A1F";
  var DIM = "#8A8A8A";
  var FONT =
    '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* Identity colours: c = shell, g = glyphs/text on black, key = physical key */
  var COLORS = [
    { id: "white", name: "White", c: "#FFFFFF", g: "#F4F3EE", key: "#1E1F22" },
    {
      id: "cobalt",
      name: "Cobalt",
      c: "#4574FF",
      g: "#9DB6FF",
      key: "#FFD166",
    },
    { id: "lime", name: "Lime", c: "#BDEB4E", g: "#D6F78A", key: "#1E1F22" },
    { id: "lilac", name: "Lilac", c: "#B39BFA", g: "#D2C4FF", key: "#1E1F22" },
    { id: "sun", name: "Sun", c: "#FFCD5C", g: "#FFDF93", key: "#1E1F22" },
    { id: "coal", name: "Coal", c: "#2B2C30", g: "#F4F3EE", key: "#FF5A1F" },
  ];

  /* Faces. Offsets are fractions of the screen size; rl/rr rotate eyes (deg),
     sl/sr scale eyes, tilt rotates the whole face, fx adds behaviour:
     cursor = mouth blinks like a text cursor, spin = eyes rotate,
     z = floating z, ask = orange ring (needs you). */
  var FACES = {
    neutral: { t: "Neutral", L: "o", R: "o" },
    happy: { t: "Happy", L: "^", R: "^" },
    joy: { t: "Joy", L: "^", R: "^", M: "v", sl: 1.06, sr: 1.06 },
    cute: { t: "Cute", L: "^", R: "^", M: "w" },
    wink: { t: "Wink", L: "^", R: "−", tilt: -5 },
    loved: { t: "Loved", L: "♥︎", R: "♥︎", sl: 0.9, sr: 0.9 },
    listening: { t: "Listening", L: "O", R: "O", gy: -0.03 },
    thinking: {
      t: "Thinking",
      L: "o",
      R: "o",
      M: "_",
      gx: 0.05,
      gy: -0.04,
      tilt: 5,
      fx: "cursor",
    },
    focused: { t: "Focused", L: "−", R: "−", rl: 9, rr: -9 },
    curious: { t: "Curious", L: "o", R: "•", sl: 1.15, tilt: -8, gx: 0.02 },
    confused: { t: "Confused", L: "o", R: "O", tilt: 7 },
    surprised: { t: "Surprised", L: "O", R: "O", M: "o" },
    doubtful: { t: "Doubtful", L: "¬", R: "¬", gx: 0.06 },
    unamused: { t: "Unamused", L: "−", R: "−", M: "_" },
    strain: { t: "Strain", L: ">", R: "<" },
    sad: { t: "Sad", L: "T", R: "T", gy: 0.02 },
    oops: { t: "Oops", L: "x", R: "x" },
    dizzy: { t: "Dizzy", L: "@", R: "@", tilt: 10, fx: "spin" },
    sleepy: { t: "Sleepy", L: "−", R: "−", dy: 0.04, fx: "z" },
    learned: { t: "Learned", L: "*", R: "*", M: "v", sl: 1.1, sr: 1.1 },
    money: { t: "Money", L: "$", R: "$" },
    ask: { t: "Needs you", L: "o", R: "o", M: "?", fx: "ask" },
  };
  var ORDER = Object.keys(FACES);

  /* What the agent is doing -> which face. Triggers name the events the
     bridge (charmd) listens for; exact event names are per agent adapter. */
  var STATES = [
    {
      id: "greeting",
      face: "happy",
      name: "Hello",
      when: "You pick it up or sit down.",
      trigger: "IMU pick-up / first touch of the day",
    },
    {
      id: "listening",
      face: "listening",
      name: "Listening",
      when: "You hold the key and talk.",
      trigger: "Key held (on device)",
    },
    {
      id: "thinking",
      face: "thinking",
      name: "Thinking",
      when: "The agent is working on an answer.",
      trigger: "Agent turn started",
    },
    {
      id: "working",
      face: "focused",
      name: "Working",
      when: "A tool or a long task is running.",
      trigger: "Tool call started",
    },
    {
      id: "needs_you",
      face: "ask",
      name: "Needs you",
      when: "A question or an approval. Orange ring, one sound.",
      trigger: "Approval request / clarifying question",
    },
    {
      id: "done",
      face: "joy",
      name: "Done",
      when: "A task finished. One line, then back to the face.",
      trigger: "Turn complete / cron job done",
    },
    {
      id: "stuck",
      face: "strain",
      name: "Stuck",
      when: "Retries are piling up.",
      trigger: "3 tool errors in a row",
    },
    {
      id: "failed",
      face: "oops",
      name: "Failed",
      when: "Something broke. It says what, in one line.",
      trigger: "Run failed",
    },
    {
      id: "learned",
      face: "learned",
      name: "Learned",
      when: "It made or improved a skill.",
      trigger: "Hermes: skill created or updated",
    },
    {
      id: "noted",
      face: "wink",
      name: "Noted",
      when: "It saved something about you.",
      trigger: "Memory write (e.g. USER.md / MEMORY.md)",
    },
    {
      id: "cost",
      face: "money",
      name: "Cost",
      when: "Spend passed a limit you set.",
      trigger: "Budget threshold",
    },
    {
      id: "asleep",
      face: "sleepy",
      name: "Asleep",
      when: "Face-down or quiet hours. The agent keeps running.",
      trigger: "IMU face-down / schedule",
    },
    {
      id: "idle",
      face: "neutral",
      name: "Idle",
      when: "Nothing going on. Slow blinks and glances.",
      trigger: "No events",
    },
  ];

  function faceString(f) {
    return f.L + " " + (f.M || " ") + " " + f.R;
  }

  function glyph(ctx, ch, x, y, size, rot, scale) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.font = "800 " + size + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var m = ctx.measureText(ch);
    var a = m.actualBoundingBoxAscent || size * 0.7,
      d = m.actualBoundingBoxDescent || 0;
    ctx.fillText(ch, 0, (a - d) / 2); // optical centre of the ink
    ctx.restore();
  }

  /* state: {face, colour, blink, look:{x,y}, cursorOn, flap, layout 0..1, pop, t} */
  function drawGlyphs(ctx, w, h, s) {
    var f = s.face,
      L = s.layout || 0,
      u = Math.min(w, h),
      k = 1 - L * 0.42;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    var look = s.look || { x: 0, y: 0 };
    var cx = w / 2 + ((f.gx || 0) * u + look.x * u * 0.035) * k;
    /* Breathing: the face drifts up and down a little, slower and deeper asleep. */
    var asleep = f.fx === "z";
    var breath = reduce
      ? 0
      : Math.sin((2 * Math.PI * (s.t || 0)) / (asleep ? 6400 : 4200)) *
        u *
        (asleep ? 0.014 : 0.008);
    var cy =
      h * (0.46 - L * 0.24) +
      ((f.gy || 0) * u + look.y * u * 0.022 + (f.dy || 0) * u + breath) * k;
    /* While listening, the eyes swell with the voice. */
    var swell = f === FACES.listening ? 1 + 0.25 * (s.voice || 0) : 1;
    var S = u * 0.34 * k * (s.pop == null ? 1 : s.pop) * swell,
      dx = u * 0.215 * k * (s.pop == null ? 1 : s.pop);
    var spin = f.fx === "spin" && !reduce ? ((s.t || 0) / 1100) * 360 : 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((f.tilt || 0) * Math.PI) / 180);
    ctx.scale(s.sx || 1, s.sy || 1);
    ctx.fillStyle = (s.colour || COLORS[0]).g;
    glyph(
      ctx,
      s.blink ? "−" : f.L,
      -dx,
      (f.dl || 0) * u,
      S,
      (f.rl || 0) + spin,
      f.sl || 1
    );
    glyph(
      ctx,
      s.blink ? "−" : f.R,
      dx,
      (f.dr || 0) * u,
      S,
      (f.rr || 0) + spin,
      f.sr || 1
    );
    var M = s.flap != null ? s.flap : f.M;
    if (M && !(f.fx === "cursor" && s.cursorOn === false && s.flap == null))
      glyph(ctx, M, 0, S * 0.8, S * 0.6, 0, 1);
    ctx.restore();
    if (f.fx === "z" && L < 0.5 && !reduce) {
      var ph = ((s.t || 0) % 2400) / 2400;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.fillStyle = (s.colour || COLORS[0]).g;
      glyph(
        ctx,
        "z",
        w * 0.76 + ph * u * 0.05,
        h * 0.24 - ph * u * 0.09,
        u * 0.09,
        0,
        1
      );
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- squircles (same shapes as brand/icon: outer n=5, screen n=3.5, rim 8.5%) ---------- */
  function squircle(n, inset) {
    inset = inset || 0;
    var h = 50 - inset,
      pts = [];
    for (var i = 0; i < 180; i++) {
      var t = (2 * Math.PI * i) / 180,
        c = Math.cos(t),
        s = Math.sin(t);
      pts.push(
        (50 + h * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n)).toFixed(2) +
          " " +
          (50 + h * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n)).toFixed(2)
      );
    }
    return "M" + pts.join(" L") + "Z";
  }
  var RIM = 8.5,
    SQ_OUT = squircle(5),
    SQ_SCREEN = squircle(3.5, RIM),
    SQ_RING = squircle(3.5, RIM + 1.6);
  var SQ_MASK =
    'url("data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' +
        squircle(3.5) +
        '"/></svg>'
    ) +
    '") center/100% 100% no-repeat';

  /* ---------- component styles (injected once) ---------- */
  var CSS =
    "" +
    ".cf{position:relative;width:100%;aspect-ratio:1;background:#000;border-radius:9.35%;overflow:hidden;color:var(--cf-g,#F4F3EE);--cf-w:200px}" +
    ".cf canvas{position:absolute;inset:0;width:100%;height:100%;display:block}" +
    ".cf-talk{position:absolute;left:9%;right:9%;top:50%;bottom:16%;display:flex;justify-content:center;align-items:flex-start;text-align:center;font-family:" +
    FONT +
    ";font-weight:500;line-height:1.26;letter-spacing:-.01em;font-size:calc(var(--cf-w)*.074);overflow:hidden}" +
    ".cf.cf-dim .cf-talk{color:" +
    DIM +
    ";letter-spacing:.14em;font-size:calc(var(--cf-w)*.055)}" +
    ".cf-car{animation:cfblink 1s steps(1) infinite}" +
    // Above the rounded corners, and narrow enough to fit them: "HOLD · SEND    PRESS · NO" never clips.
    ".cf-hint{position:absolute;left:6%;right:6%;bottom:11%;text-align:center;font-family:" +
    FONT +
    ";font-weight:600;letter-spacing:.08em;font-size:calc(var(--cf-w)*.04);color:" +
    DIM +
    ";white-space:pre}" +
    ".cf.cf-ask{box-shadow:inset 0 0 0 calc(var(--cf-w)*.02) " +
    SIGNAL +
    "}" +
    ".cf.cf-ask .cf-hint{color:" +
    SIGNAL +
    "}" +
    ".cf [hidden]{display:none!important}" +
    ".cd{position:relative;width:100%;aspect-ratio:1;border-radius:13.8%;background:var(--cd-c,#FFFFFF);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}" +
    ".cd-win{position:absolute;inset:5.45%}" +
    ".cd-key{position:absolute;right:-1.3%;top:43%;width:1.6%;height:14%;border-radius:0 4px 4px 0;background:var(--cd-k,#1E1F22);transition:background .2s}" +
    ".cd-cord{position:absolute;left:50%;bottom:100%;width:1.3%;height:22%;margin-left:-.65%;background:#1E1F22;border-radius:2px}" +
    ".cd-ring{position:absolute;left:50%;bottom:122%;width:9%;aspect-ratio:1;margin-left:-4.5%;border:2px solid #B8BDC8;border-radius:50%}" +
    ".cd-hit{position:absolute;inset:0;border:0;padding:0;background:transparent;cursor:pointer;border-radius:13.8%}" +
    ".cf-sq{-webkit-mask:" +
    SQ_MASK +
    ";mask:" +
    SQ_MASK +
    ";border-radius:0}" +
    ".cf-sq.cf-ask{box-shadow:none}" +
    ".cd-icon{background:none;box-shadow:none;border-radius:0}" +
    ".cd-icon .cd-shell{position:absolute;inset:0;width:100%;height:100%;overflow:visible}" +
    ".cd-icon .cd-shell path{fill:var(--cd-c,#FFFFFF);stroke:rgba(0,0,0,.18);stroke-width:1px;vector-effect:non-scaling-stroke}" +
    ".cd-icon .cd-win{inset:" +
    RIM +
    "%}" +
    ".cd-icon .cd-win .cf{border-radius:0;-webkit-mask:" +
    SQ_MASK +
    ";mask:" +
    SQ_MASK +
    "}" +
    ".cd-icon .cf.cf-ask{box-shadow:none}" +
    ".cd-askring{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity .15s}" +
    ".cd-askring path{fill:none;stroke:" +
    SIGNAL +
    ";stroke-width:1.8}" +
    ".cd-icon:has(.cf-ask) .cd-askring{opacity:1}" +
    ".cd-icon .cd-key{top:41%;height:18%;right:-1.1%}" +
    ".cd-icon .cd-hit{border-radius:24%}" +
    "@keyframes cfblink{0%{opacity:1}50%{opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.cf-car{animation:none}}";
  function injectCSS() {
    if (document.getElementById("charm-face-css")) return;
    var st = document.createElement("style");
    st.id = "charm-face-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var ALL = [];
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function easeOutBack(p) {
    var c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function Face(host, opts) {
    injectCSS();
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "cf";
    el.setAttribute("role", "img");
    el.innerHTML =
      '<canvas></canvas><div class="cf-talk" hidden><span><span class="cf-txt"></span><span class="cf-car">_</span></span></div><div class="cf-hint" hidden></div>';
    host.appendChild(el);
    this.el = el;
    this.cv = el.querySelector("canvas");
    this.ctx = this.cv.getContext("2d");
    this.talkEl = el.querySelector(".cf-talk");
    this.txt = el.querySelector(".cf-txt");
    this.car = el.querySelector(".cf-car");
    this.hintEl = el.querySelector(".cf-hint");
    this.colour = opts.colour || COLORS[0];
    this.idle = opts.idle !== false;
    this.animate = opts.animate !== false && !reduce;
    this.face = FACES[opts.face || "neutral"] || FACES.neutral;
    this.say = "";
    this.shown = "";
    this.hint = "";
    this.layout = 0;
    this.layoutT = 0;
    this.pop = 1;
    this.popStart = 0;
    this.look = { x: 0, y: 0 };
    this.follow = false;
    this.blink = false;
    this.blinkEnd = 0;
    this.secondBlink = false;
    this.squishStart = 0;
    this.sx = 1;
    this.sy = 1;
    this.voice = 0;
    this.voiceT = 0;
    this.lastBreath = 0;
    this.cursorOn = true;
    this.flap = null;
    var now = performance.now();
    this.nextBlink = now + rnd(800, 3200);
    this.nextGlance = now + rnd(900, 2600);
    this.visible = true;
    this.dirty = true;
    this.lastT = now;
    this.w = 0;
    this.h = 0;
    el.style.setProperty("--cf-g", this.colour.g);
    var self = this;
    function size() {
      var r = el.getBoundingClientRect(),
        dpr = Math.min(root.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(r.width * dpr)),
        h = Math.max(1, Math.round(r.height * dpr));
      if (w !== self.w || h !== self.h) {
        self.w = w;
        self.h = h;
        self.cv.width = w;
        self.cv.height = h;
        self.paint(performance.now());
      }
      el.style.setProperty("--cf-w", r.width + "px");
    }
    size();
    if (root.ResizeObserver) new ResizeObserver(size).observe(el);
    else root.addEventListener("resize", size);
    if (root.IntersectionObserver)
      new IntersectionObserver(function (e) {
        self.visible = e[0].isIntersecting;
        if (self.visible) self.dirty = true;
      }).observe(el);
    ALL.push(this);
    this.label();
    loop();
  }
  Face.prototype.label = function () {
    this.el.setAttribute(
      "aria-label",
      "Charm face: " +
        this.face.t.toLowerCase() +
        " (" +
        faceString(this.face).replace(/\s+/g, " ") +
        ")" +
        (this.say ? ", saying: " + this.say : "") +
        (this.hint ? ", " + this.hint : "")
    );
  };
  Face.prototype.set = function (o) {
    o = o || {};
    if (o.face) {
      var nf = typeof o.face === "string" ? FACES[o.face] : o.face;
      if (nf && nf !== this.face) {
        this.face = nf;
        if (this.animate) this.popStart = performance.now();
      }
    }
    var say = o.say || "";
    if (say !== this.say) {
      this.say = say;
      this.shown = !this.animate || o.instant || o.dim ? say : "";
      this.typeStart = performance.now();
      this.txt.textContent = this.shown;
    }
    this.hint = o.hint || "";
    this.layoutT = say ? 1 : 0;
    if (!this.animate) this.layout = this.layoutT;
    var ask = !!o.ask || this.face.fx === "ask";
    this.el.classList.toggle("cf-ask", ask);
    this.el.classList.toggle("cf-dim", !!o.dim);
    this.talkEl.hidden = !say;
    this.car.hidden = !!o.dim || this.shown.length >= say.length;
    this.hintEl.hidden = !this.hint;
    this.hintEl.textContent = this.hint;
    this.dirty = true;
    this.label();
    return this;
  };
  Face.prototype.setColour = function (c) {
    this.colour = c;
    this.el.style.setProperty("--cf-g", c.g);
    this.dirty = true;
    return this;
  };
  Face.prototype.followIn = function (area) {
    var self = this;
    area.addEventListener("pointermove", function (e) {
      var r = area.getBoundingClientRect();
      self.follow = true;
      self.look = {
        x: Math.max(
          -1.4,
          Math.min(1.4, ((e.clientX - r.left) / r.width - 0.5) * 3)
        ),
        y: Math.max(
          -1.4,
          Math.min(1.4, ((e.clientY - r.top) / r.height - 0.45) * 3)
        ),
      };
      self.dirty = true;
    });
    area.addEventListener("pointerleave", function () {
      self.follow = false;
      self.look = { x: 0, y: 0 };
      self.dirty = true;
    });
    return this;
  };
  /* Life (spec 005): a squash-and-bounce (the key goes down); the eyes pulse with the voice (0..1). */
  Face.prototype.squish = function () {
    this.squishStart = performance.now();
    return this;
  };
  Face.prototype.setVoiceLevel = function (level) {
    this.voiceT = Math.max(0, Math.min(1, level || 0));
    return this;
  };
  Face.prototype.paint = function (now) {
    if (!this.w) return;
    drawGlyphs(this.ctx, this.w, this.h, {
      face: this.face,
      colour: this.colour,
      blink: this.blink,
      look: this.look,
      cursorOn: this.cursorOn,
      flap: this.flap,
      layout: this.layout,
      pop: this.pop,
      voice: this.voice,
      sx: this.sx,
      sy: this.sy,
      t: now,
    });
    this.dirty = false;
  };
  Face.prototype.tick = function (now) {
    var dt = Math.min(64, now - this.lastT);
    this.lastT = now;
    if (!this.visible || !this.w) return;
    var need = this.dirty,
      f = this.face;
    if (this.popStart) {
      var p = (now - this.popStart) / 320;
      if (p >= 1) {
        this.popStart = 0;
        this.pop = 1;
      } else this.pop = 0.55 + 0.45 * easeOutBack(p);
      need = true;
    }
    if (this.layout !== this.layoutT) {
      this.layout += (this.layoutT - this.layout) * Math.min(1, dt / 140);
      if (Math.abs(this.layout - this.layoutT) < 0.002)
        this.layout = this.layoutT;
      need = true;
    }
    if (this.shown.length < this.say.length) {
      var n = Math.min(
        this.say.length,
        Math.floor((now - this.typeStart) / 38) + 1
      );
      this.shown = this.say.slice(0, n);
      this.txt.textContent = this.shown;
      this.flap = ["o", "−", "O", "o", "−"][Math.floor(now / 110) % 5];
      if (this.shown.length >= this.say.length) {
        this.flap = null;
        this.car.hidden = true;
      }
      need = true;
    }
    if (this.animate) {
      if (now > this.nextBlink && f.fx !== "z" && f.fx !== "spin") {
        /* Mostly quick blinks; now and then a double, now and then a slow one. */
        var kind = this.secondBlink ? 100 : rnd(0, 100);
        this.blink = true;
        this.blinkEnd = now + (kind >= 22 && kind < 32 ? 320 : 120);
        this.secondBlink = kind < 22;
        this.nextBlink = this.secondBlink
          ? this.blinkEnd + 140
          : now + rnd(2400, 5800);
        need = true;
      }
      /* The squish: squashed flat, then a springy bounce back. */
      if (this.squishStart) {
        var q = (now - this.squishStart) / 520;
        if (q >= 1) {
          this.squishStart = 0;
          this.sx = this.sy = 1;
        } else {
          var v = Math.exp(-4.5 * q) * Math.cos(2 * Math.PI * 1.3 * q);
          this.sy = 1 - 0.18 * v;
          this.sx = 1 + 0.09 * v;
        }
        need = true;
      }
      /* The voice pulse rises fast and falls slowly, like a level meter. */
      if (this.voice !== this.voiceT) {
        var rate = this.voiceT > this.voice ? 60 : 220;
        this.voice += (this.voiceT - this.voice) * Math.min(1, dt / rate);
        if (Math.abs(this.voice - this.voiceT) < 0.01) this.voice = this.voiceT;
        need = true;
      }
      /* Breathing redraws about 25 times a second, not every frame. */
      if (now - this.lastBreath > 40) {
        this.lastBreath = now;
        need = true;
      }
      if (this.blink && now > this.blinkEnd) {
        this.blink = false;
        need = true;
      }
      if (this.idle && !this.follow && now > this.nextGlance) {
        /* Glances dart; while thinking, the eyes wander up, pondering. */
        var ponder = f === FACES.thinking;
        this.look = ponder
          ? { x: (this.look.x > 0 ? -0.6 : 0.6) * rnd(0.6, 1), y: rnd(-0.9, -0.5) }
          : { x: rnd(-1, 1), y: rnd(-1, 1) };
        this.nextGlance = now + (ponder ? rnd(1600, 3200) : rnd(1100, 3300));
        need = true;
      }
      if (f.fx === "cursor") {
        var on = Math.floor(now / 500) % 2 === 0;
        if (on !== this.cursorOn) {
          this.cursorOn = on;
          need = true;
        }
      }
      if (f.fx === "spin" || f.fx === "z") need = true;
    }
    if (need) this.paint(now);
  };

  var running = false;
  function loop() {
    if (running) return;
    running = true;
    function frame(now) {
      for (var i = 0; i < ALL.length; i++) ALL[i].tick(now);
      root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(frame);
  }

  /* The device from the front: shell in the identity colour, black window, key on the right. */
  function device(host, opts) {
    injectCSS();
    opts = opts || {};
    var c = opts.colour || COLORS[0];
    var d = document.createElement("div"),
      icon = opts.shape === "icon";
    d.className = icon ? "cd cd-icon" : "cd";
    d.innerHTML =
      (opts.cord
        ? '<div class="cd-ring"></div><div class="cd-cord"></div>'
        : "") +
      (icon
        ? '<svg class="cd-shell" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="' +
          SQ_OUT +
          '"/></svg>'
        : "") +
      '<div class="cd-win"></div>' +
      (icon
        ? '<svg class="cd-askring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="' +
          SQ_RING +
          '"/></svg>'
        : "") +
      '<div class="cd-key"></div>';
    host.appendChild(d);
    var face = new Face(d.querySelector(".cd-win"), {
      face: opts.face,
      colour: c,
      idle: opts.idle,
      animate: opts.animate,
    });
    var api = {
      el: d,
      face: face,
      setColour: function (col) {
        d.style.setProperty("--cd-c", col.c);
        d.style.setProperty("--cd-k", col.key);
        face.setColour(col);
      },
      setKey: function (css) {
        d.querySelector(".cd-key").style.background = css || "";
      },
    };
    api.setColour(c);
    if (opts.tappable) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cd-hit";
      b.setAttribute("aria-label", "Tap its face");
      d.appendChild(b);
      api.hit = b;
    }
    return api;
  }

  root.CharmFace = {
    FACES: FACES,
    ORDER: ORDER,
    COLORS: COLORS,
    STATES: STATES,
    SIGNAL: SIGNAL,
    faceString: faceString,
    drawGlyphs: drawGlyphs,
    Face: Face,
    device: device,
    squircle: squircle,
    reduceMotion: reduce,
  };
})(window);
