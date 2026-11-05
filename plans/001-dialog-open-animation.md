# 001 — Animate the "내역 추가/수정" dialog open and close

- **Status**: DONE (적용됨, 폰에서 확인 완료)
- **Commit**: 0bfd8c4 (working copy had uncommitted edits to `style.css`, `app.js`, `index.html` when this plan was written; line numbers below are from that working copy)
- **Severity**: MEDIUM (missed opportunity: a jarring state change on a screen seen several times a day)
- **Category**: Missed opportunities / Interruptibility
- **Estimated scope**: 1 file (`style.css`), about 25 lines added or changed. No JS, no HTML.

## Problem

The one `<dialog id="edit-dialog">` (opened by `+ 내역 추가` and by clicking a row) appears and disappears instantly. `app.js` calls `showModal()` / `close()` with no motion, and `style.css` gives the dialog and its backdrop no transition, so the dark overlay and the card snap in and out.

```js
// app.js:111 — current
$("edit-dialog").showModal();
```

```css
/* style.css:203-204 — current */
dialog { background: var(--surface); color: var(--text); border: 0; border-radius: var(--radius-card); padding: var(--pad); width: min(92vw, 440px); box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5); /* taste-skill-ignore: 떠 있는 입력 창 */ }
dialog::backdrop { background: rgba(0, 0, 0, 0.7); }
```

```css
/* style.css:252 (last line) — current. Kills ALL transitions when the user prefers reduced motion. */
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
```

There is no `--ease-out` token in this file yet.

Frequency: occasional (a few times a day), so standard animation is allowed. Purpose: preventing a jarring change.

## Target

Exact end state. Modals stay centered, so `transform-origin` is left at its default (center). Do not change it.

- Enter: `opacity 0 → 1` and `scale(0.97) → 1`, **200ms**, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Exit: the reverse, faster, **150ms**, same curve (the system's response snaps; it does not make the user wait).
- Backdrop: `opacity 0 → 1` over the same times. The backdrop's color stays `rgba(0, 0, 0, 0.7)`.
- Only `transform` and `opacity` are animated. Never `transition: all`. Never `scale(0)`.
- Reduced motion: no scale movement, but keep the opacity fade (gentler, not zero).

```css
/* target — replaces style.css:203-204 */
:root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); }   /* put this inside the existing :root block instead of a second :root, see Steps */

dialog {
  background: var(--surface); color: var(--text); border: 0; border-radius: var(--radius-card); padding: var(--pad); width: min(92vw, 440px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5); /* taste-skill-ignore: 떠 있는 입력 창 */
  /* closed state = exit end state; these durations are the EXIT timing */
  opacity: 0; transform: scale(0.97);
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out), overlay 150ms allow-discrete, display 150ms allow-discrete;
}
dialog[open] { opacity: 1; transform: none; transition-duration: 200ms; }   /* ENTER timing */
@starting-style { dialog[open] { opacity: 0; transform: scale(0.97); } }

dialog::backdrop {
  background: rgba(0, 0, 0, 0.7); opacity: 0;
  transition: opacity 150ms var(--ease-out), overlay 150ms allow-discrete, display 150ms allow-discrete;
}
dialog[open]::backdrop { opacity: 1; transition-duration: 200ms; }
@starting-style { dialog[open]::backdrop { opacity: 0; } }
```

```css
/* target — replaces style.css:252 */
@media (prefers-reduced-motion: reduce) {
  *:not(dialog) { transition: none !important; }
  dialog, dialog[open] { transform: none; }
  @starting-style { dialog[open] { transform: none; } }
}
```

## Repo conventions to follow

- All design tokens live in the single `:root { ... }` block at the top of `style.css` (colors, radii, `--control-height`, ...). Add `--ease-out` there, next to `--gap` / `--pad`. Do not create a second `:root`.
- Comments in `style.css` are short Korean one-liners. Keep that style.
- Exemplar that already does motion correctly: `vendor/charts.js:112` (tooltip uses `opacity` with a `transition`, 120ms). Do not edit that file.

## Steps

1. In `style.css`, inside the existing `:root { ... }` block, add one line before `color-scheme: dark;`:
   `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* 강한 ease-out: 창·버튼 움직임 공통 */`
2. In `style.css`, replace the two lines `dialog { ... }` and `dialog::backdrop { ... }` (currently lines 203–204) with the `dialog`, `dialog[open]`, `@starting-style`, `dialog::backdrop`, `dialog[open]::backdrop`, `@starting-style` blocks from **Target** (the first code block, without the stray `:root` line). Keep the existing `box-shadow` and the `/* taste-skill-ignore ... */` comment on the same line as the shadow. Leave the following line `dialog h2 { margin-bottom: 14px; }` and the `.type-seg` lines untouched.
3. In `style.css`, replace the final `@media (prefers-reduced-motion: reduce) { ... }` line with the multi-line block from **Target** (second code block).
4. Do not edit `app.js` or `index.html`.

## Boundaries

- Do NOT touch `app.js`, `index.html`, `logic.js`, `store*.js`, `vendor/`, `test.js`.
- Do NOT add `transition` to any other element (buttons, tabs, rows). Those are separate plans.
- Do NOT change `transform-origin` (the modal must stay centered).
- Do NOT use `transition: all`, `@keyframes`, JS timers or `setTimeout` for open/close.
- Do NOT add dependencies.
- If the lines described in Steps do not match what you find in `style.css`, STOP and report instead of improvising.

## Verification

- **Mechanical**: `node test.js` should print the same result as before the change (this plan does not touch logic, so only confirm nothing broke). Open `index.html` through the app's normal way of running (the same way the owner uses it) and confirm there are no CSS errors in the DevTools Console.
- **Feel check**: log in, press `+ 내역 추가`, and confirm:
  - The card fades in while growing very slightly from the center (not from a corner, not from nothing), and the dark backdrop fades in with it. It should feel quick, not floaty.
  - `취소`, the `Esc` key, and saving all fade the card and backdrop out a bit faster than they came in. After saving, the list behind updates as before.
  - Clicking a row to edit behaves the same as adding.
  - Spam-open and close (`+ 내역 추가`, `Esc`, repeat quickly): it never jumps or restarts from zero (transitions retarget mid-motion).
  - The amount field is focused right away and you can type while the fade is still running (`form.amount.focus()` at `app.js:112` still works).
  - In DevTools, Animations panel, set playback to 10%: opacity and scale move together; there is no flash of the full-size card before the fade starts.
  - In DevTools, Rendering panel, set `prefers-reduced-motion: reduce`: the card and backdrop only fade (no scale), and nothing else on the page gains animation.
  - Browser note: this needs Chrome/Edge 117+, Safari 17.4+, or Firefox 129+. In an older browser the dialog still opens and closes correctly, just instantly (that is the current behavior), so this is safe to ship.
- **Done when**: the dialog fades and scales in over about 200ms, fades out over about 150ms, the backdrop fades with it, reduced-motion shows a fade only, and no other element in the app has changed behavior.
