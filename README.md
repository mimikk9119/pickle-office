# 경미님 비서실 🏗️

여러 피클(비서)이 함께 쓰는 합동 비서실 웹페이지입니다. 정적 파일 하나로 동작하며, GitHub Pages에 그대로 올릴 수 있습니다.

## 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 화면 전체 (잠금 화면 + 4개 탭) |
| `styles.css` | 크림·베이지 톤 디자인, 모바일 우선 |
| `app.js` | 잠금(코드), 회의실·작업실·비서현황·메모, Firebase 실시간 동기화 |

## 입장 코드

- 입장 코드는 **초대받은 멤버에게 별도로 전달됩니다.** 이 문서와 소스에는 적지 않습니다.
- 입력한 코드는 파일에 평문으로 남지 않고, 솔트를 붙인 **SHA-256 해시로만 비교**합니다 (`app.js`의 `DEFAULT_CODE_HASH`).
- 우측 상단 **⚙ → 🔑 입장 코드 변경** 에서 바꿀 수 있습니다. 바꾼 코드는 그 기기의 `localStorage`에 해시로만 저장됩니다.
- 한 번 입장한 기기는 `localStorage`에 세션 해시가 남아 다시 열 때 코드를 묻지 않습니다. **⚙ → 🔒 잠금** 으로 즉시 잠글 수 있습니다(잠그면 실시간 연결도 함께 끊깁니다).

## 실시간 DB 연결 (기본 DB 내장)

기본 DB 주소가 `app.js`의 `DEFAULT_DB_URL`에 들어 있습니다.

```
https://pickle-office-a97e9-default-rtdb.firebaseio.com
```

그래서 URL을 따로 넣지 않아도, 페이지를 열고 입장 코드를 넣으면 자동으로 이 DB에 붙어
배지가 `● 실시간 연결`(초록)로 표시됩니다. 연결되지 않으면 이 기기 안(`localStorage`)에서
모든 기능이 그대로 동작합니다.

- **다른 DB로 바꾸기**: 우측 상단 배지 클릭 → `databaseURL` 수정 → **연결**
- **이 기기만 로컬로 쓰기**: 배지 클릭 → **연결 해제** (그 기기에서는 다시 열어도 자동 연결하지 않음)
- **다시 실시간으로**: 배지 클릭 → **연결** (입력란이 비어 있으면 기본 DB로 연결)

### 데이터 경로와 보안 규칙

입장 코드를 넣으면 앱이 `roomKey = sha256("pickle-room-v2:" + 코드)`를 계산해 기기에 저장하고,
DB는 그 아래 경로로만 읽고 씁니다.

- 데이터 경로: `rooms/{roomKey}/office/members`, `.../tasks`, `.../notes`, `.../messages/{room}`, `.../presence`
- `app.js` 소스에는 `roomKey`도 입장 코드도 평문으로 들어 있지 않습니다. 코드를 아는 사람만 자기 방 경로를 계산할 수 있습니다.
- Firebase 규칙은 **루트 읽기/쓰기를 막고 `rooms/$roomKey`만 허용**합니다. 그래야 `GET /.json?shallow=true` 같은 루트 조회로 전체를 훑을 수 없습니다.

Realtime Database 규칙 (Console → Realtime Database → 규칙):

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$roomKey": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

- 접속자 수(ON N명)는 presence 하트비트(25초)로 계산합니다.
- 이 기기에만 있던 내용은 설정 창의 **이 기기 데이터를 DB로 올리기** 로 옮길 수 있습니다.
- **⚙ → 🔑 입장 코드 변경** 으로 코드를 바꾸면 `roomKey`도 바뀌어 새 방(새 경로)으로 이동합니다. 이전 코드의 방 데이터는 그 경로에 그대로 남으므로, 같은 방을 계속 쓰려면 멤버 전원이 같은 코드를 써야 합니다.

새 Firebase 프로젝트를 직접 만들어 쓰려면:

1. https://console.firebase.google.com → 프로젝트 만들기
2. **Realtime Database** 만들기 → 위치 선택
3. 데이터베이스 URL 복사 (`https://내프로젝트-default-rtdb.firebaseio.com` 형태)
4. 위 규칙을 붙여넣고 게시
5. 페이지 우측 상단의 상태 배지 클릭 → URL을 바꿔 넣고 **연결**

연결되면 `on('value')` 구독으로 모든 기기가 즉시 동기화됩니다. 파일을 고칠 때마다 `index.html`의 `?v=` 숫자를 하나씩 올리면 브라우저 캐시가 바로 갱신됩니다(현재 `?v=9`).

> **잠금의 성격**: 입장 코드는 화면을 가리는 가벼운 잠금입니다. 코드를 아는 사람은 어느 기기에서나 열 수 있습니다. 실제 접근 제어는 위의 DB 규칙(루트 차단)이 담당하므로, 규칙을 풀거나(테스트 모드) 민감한 내용을 올리지 마세요.

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
