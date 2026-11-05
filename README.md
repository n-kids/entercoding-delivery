# 엔터코딩 원별 납품 GPS 알리미 (네이티브 터치 오버레이 + 네이버 내비 연동 고정 + Android APK 빌드)

## 1. 핵심 업데이트 기능

1. **미디어 재생바 없는 '진짜 터치형 플로팅 오버레이 미니창' (`FloatingOverlayManager.java` / `AndroidOverlay`)**
   - 안드로이드 APK로 설치하면 배달·콜앱처럼 안드로이드 **`다른 앱 위에 표시` (`SYSTEM_ALERT_WINDOW`)** 권한을 사용하여 네이버 내비게이션 화면 위에 **미디어 재생 컨트롤(재생/일시정지 아이콘)이 전혀 없는 진짜 네이티브 플로팅 미니창**이 뜹니다.
   - **미니창 안에서 직접 터치 가능**:
     - `☐ / ☑ 품목 행 터치`: 네이버 내비를 보면서 각 단계별 교재·교사용·추가물품 체크박스를 직접 터치해 체크/해제할 수 있습니다.
     - `[✓ 완료처리]` 버튼: 현재 목적지 납품(또는 회수)을 미니창에서 즉시 완료 처리합니다.
     - `[다음 원 ▶]` 버튼: 다음 미완료 원으로 즉시 대상을 전환합니다.
     - `[접기 ➖ / 펼치기 ➕]` 및 **드래그 이동**: 지도를 가리지 않게 원 이름과 거리만 남기고 작게 접거나 원하는 위치로 자유롭게 끌어다 놓을 수 있습니다.

2. **네이버 내비 길안내 목적지 거리 무관 고정 표시 (`🧭 내비고정`)**
   - 각 원 카드의 **`[🟢 네이버 내비 출발(수량표시)]`** 또는 **`[📌 PiP고정]`**을 누르면 현재 내비로 안내 중인 원이 **GPS 거리와 상관없이** 오버레이 미니창과 PiP에 끝까지 고정 표시됩니다.
   - 납품 완료 시 자동으로 고정이 해제되어 다음 코스로 자연스럽게 넘어갑니다.

---

## 2. 안드로이드 APK 설치 파일(`.apk`) 만드는 방법 (2가지)

### 방법 A. PC에 프로그램 설치 없이 GitHub에서 3분 만에 자동 생성하기 (가장 추천)

이 압축 파일 안에는 GitHub 서버가 대신 안드로이드 앱을 빌드해 주는 자동화 설계도(`.github/workflows/build-apk.yml`)와 네이티브 오버레이 자동 주입 스크립트(`scripts/configure-android.mjs`)가 모두 들어 있습니다.

1. **GitHub 저장소에 파일 업로드**
   - 압축을 풀고 안에 있는 모든 파일과 폴더(`index.html`, `sw.js`, `manifest.webmanifest`, `package.json`, `capacitor.config.json`, `scripts/`, 그리고 숨김 폴더인 `.github/workflows/build-apk.yml`)를 본인의 GitHub 저장소 `main` 브랜치에 업로드(Push)합니다.
2. **GitHub Actions 실행 확인**
   - GitHub 저장소 상단 메뉴의 **[Actions]** 탭을 클릭합니다.
   - 파일을 올리면 자동으로 **Build Android APK (엔터코딩 납품알리미)** 워크플로우가 실행됩니다. (수동으로 실행하려면 왼쪽에서 워크플로우 선택 후 우측 **[Run workflow]** 클릭)
3. **완성된 APK 다운로드**
   - 약 2~3분 뒤 초록색 체크(`✅`)가 표시되면 해당 워크플로우를 클릭합니다.
   - 화면 맨 아래 **Artifacts** 항목에 있는 **`entercoding-delivery-android-apk`**를 클릭해 다운로드합니다.
   - 다운로드한 압축 파일을 풀면 **`app-debug.apk`** 설치 파일이 들어 있습니다.
4. **스마트폰 설치 및 권한 허용**
   - `app-debug.apk` 파일을 카카오톡(나에게 보내기)이나 구글 드라이브로 안드로이드 폰에 보내 설치합니다.
   - 앱 실행 후 **`[🪟 내비 위 미니창(오버레이/PiP)]`** 버튼을 누르면 열리는 설정 화면에서 **[다른 앱 위에 표시] 허용**과 **위치 권한 [항상 허용]**을 켜주시면 됩니다.

---

### 방법 B. 내 PC (Windows / Mac)에서 직접 명령어로 APK 빌드하기

1. **사전 준비 프로그램 설치**
   - **Node.js 20 이상**: https://nodejs.org/
   - **Java JDK 21 (Temurin 권장)**: https://adoptium.net/
   - **Android Studio (Android SDK 포함)**: https://developer.android.com/studio
2. **터미널(명령 프롬프트 / PowerShell)에서 빌드 실행**
   ```bash
   # 1) 의존성 패키지 설치
   npm install

   # 2) 웹 파일 복사 + 안드로이드 프로젝트 생성 + 네이티브 오버레이(FloatingOverlayManager.java) 자동 주입
   npm run android:init

   # 3) APK 파일 빌드 (Mac / Linux)
   cd android && ./gradlew assembleDebug

   # 3-참고) Windows PowerShell / CMD인 경우:
   cd android
   .\gradlew assembleDebug
   ```
3. **생성된 APK 파일 위치 확인**
   - 빌드가 끝나면 아래 경로에 APK 파일이 생성됩니다:
     `android/app/build/outputs/apk/debug/app-debug.apk`
