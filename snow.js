// 눈 내리는 효과: 작은 하얀 점 몇십 개를 canvas에 그림. 글자를 가리지 않게 작고 성기게.
// 멈추는 때: 눈 끄기, 탭이 가려졌을 때, 휴대폰의 "동작 줄이기" 설정.
(() => {
  const theme = document.documentElement.dataset.theme;
  if (theme !== "winter" && theme !== "autumn") return; // 겨울·가을이 아니면 캔버스도 만들지 않음
  const leaf = theme === "autumn"; // 가을이면 눈 대신 단풍잎
  const KEY = "gagyebu-snow";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let want = true;
  try { want = localStorage.getItem(KEY) !== "off"; } catch (e) { /* 저장 못 해도 동작은 함 */ }

  const cv = document.createElement("canvas");
  cv.id = "snow";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  // 눈 색은 style.css의 --effect-ink-rgb. "숫자, 숫자, 숫자"(각 0~255)일 때만 쓰고, 아니면 예전 색
  const m = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(getComputedStyle(document.documentElement).getPropertyValue("--effect-ink-rgb"));
  const ink = m && m.slice(1).every((n) => +n <= 255) ? m.slice(1).join(", ") : "244, 248, 246";
  let w = 0, h = 0, flakes = [], raf = 0, last = 0;

  const spawn = (anywhere) => ({
    x: Math.random() * w, y: anywhere ? Math.random() * h : -6,
    r: 1 + Math.random() * 2.2, v: 18 + Math.random() * 30,
    d: Math.random() * 6.28, a: 0.35 + Math.random() * 0.45,
  });

  // 단풍잎: 오른쪽 절반 점 10개를 왼쪽으로 뒤집어 19점 윤곽을 한 번만 만들어 재사용
  const half = [[0, -1], [0.18, -0.58], [0.52, -0.68], [0.4, -0.28], [0.95, -0.15], [0.52, 0.1], [0.6, 0.48], [0.16, 0.36], [0.06, 0.62], [0.05, 1]];
  const shape = new Path2D();
  [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y])].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const tint = ["217, 69, 58", "238, 125, 45", "242, 193, 78", "181, 83, 47"]; // 붉음·주황·금색·적갈색
  const spawnLeaf = (anywhere) => {
    const c = Math.random(), k = c < 0.3 ? 0 : c < 0.6 ? 1 : c < 0.9 ? 2 : 3, R = Math.random;
    return {
      x: R() * w, y: anywhere ? R() * h : -20,
      s: 8 + R() * 6, v: 14 + R() * 18, A: 20 + R() * 15, sw: 0.8 + R() * 0.45, d: R() * 6.28,
      rot: R() * 6.28, rs: (0.2 + R() * 0.3) * (R() < 0.5 ? -1 : 1), fp: R() * 6.28, fs: 0.7 + R() * 0.6,
      // 붉음·적갈(k 0,3)은 어두운 바탕에서 안 보여 0.40~0.50, 주황·금색은 금색 글자 위 대비 때문에 0.30~0.38
      col: `rgba(${tint[k]}, ${k % 3 ? 0.30 + R() * 0.08 : 0.40 + R() * 0.10})`,
    };
  };
  function drawLeaf(f, dt) {
    f.y += f.v * dt;
    f.d += f.sw * dt;
    f.x += Math.sin(f.d) * f.A * dt + 3 * dt;
    f.rot += f.rs * dt;
    f.fp += f.fs * dt;
    if (f.y > h + 20 || f.x > w + 20) { Object.assign(f, spawnLeaf(false)); return; }
    ctx.fillStyle = f.col;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.sin(f.d) * 0.5 + f.rot);
    ctx.scale(f.s * (0.3 + 0.7 * Math.abs(Math.cos(f.fp))), f.s);
    ctx.fill(shape);
    ctx.restore();
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2); // shortcut: 2배까지만, 아이폰 배터리 아끼려고
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = leaf ? Math.max(15, Math.min(25, Math.round((w * h) / 16000))) : Math.round(Math.min(70, (w * h) / 22000));
    while (flakes.length < n) flakes.push((leaf ? spawnLeaf : spawn)(true));
    flakes.length = n;
  }

  function frame(t) {
    const dt = Math.min((t - (last || t)) / 1000, 0.05);
    last = t;
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      if (leaf) { drawLeaf(f, dt); continue; }
      f.y += f.v * dt;
      f.d += dt * 0.8;
      f.x += Math.sin(f.d) * 12 * dt + 4 * dt;
      if (f.y > h + 6 || f.x > w + 6) Object.assign(f, spawn(false));
      ctx.fillStyle = `rgba(${ink}, ${f.a})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const run = want && !reduce.matches && !document.hidden;
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (run) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
    const btn = document.getElementById("snow-toggle");
    if (btn) { btn.textContent = want ? "효과 끄기" : "효과 켜기"; btn.setAttribute("aria-pressed", String(want)); }
  }

  size(); update();
  addEventListener("resize", size);
  document.addEventListener("visibilitychange", update);
  reduce.addEventListener("change", update);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#snow-toggle")) return;
    want = !want;
    try { localStorage.setItem(KEY, want ? "on" : "off"); } catch (err) { /* 저장 못 해도 이번 방문엔 적용됨 */ }
    update();
  });
})();
