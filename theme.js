// 달에 따라 테마(계절)를 고름. 페이지 맨 앞(head)에서 동기로 실행해 첫 화면이 깜빡이지 않게 함.
(function (root) {
  "use strict";

  const THEMES_AVAILABLE = ["winter", "spring", "summer", "autumn"]; // CSS가 있는 테마만(지금은 네 계절 모두 있음). 새 테마 CSS를 만들면 이름만 추가
  const PREVIEWABLE = ["winter", "spring", "summer", "autumn"]; // ?theme= 미리보기가 되는 테마 = 지금 CSS 블록이 실제로 있는 것
  const SEASONS =["winter", "spring", "summer", "autumn"];

  // month: 1~12 정수. 아니거나 그 계절 CSS가 없으면 "winter"
  function themeForMonth(month, available = THEMES_AVAILABLE) {
    if (!Number.isInteger(month) || month < 1 || month > 12) return "winter";
    const season = SEASONS[Math.floor((month % 12) / 3)]; // 12,1,2 → 0 / 3~5 → 1 / 6~8 → 2 / 9~11 → 3
    return available.includes(season) ? season : "winter";
  }

  // 주소의 theme 값(첫 번째)이 허용 목록에 정확히 있을 때만 그 값, 아니면 null
  function themeFromQuery(search, previewable) {
    if (typeof search !== "string") return null;
    const value = new URLSearchParams(search).get("theme");
    return previewable.includes(value) ? value : null;
  }

  if (typeof module !== "undefined") module.exports = { THEMES_AVAILABLE, PREVIEWABLE, themeForMonth, themeFromQuery };
  else {
    root.Theme = { THEMES_AVAILABLE, PREVIEWABLE, themeForMonth, themeFromQuery };
    const html = document.documentElement;
    // 미리보기는 이 페이지 로드에만 적용(저장 안 함). 허용 목록 안의 값만 넣음
    html.dataset.theme = themeFromQuery(location.search, PREVIEWABLE) || themeForMonth(new Date().getMonth() + 1);
    const ground = getComputedStyle(html).getPropertyValue("--ground").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (ground && meta) meta.setAttribute("content", ground); // 비면 index.html의 대체값 유지
  }
})(this);
