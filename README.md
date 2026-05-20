# CCN — Claude/Codex Notifier

Claude Code와 Codex가 작업을 마치거나 사용자 입력이 필요할 때 VSCode 안에서 알림을 띄우는 확장.

## 주요 기능

- **Claude Code hook 자동 등록** — `Notification`(권한 요청 / 질문), `Stop`(작업 완료), `SubagentStop`, `PreToolUse`(위험 도구 호출 직전, 옵트인)
- **Codex CLI 통합** — `~/.codex/config.toml`의 `notify` 자동 설정 (sentinel로 사용자 설정 보호)
- **VSCode 인앱 알림 + OS 토스트 + 사운드** — Windows / macOS / Linux
- **사이드바 알림 히스토리** — 영속 저장, 이벤트별 아이콘
- **Telegram webhook** — 외부 채널로 푸시 (선택)
- **음소거 토글, 포커스 중 OS 토스트 생략, 지연 후 dismiss로 OS 알림 취소**

## 설치 (.vsix)

CCN은 아직 VSCode Marketplace에 등록되지 않았습니다. [Releases](../../releases)의 `.vsix`를 직접 설치하세요.

### 방법 A — VSCode UI에서 (권장)

1. [Releases](../../releases)에서 최신 `ccn-x.y.z.vsix` 다운로드
2. VSCode → `Ctrl+Shift+P` (macOS는 `Cmd+Shift+P`)
3. `Extensions: Install from VSIX...` 입력 후 실행
4. 다운로드한 `.vsix` 파일 선택
5. VSCode 재시작 (또는 "Reload Window")

### 방법 B — 커맨드라인

```powershell
# Windows / macOS / Linux 공통
code --install-extension .\ccn-0.0.1.vsix
```

### 설치 확인

확장이 활성화되면 자동으로 다음이 수행됩니다:

| 동작 | 결과 |
|---|---|
| `~/.claude/ccn-notify.js` 배치 | Claude Code hook 스크립트 |
| `~/.claude/settings.json` 편집 | `Notification` / `Stop` / `SubagentStop` hook을 sentinel(`# ccn-managed`)로 idempotent 등록 |
| `~/.codex/ccn-notify.js` 배치 | Codex hook 스크립트 |
| `~/.codex/config.toml` 편집 | top-level `notify = [...]` 한 줄을 sentinel로 안전 추가 |
| VSCode 좌측 사이드바 | 🔔 **CCN** 아이콘 (알림 히스토리) |
| 우하단 상태바 | `🔔 CCN` (클릭하면 음소거 토글) |

확인 명령:

```powershell
# 작동 테스트 — CCN Test 알림이 떠야 함
# Ctrl+Shift+P → "CCN: Send Test Notification"

# Claude hook이 정말 박혔는지
Get-Content "$env:USERPROFILE\.claude\settings.json" | Select-String ccn-managed

# Codex notify가 박혔는지
Get-Content "$env:USERPROFILE\.codex\config.toml" | Select-String ccn-managed
```

### 제거

```
Ctrl+Shift+P → "CCN: Uninstall Claude Code Hooks"
Ctrl+Shift+P → "CCN: Uninstall Codex Hook"
```

그 다음 VSCode 확장 패널에서 CCN을 Uninstall. 자기가 박은 hook만 제거되며 사용자가 직접 작성한 hook은 보존됩니다.

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

## 환경설정

두 가지 방법 중 편한 쪽을 쓰면 됩니다.

### 방법 A — Settings UI

1. `Ctrl+,` (macOS는 `Cmd+,`)
2. 검색창에 `ccn` 입력
3. 카테고리별로 정리된 토글/입력을 변경

특정 항목 빠르게:
- "Notify On Dangerous Tool" — Bash 같은 위험 도구 호출 직전 알림
- "Suppress When Focused" — VSCode 보고 있을 땐 OS 토스트/사운드 끄기
- "Webhook Telegram: Bot Token / Chat Id" — 모바일 푸시

### 방법 B — `settings.json` 직접 편집

`Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)" → 원하는 키 추가.

**기본 셋업 (대부분에게 권장)**

VSCode 안에 있을 땐 조용히, 다른 창에 있을 땐 OS 토스트가 뜨도록:

```jsonc
{
  "ccn.suppressWhenFocused": true,
  "ccn.claude.notifyOnTaskComplete": true,
  "ccn.claude.notifyOnPermissionRequest": true,
  "ccn.claude.notifyOnQuestion": true,
  "ccn.notificationDelayMs": 1500
}
```

`notificationDelayMs: 1500` — VSCode 인앱 팝업을 1.5초 안에 dismiss하면 OS 토스트/사운드 취소.

**조용한 모드 (작업 완료 시만)**

매 턴마다 알림이 부담스러울 때:

```jsonc
{
  "ccn.claude.notifyOnTaskComplete": true,
  "ccn.claude.notifyOnQuestion": true,
  "ccn.claude.notifyOnPermissionRequest": false,
  "ccn.codex.notifyOnTaskComplete": true,
  "ccn.sound": false,
  "ccn.systemNotification": false
}
```

**위험 도구 알림 켜기 (권한 모달이 hook을 우회하는 경우)**

Claude Code 일부 버전에서 권한 모달이 `Notification` hook을 fire하지 않을 때:

```jsonc
{
  "ccn.claude.notifyOnDangerousTool": true,
  "ccn.claude.dangerousToolMatcher": "Bash|Write|Edit"
}
```

이 설정 변경 시 ccn이 **자동으로 `PreToolUse` hook을 재설치**합니다. 매 호출마다 fire되니 노이즈에 주의 — 정말 필요할 때만.

### Telegram 푸시 (모바일 알림)

자리 비울 때 모바일로 알림 받기:

1. Telegram에서 [@BotFather](https://t.me/BotFather)에게 `/newbot` → bot 만들고 **Bot Token** 받기
2. 그 bot에게 아무 메시지나 보내기 (대화 시작)
3. 브라우저로 `https://api.telegram.org/bot<TOKEN>/getUpdates` 열고 `chat.id` 값 확인
4. VSCode 설정:

```jsonc
{
  "ccn.webhook.telegram.botToken": "1234567890:ABCdef...",
  "ccn.webhook.telegram.chatId": "987654321",
  "ccn.webhook.telegram.onlyWhenUnfocused": true
}
```

`onlyWhenUnfocused: true` — VSCode가 활성 창일 땐 Telegram 안 보냄 (스팸 방지).

### 알림 끄기 / 일시 정지

- **잠깐만 끄기**: 우하단 상태바의 🔔 클릭 → 음소거 토글
- **특정 이벤트만 끄기**: 위의 `notifyOnXxx` 키 중 해당 항목을 `false`로
- **완전히 끄기**: 확장 비활성화 (Extensions 패널) 또는 `CCN: Uninstall Claude Code Hooks` 실행

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
