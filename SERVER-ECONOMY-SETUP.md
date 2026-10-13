# 서버 잔액·소유권 전환 설정

현재 상태: 코드는 구현했지만 실서비스 전환 스위치는 꺼져 있다. `assets/cloud/economy-config.js`의 enabled=false를 유지한다. Firebase 비공개 인증과 보안 규칙 배포가 확인되지 않은 상태에서 완료됐다고 볼 수 없다.

## 필요한 비공개 인증

1. [Firebase 서비스 계정](https://console.firebase.google.com/project/smm2-505da/settings/serviceaccounts/adminsdk)에서 프로젝트가 **smm2-505da**인지 확인한다.
2. Firebase Admin용 비공개 키를 발급해 프로젝트 폴더 밖에 보관한다. 기존에 적절한 서비스 계정이 있으면 재사용한다. 키를 채팅, GitHub, Netlify 배포 폴더에 넣지 않는다.
3. Render의 miami-relay → Environment → Secret Files에 `firebase-admin.json`으로 등록한다. 키 내용은 Render의 비공개 입력란에만 넣는다.
4. Render 환경 변수:
   - `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json`
   - `FIREBASE_PROJECT_ID=smm2-505da`
   - `ECONOMY_ENABLED=1`
   대안으로 `FIREBASE_SERVICE_ACCOUNT_JSON` 비공개 환경 변수도 지원한다. 두 방식 중 하나면 된다.
5. 실서비스에는 `MIAMI_TEST_AUTH`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`를 설정하지 않는다.

서버 계정에는 Firestore 읽기/쓰기와 Firebase Auth 사용자 확인 권한이 필요하다. Rules 검증 도구에는 Firebase Rules 읽기 권한도 필요하다. 프로젝트 전체 관리자 키를 프런트에 배포하는 방식은 사용하지 않는다.

## 배포 및 전환 순서

출시 전 짧은 점검 시간에 수행하고, 기존 플레이 탭을 닫은 뒤 새로 접속하게 한다. 규칙만 먼저 잠그고 오래 방치하면 옛 프런트의 저장이 거부된다.

1. 서버 릴리스 폴더 `.dev/server-economy-release`의 **모든 .js, economy-catalog.json, package.json, package-lock.json**을 Render 저장소 루트에 반영하고 배포한다. 기존 스포츠 모듈도 보존한다. 서버 파일 하나만 올리면 안 된다.
2. 위 비공개 인증을 설정한다. `/economy/status`에서 `configured:true`를 확인한다. 아직 migration gate가 없으므로 `available:false`가 정상이다.
3. Firebase 콘솔의 Firestore Rules에 프로젝트 루트 `firestore.rules`를 게시한다. 소유자라도 save/work/쿠폰/원장을 직접 쓸 수 없게 하는 규칙이다. 원본 기존 데이터는 삭제하지 않는다.
4. 키를 안전한 로컬 경로에 둔 상태에서 아래 도구를 실행한다. 도구는 실제 게시된 규칙이 파일과 일치하는지 확인한 후에만 서버 이전 게이트를 연다.

   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS='C:\Users\minky\.credentials\smm2-admin.json'
   node tools/check-economy-cutover.mjs --cutover
   ```

   규칙 조회 권한이 없으면 중단한다. 확인하지 않고 migration marker를 수동으로 만들지 않는다.
5. 최대 30초 뒤 Render `/economy/status`의 `available:true`를 확인한다.
6. `assets/cloud/economy-config.js`의 `enabled`를 true로 바꾸고 **assets 전체와 동일한 두 HTML**을 Netlify에 함께 게시한다. 이전 게시 도구를 사용할 경우 신규 economy-client.js/economy-config.js/jobs.js/cloud.js도 포함해야 한다.
7. 실제 계정으로 로그인 → 소액 구매 → 재로그인 → 소유 차량 확인 → 40% 판매를 확인한다. 공개 파일 해시와 서버 상태도 확인한다. 키는 어느 보고서에도 넣지 않는다.

## 이전과 권한 경계

- 서버가 `players/{uid}`의 기존 저장본을 읽어 한 번만 이전한다. 브라우저의 localStorage/요청 본문을 이전 자료로 받지 않는다.
- 원본은 서버 전용 `economyMigrations/{uid}`에 남긴다. 기존 구매 기록이 없는 차량 가격은 서버 카탈로그 기준으로 확정한다. 구분할 수 없는 과거의 실제 획득/조작 이력까지 소급 판별할 수는 없다.
- `economyAccounts/{uid}`가 잔액과 소유권의 기준이다. `players.save`는 읽기 호환용 투영이며 클라이언트 쓰기는 차단한다.
- 가격, 차고 보유, 공간, 고유 차량 ID, 판매 금액, 잔액을 서버가 확인한다. 세대 검사와 영구 거래 영수증으로 재전송/여러 창/응답 유실을 처리한다.
- 일반 저장은 기존 차량의 이동, 연료/방탄 소모, 소유한 항목의 장착 등만 반영한다. 신규 소유권이나 잔액은 반영하지 않는다. 누락된 차량은 삭제하지 않는다.
- 직업 보상은 서버가 지정한 경로, 서버가 관측한 경유지, 서버 시각으로 계산한다. 도로 경로 탐색은 별도 Worker에서 실행해 릴레이 프레임을 막지 않는다. 서버 재시작 후 관측 증명이 없어진 진행 중 임무는 보상 지급을 거부하며 취소할 수 있다.
- **NPC 현금 드롭은 전환 후 지급 중단**: 현재 NPC 처치는 브라우저에서만 판정하므로 이를 곧바로 돈으로 인정하지 않는다. 서버 NPC 판정 없이 클라이언트가 원하는 보상을 요청하게 하는 우회 경로는 만들지 않았다.
- 쿠폰은 서버 환경 변수 `ECONOMY_COUPONS_JSON`에 명시한 코드만 유효하다. 기본은 빈 목록이다. 기존 공개 개발자 거액 쿠폰은 자동 재활성화하지 않는다.
- 차량 위치/물리, 전투 피격, 외형 자체까지 서버가 전부 시뮬레이션하는 시스템은 아니다. 로컬 화면 조작이나 이동 치트를 모두 막았다고 주장하지 않는다. 이 전환의 보안 경계는 경제 거래와 영구 소유권이다.

## 새 차량과 가격 변경

현재 실제 실행 카탈로그는 285종이다. 차량/상점 가격을 추가·변경할 때 `node tools/generate-economy-catalog.mjs`로 신뢰할 서버 카탈로그를 다시 만들고 프런트와 서버를 함께 배포한다. 미등록 차종은 서버가 구매를 거부한다. 카탈로그 생성에는 로컬 테스트 서버(`node tools/serve.mjs`)와 Chrome이 필요하다.

## 검증과 참고

- 실제 Firestore Emulator: `tools/verify-server-economy.mjs`
- 실제 보안 규칙 검사: `tools/verify-economy-rules.mjs`
- 실제 WebGL/HTTP/DB 구매·판매 및 조작 거부: `tools/verify-economy-browser.mjs`
- [Firebase Admin 설정](https://firebase.google.com/docs/admin/setup)
- [클라이언트 필드 쓰기 제한](https://firebase.google.com/docs/firestore/security/rules-fields)
- [Firestore 트랜잭션의 직렬성](https://firebase.google.com/docs/firestore/transaction-data-contention)
