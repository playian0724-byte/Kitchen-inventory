취사장 재고관리 PUSH V2

1. GitHub 저장소 최상단에 ZIP 내용을 업로드합니다.
   - sw.js는 기존 파일 교체
   - push.js / package.json / vercel.json / api 폴더는 새로 추가
   - push-subscriptions.sql은 GitHub에 둘 필요는 없으며 Supabase SQL Editor에서 실행

2. index.html 수정:
   기존 app.js를 불러오는 script 태그 바로 다음에 아래 한 줄 추가:
   <script src="push.js"></script>

3. Vercel Environment Variables:
   이미 추가: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
   추가 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   (CRON_SECRET은 Vercel Cron에서 자동 제공되는 방식에 맞춰 사용)

4. vercel.json의 cron:
   0 9 * * * = UTC 09:00 = 한국시간 18:00

5. 배포 후 홈 화면 웹앱에서 로그인한 상태로 🔔 버튼을 눌러
   '알림 등록 완료'가 뜨는지 확인합니다.
