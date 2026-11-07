// 달에 따라 테마(계절)를 고름. 페이지 맨 앞(head)에서 동기로 실행해 첫 화면이 깜빡이지 않게 함.
(function (root) {
  "use strict";

  const THEMES_AVAILABLE = ["winter"]; // CSS가 있는 테마만. 새 계절 CSS를 만들면 이름만 추가
  const SEASONS = ["winter", "spring", "summer", "autumn"];

  // month: 1~12 정수. 아니거나 그 계절 CSS가 없으면 "winter"
  function themeForMonth(month, available = THEMES_AVAILABLE) {
    if (!Number.isInteger(month) || month < 1 || month > 12) return "winter";
    const season = SEASONS[Math.floor((month % 12) / 3)]; // 12,1,2 → 0 / 3~5 → 1 / 6~8 → 2 / 9~11 → 3
    return available.includes(season) ? season : "winter";
  }

  if (typeof module !== "undefined") module.exports = { THEMES_AVAILABLE, themeForMonth };
  else {
    root.Theme = { THEMES_AVAILABLE, themeForMonth };
    const html = document.documentElement;
    html.dataset.theme = themeForMonth(new Date().getMonth() + 1); // 허용 목록 안의 값만 넣음
    const ground = getComputedStyle(html).getPropertyValue("--ground").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (ground && meta) meta.setAttribute("content", ground); // 비면 index.html의 대체값 유지
  }
})(this);
