# 002 — Smooth button press feedback

- **Status**: DONE (폰에서 확인 완료). 작업 전에 이미 .btn/.icon-btn에 120ms transition이 있어 그 값을 유지, .row-btn 전환 추가·icon-btn 0.95·reduced-motion 불투명도 추가
- **Commit**: 0bfd8c4 (the working copy has uncommitted edits to `style.css`, `app.js`, `index.html`, so the line numbers below come from the working copy, after plan 001 was applied)
- **Severity**: LOW to MEDIUM (feel polish on the most-touched elements)
- **Category**: Physicality & origin / Easing & duration
- **Estimated scope**: 1 file (`style.css`), about 8 lines added or changed. No JS, no HTML.

## Problem

Pressing a button moves it down 1px, but there is no `transition` on these elements, so the movement snaps on press and snaps back on release. It reads as a glitch, not as the button "giving" under the finger. 1px is also too small to see on a phone, where the finger covers the button.

```css
/* style.css:85 — current */
.btn:active, .icon-btn:active, .row-btn:active { transform: translateY(1px); }
```

None of `.btn` (line 80), `.icon-btn` (line 86) or `.row-btn` (line 140) defines `transition`. Buttons are pressed tens of times a day (`+ 내역 추가`, month `‹ ›`, every list row), so the feedback must be subtle and fast.

Purpose: Feedback (the interface confirms it heard the press). Frequency: tens per day, so near-imperceptible motion only.

## Target

- Press: the button shrinks slightly, `transform: scale(...)`, **160ms**, `var(--ease-out)` (`cubic-bezier(0.23, 1, 0.32, 1)`). Release uses the same transition, so it springs back smoothly. A release that is interrupted halfway retargets from the current state (CSS transitions do this).
- Scale values by element (all inside the 0.95 to 0.98 range):
  - `.btn` (pill buttons): `scale(0.97)`
  - `.icon-btn` (32px round `‹ ›` buttons): `scale(0.95)` (small target, needs a little more)
  - `.row-btn` (full-width list rows): `scale(0.985)`, because a wide row at 0.97 visibly pulls its edges in
- Only `transform` is animated. No `transition: all`.
- Reduced motion: no scaling; keep feedback with opacity (gentler, not zero).
- No hover motion is added (the existing hover only changes colors). So no hover media-query gating is needed.

```css
/* target — replaces style.css:85 */
.btn, .icon-btn, .row-btn { transition: transform 160ms var(--ease-out); }
.btn:active { transform: scale(0.97); }
.icon-btn:active { transform: scale(0.95); }
.row-btn:active { transform: scale(0.985); }
```

```css
/* target — inside the existing @media (prefers-reduced-motion: reduce) { ... } block at the end of style.css, after the existing lines */
  .btn:active, .icon-btn:active, .row-btn:active { transform: none; opacity: 0.7; }   /* 크기 대신 살짝 어두워짐으로 눌림 표시 */
```

(The existing line `*:not(dialog) { transition: none !important; }` in that block makes the opacity change instant, which is fine for reduced motion.)

## Repo conventions to follow

- Use the `--ease-out` token that already exists in the `:root` block (`style.css:42`). Do not write the cubic-bezier inline and do not add another token.
- Comments in `style.css` are short Korean one-liners.
- Exemplar of a correct transition in this repo: the `dialog` rules around `style.css:203-212` (specific properties, `var(--ease-out)`, no `all`).

## Steps

1. In `style.css`, replace the single line `.btn:active, .icon-btn:active, .row-btn:active { transform: translateY(1px); }` (line 85) with the four lines in the first **Target** block. Keep it directly under the `.btn.danger` line, where the old line was.
2. In `style.css`, at the very end, inside the existing `@media (prefers-reduced-motion: reduce) { ... }` block, add the one `.btn:active, .icon-btn:active, .row-btn:active { ... }` line from the second **Target** block, after the `@starting-style` line and before the closing `}`.
3. Do not edit anything else.

## Boundaries

- Do NOT touch `app.js`, `index.html`, `logic.js`, `store*.js`, `vendor/`, `test.js`.
- Do NOT add `transition` to `.nav-item`, `.seg button`, `.text-btn`, `.acct-link`, `.chips button`, or `button.figure`. Those are not part of this plan.
- Do NOT add color or border transitions to `:hover` (they are a separate decision).
- Do NOT use `transition: all`, `@keyframes`, `will-change`, or JS.
- Do NOT change sizes, colors or spacing.
- If the lines described in Steps do not match `style.css`, STOP and report instead of improvising.

## Verification

- **Mechanical**: `node test.js` prints `모든 점검 통과`. Count `{` and `}` in `style.css`; they must be equal. No errors in the DevTools Console.
- **Feel check**: run the app and:
  - Press and hold `+ 내역 추가` (on the 가계부 screen): it shrinks smoothly over about 160ms, and when you release it springs back smoothly (no snap). It should be noticeable only if you look for it.
  - Click the month `‹ ›` buttons rapidly: they keep responding and never get stuck small.
  - Press and hold a list row in 최근 내역: the whole row shrinks very slightly; it must not look squashed.
  - Press the round `‹ ›` buttons on a phone-width window (DevTools device mode, touch): the press is visible next to the finger.
  - In the DevTools Animations panel at 10%, the scale and the release move continuously with no jump at the start of either.
  - In the Rendering panel, set `prefers-reduced-motion: reduce`: pressed buttons dim slightly (opacity) and do not scale.
  - Confirm the 입력 창 still opens and closes as in plan 001, and its `취소` / `추가` buttons also give press feedback.
- **Done when**: all three button types scale on press with a 160ms ease-out and release smoothly, the old `translateY(1px)` is gone, reduced motion shows opacity only, and nothing else in the app changed.
