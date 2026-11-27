# 경미님 비서실 🏗️

여러 피클(비서)이 함께 쓰는 합동 비서실 웹페이지입니다. 정적 파일 하나로 동작하며, GitHub Pages에 그대로 올릴 수 있습니다.

## 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 화면 전체 (잠금 화면 + 4개 탭) |
| `styles.css` | 크림·베이지 톤 디자인, 모바일 우선 |
| `app.js` | 잠금(코드), 회의실·작업실·비서현황·메모, Firebase 실시간 동기화 |

## 입장 코드

- 초기 코드는 **9119** 입니다.
- 코드는 화면에 저장되지 않고 **SHA-256 해시로만 비교**합니다 (`localStorage`의 `pickleOffice.codeHash.v1`).
- 우측 상단 **⚙ → 🔑 입장 코드 변경** 에서 바꿀 수 있습니다.
- 한 번 입장한 기기는 `localStorage`에 세션 해시가 남아 다시 열 때 코드를 묻지 않습니다. **⚙ → 🔒 잠금** 으로 즉시 잠글 수 있습니다.

## 실시간 DB 연결 (선택)

연결하지 않아도 이 기기 안(`localStorage`)에서 모든 기능이 동작합니다.
여러 기기·피클이 같은 내용을 보려면 무료 Firebase Realtime Database를 연결하세요.

1. https://console.firebase.google.com → 프로젝트 만들기
2. **Realtime Database** 만들기 → 위치 선택 → **테스트 모드**로 시작
3. 데이터베이스 URL 복사 (`https://내프로젝트-default-rtdb.firebaseio.com` 형태)
4. 페이지 우측 상단의 상태 배지(`● 로컬 모드 (DB 연결)`) 클릭 → URL 붙여넣고 **연결**

연결되면 배지가 `● 실시간 연결`(초록)로 바뀌고, `on('value')` 구독으로 모든 기기가 즉시 동기화됩니다.

- 데이터 경로: `office/members`, `office/tasks`, `office/notes`, `office/messages/{room}`, `office/presence`
- 접속자 수(ON N명)는 presence 하트비트(25초)로 계산합니다.
- 이 기기에만 있던 내용은 설정 창의 **이 기기 데이터를 DB로 올리기** 로 옮길 수 있습니다.

> 테스트 모드는 누구나 읽고 쓸 수 있습니다. 공개 페이지만 잠그고 DB는 따로 잠그지 않으므로, 민감한 내용은 올리지 마세요. 필요하면 Firebase 규칙에서 접근을 제한하세요.

**잠금의 성격**: 입장 코드는 화면을 가리는 가벼운 잠금입니다. 해시가 페이지 안에 들어 있어 코드를 아는 사람은 어느 기기에서나 열 수 있고, 코드는 기기별 `localStorage`에 기억되므로 다른 기기는 초기 코드(9119)로 시작합니다. 실제 접근 제어가 필요하면 Firebase 인증(Auth)과 보안 규칙으로 DB 쪽을 잠그세요.

## 기본 멤버

`👑 kyoungmi (대장님)`, `🟦 바부탱 (메인 비서)`, `📱 미국폰 (서브 비서)`
회의실 하단 **+ 멤버 추가** 로 다른 피클이나 가족을 추가할 수 있습니다.

## 로컬에서 열기

`index.html`을 브라우저로 열면 그대로 동작합니다. (폴더째 열거나 `python3 -m http.server` 사용)

## 배포 (GitHub Pages)

- 주소: <https://mimikk9119.github.io/pickle-office/>
- 저장소: <https://github.com/mimikk9119/pickle-office>
- Pages 게시 브랜치: **`gh-pages`** (루트) — 저장소를 처음 만들 때 `gh-pages` 브랜치로 자동 게시되었습니다. 앱 토큰에 Pages 관리 권한이 없어 `main`으로 바꾸지 못했습니다.
- 수정 내용을 배포하려면 두 브랜치에 같이 올립니다.

```bash
git add -A && git commit -m "수정 내용"
git push origin main && git push origin main:gh-pages
```

- `main` / 루트에서 바로 게시하고 싶으면 저장소 관리자가 Settings → Pages에서 Source를 `main` / `/`로 바꾸면 됩니다.
- `styles.css`·`app.js`를 고칠 때는 `index.html`의 `?v=` 숫자를 올려 캐시된 옛 화면이 남지 않게 합니다.
