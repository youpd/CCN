# CCN — Claude/Codex Notifier

Claude Code와 Codex가 작업을 마치거나 사용자 입력이 필요할 때 VSCode 안에서 알림을 띄우는 확장.

## 주요 기능

- **Claude Code hook 자동 등록** — `Notification`(권한 요청 / 질문), `Stop`(작업 완료), `SubagentStop`, `PreToolUse`(위험 도구 호출 직전, 옵트인)
- **Codex CLI 통합** — `~/.codex/config.toml`의 `notify` 자동 설정 (sentinel로 사용자 설정 보호)
- **VSCode 인앱 알림 + OS 토스트 + 사운드** — Windows / macOS / Linux
- **사이드바 알림 히스토리** — 영속 저장, 이벤트별 아이콘
- **Telegram webhook** — 외부 채널로 푸시 (선택)
- **음소거 토글, 포커스 중 OS 토스트 생략, 지연 후 dismiss로 OS 알림 취소**

## 설치

1. [Releases](../../releases) 에서 최신 `.vsix` 다운로드
2. VSCode → `Ctrl+Shift+P` → "Extensions: Install from VSIX..." → 다운로드한 파일 선택
3. 확장 활성화 시 `~/.claude/settings.json`과 `~/.codex/config.toml`에 hook이 자동 등록됨

## 동작 원리

```
Claude/Codex 이벤트 발생
    │
    │ stdin/argv로 페이로드 전달
    ▼
~/.claude/ccn-notify.js  또는  ~/.codex/ccn-notify.js
    │
    │ JSON 정규화 후 기록
    ▼
$TMPDIR/ccn-notify-<user>
    │
    │ fs.watch 감지
    ▼
VSCode 확장 → 알림 + 히스토리 + (Telegram)
```

HTTP 서버나 IPC 없이 단일 tmp 파일로 통신 — 포트 충돌·방화벽 다이얼로그 회피.

## 주요 설정

| 키 | 기본값 | 설명 |
|---|---|---|
| `ccn.claude.notifyOnPermissionRequest` | `true` | 권한 요청 알림 |
| `ccn.claude.notifyOnQuestion` | `true` | Claude의 질문 알림 (elicitation) |
| `ccn.claude.notifyOnTaskComplete` | `true` | 작업 완료 알림 (Stop hook) |
| `ccn.claude.notifyOnSubagentStop` | `false` | 서브에이전트 종료 알림 |
| `ccn.claude.notifyOnDangerousTool` | `false` | Bash/Write/Edit 호출 직전 알림. **켜면 hook 자동 재설치됨** |
| `ccn.claude.dangerousToolMatcher` | `Bash\|Write\|Edit` | 위험 도구 matcher 정규식 |
| `ccn.codex.notifyOnTaskComplete` | `true` | Codex 작업 완료 알림 |
| `ccn.systemNotification` | `true` | OS 토스트 표시 |
| `ccn.sound` | `true` | 사운드 재생 |
| `ccn.notificationDelayMs` | `0` | 이 시간 안에 VSCode 팝업을 dismiss하면 OS 토스트/사운드 취소 |
| `ccn.suppressWhenFocused` | `false` | VSCode 활성 중일 땐 OS 토스트/사운드 생략 |
| `ccn.mute` | `false` | 모든 알림 일시 정지 |
| `ccn.webhook.telegram.botToken` | `""` | Telegram Bot Token (비어있으면 비활성) |
| `ccn.webhook.telegram.chatId` | `""` | Telegram Chat ID |
| `ccn.webhook.telegram.onlyWhenUnfocused` | `true` | VSCode 비활성일 때만 Telegram 전송 |
| `ccn.history.maxItems` | `200` | 사이드바 히스토리 최대 보관 개수 |

## 명령어

| 명령 | 설명 |
|---|---|
| `CCN: Send Test Notification` | 테스트 알림 |
| `CCN: Install/Uninstall Claude Code Hooks` | hook 수동 (재)설치/제거 |
| `CCN: Install/Uninstall Codex Hook` | Codex notify 설정 (재)설치/제거 |
| `CCN: Show Output Log` | 디버그 로그 확인 |

## Codex 통합 시 주의

`~/.codex/config.toml`에 사용자가 직접 `notify`를 설정해 둔 경우, ccn은 **건드리지 않고 경고만 띄웁니다**. 자동 등록을 원하면 해당 줄을 지운 뒤 `CCN: Install Codex Hook` 명령을 실행하세요.

## sentinel — 안전한 자동 편집

ccn이 settings에 박는 모든 hook 명령 끝에 `# ccn-managed` 무해 주석이 붙어 있습니다. 이 마커로 자기가 박은 항목만 식별·갱신·제거하며, 사용자가 직접 작성한 hook은 절대 손대지 않습니다.

## 개발

```bash
# Extension Development Host 실행
F5

# 단위 테스트
node test/run.js

# 패키징
npm i -g @vscode/vsce
vsce package
```

## License

MIT
