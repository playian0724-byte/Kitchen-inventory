# 취사장 재고관리 MVP

모바일 우선으로 만든 10명 안팎 공유용 재고 웹앱입니다.

## 들어있는 기능
- 품목 / 수량 / 위치 / 유통기한 / 메모 등록
- 재고 추가, 수정, 삭제
- 검색 및 유통기한 필터
- D-30: 노란색 / D-7: 주황색 / 만료: 빨간색
- D-7 이하(만료 포함) 브라우저 알림: 앱을 열었을 때 기기당 하루 1회
- Supabase 연결 시 로그인한 팀원끼리 공유 및 실시간 동기화
- Supabase 미연결 시 데모 모드(localStorage)
- PWA: 홈 화면에 추가 가능

## 1. 먼저 데모로 보기
정적 웹서버에서 폴더를 열면 됩니다.

Python이 있다면:
```bash
python3 -m http.server 8080
```
그다음 브라우저에서 `http://localhost:8080` 접속.

`index.html`을 파일로 직접 여는 것보다 로컬 서버 사용을 권장합니다(Service Worker 때문).

## 2. 팀 공유 모드 만들기
1. https://supabase.com 에서 새 프로젝트 생성
2. SQL Editor에서 `supabase.sql` 전체 실행
3. Authentication > Providers에서 Email 로그인 사용
4. 팀원 외 가입을 막고 싶다면 공개 가입(Sign ups)을 끄고 관리자가 사용자 10명을 생성/초대
5. Project Settings > API에서 Project URL + Publishable key(또는 anon key) 확인
6. `config.js`에 두 값을 입력

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_KEY: "YOUR_PUBLISHABLE_KEY"
};
```

주의: `service_role` key는 절대 브라우저 코드에 넣지 마세요.

## 3. 인터넷에 올리기
이 폴더 전체를 Vercel / Netlify / Cloudflare Pages / GitHub Pages 같은 정적 호스팅에 배포하면 됩니다.
10명 규모라면 초기에는 무료 플랜으로도 충분한 경우가 많습니다.

## 알림에 대한 현재 제한
현재 1차 MVP는 `앱을 열거나 데이터가 갱신될 때` D-7 이하 품목을 찾아 브라우저 알림을 보냅니다. 앱이 완전히 닫혀 있어도 매일 자동으로 울리는 '진짜 백그라운드 푸시'는 아직 아닙니다.

다음 버전에서 Supabase Edge Function + 스케줄러 + Web Push(VAPID)를 추가하면 앱이 닫혀 있어도 매일 정해진 시간에 유통기한 임박 알림을 보낼 수 있습니다.

## 권장 운영 규칙
같은 식재료라도 유통기한이 다르면 행을 나눠 등록하세요.
예: 우유 20개(9/20) / 우유 30개(10/3)
이렇게 해야 선입선출과 유통기한 관리가 정확합니다.
