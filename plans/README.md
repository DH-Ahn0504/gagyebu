# 애니메이션 계획 목록

| # | 제목 | 중요도 | 상태 |
| --- | --- | --- | --- |
| 001 | 내역 입력 창 열기·닫기 애니메이션 (`001-dialog-open-animation.md`) | MEDIUM | DONE (코드 확인 완료, 느낌 확인 전) |
| 002 | 버튼 눌림 효과 부드럽게 (`002-button-press-feedback.md`) | LOW~MEDIUM | DONE (느낌 확인 전, 시간은 120ms로 유지) |

실행 순서: 001 → 002. 002는 001에서 만든 `--ease-out` 변수와 reduced-motion 블록을 씁니다(001은 이미 적용됨).
