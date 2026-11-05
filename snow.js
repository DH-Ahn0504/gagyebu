// 눈 내리는 효과: 작은 하얀 점 몇십 개를 canvas에 그림. 글자를 가리지 않게 작고 성기게.
// 멈추는 때: 눈 끄기, 탭이 가려졌을 때, 휴대폰의 "동작 줄이기" 설정.
(() => {
  const KEY = "gagyebu-snow";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let want = true;
  try { want = localStorage.getItem(KEY) !== "off"; } catch (e) { /* 저장 못 해도 동작은 함 */ }

  const cv = document.createElement("canvas");
  cv.id = "snow";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  let w = 0, h = 0, flakes = [], raf = 0, last = 0;

  const spawn = (anywhere) => ({
    x: Math.random() * w, y: anywhere ? Math.random() * h : -6,
    r: 1 + Math.random() * 2.2, v: 18 + Math.random() * 30,
    d: Math.random() * 6.28, a: 0.35 + Math.random() * 0.45,
  });

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2); // shortcut: 2배까지만, 아이폰 배터리 아끼려고
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(70, (w * h) / 22000));
    while (flakes.length < n) flakes.push(spawn(true));
    flakes.length = n;
  }

  function frame(t) {
    const dt = Math.min((t - (last || t)) / 1000, 0.05);
    last = t;
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.v * dt;
      f.d += dt * 0.8;
      f.x += Math.sin(f.d) * 12 * dt + 4 * dt;
      if (f.y > h + 6 || f.x > w + 6) Object.assign(f, spawn(false));
      ctx.fillStyle = `rgba(244, 248, 246, ${f.a})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const run = want && !reduce.matches && !document.hidden;
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (run) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
    const btn = document.getElementById("snow-toggle");
    if (btn) { btn.textContent = want ? "눈 끄기" : "눈 켜기"; btn.setAttribute("aria-pressed", String(want)); }
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
