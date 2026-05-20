# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-05-20

### Added
- Claude Code hook 자동 등록: `Notification`(권한 요청 / 질문), `Stop`(작업 완료), `SubagentStop`
- 옵트인 `PreToolUse` hook — 위험 도구(Bash/Write/Edit 등) 호출 직전 알림. 설정 토글 시 자동 재설치
- Codex CLI 통합 — `~/.codex/config.toml`의 `notify` 키를 sentinel 기반으로 안전 편집
- VSCode 인앱 알림 + OS 토스트 + 사운드 (Windows / macOS / Linux)
- 사이드바 알림 히스토리 TreeView — 영속 저장, 이벤트별 아이콘, 음소거 토글
- Telegram webhook 연동 — VSCode 비활성 시에만 전송하는 옵션 포함
- 알림 지연(notificationDelayMs) — VSCode 팝업을 시간 안에 dismiss하면 OS 토스트/사운드 취소
- `suppressWhenFocused` — VSCode 활성 중 OS 토스트/사운드 생략 (인앱 메시지는 유지)
- 명령어: `Send Test Notification`, `Install/Uninstall Claude Code Hooks`, `Install/Uninstall Codex Hook`, `Show Output Log`
- 단위/통합 테스트 18개 (페이로드 파싱, idempotent 설치, 사용자 hook 보존, matcher drift, 옵션 토글 라이프사이클, TOML 라인 편집)

### Security
- Sentinel(`# ccn-managed`) 기반 hook 식별 — 자기가 박은 항목만 갱신/제거. 사용자가 직접 작성한 hook은 절대 손대지 않음
- 사용자 `notify` 설정 발견 시 Codex config 자동 편집 skip + 경고
- 의존성 0 (zero-dep). Node 표준 라이브러리만 사용 → supply chain 노출 최소화
- 외부 webhook URL은 사용자 설정 시에만 활성화, default 비활성

### Known limitations
- 다중 사용자가 동일 머신에서 동시에 사용할 때 `$TMPDIR/ccn-notify-<user>` race 가능성 미검증
- Codex CLI 외 다른 도구의 `notify` 호출 변형 미검증
- VSCode Marketplace 발행 흐름 미검증

[Unreleased]: https://github.com/youpd/CCN/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/youpd/CCN/releases/tag/v0.0.1
