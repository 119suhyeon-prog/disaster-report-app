# 인터넷 가상 데이터 테스트용 Vercel 배포

내부망 온AI 대신 OpenAI API를 쓰는 별도 시험 구성을 추가했습니다.
실제 사고정보·개인정보를 입력하지 마세요. 메모와 현재 사건의 관련 보고 내용이 OpenAI로 전송됩니다.
기존 내부망 모드는 `AI_PROVIDER=onai`로 유지됩니다. 공급자 간 자동 우회는 하지 않습니다.

## Vercel에서 설정할 값

GitHub의 `119suhyeon-prog/disaster-report-app`를 Import합니다. 프로젝트 루트는 저장소 루트,
Framework Preset은 Other, Node.js는 24.x입니다. 빌드·설치·출력 설정은 `vercel.json`을 따릅니다.

Environment Variables에 다음을 입력하고 배포합니다. Preview에서 시험하려면 Preview 범위에도 설정합니다.

| 이름 | 설정 |
|---|---|
| AI_PROVIDER | `openai` |
| OPENAI_API_KEY | 본인의 API 키. 서버 비밀 설정에만 입력 |
| OPENAI_MODEL | 기본 `gpt-4.1-mini`. 계정에서 사용 가능한 구조화 출력 지원 모델로 변경 가능 |
| OPENAI_TIMEOUT_MS | `45000` |
| TEST_ACCESS_TOKEN | 24자 이상의 예측하기 어려운 테스트 접속 코드 |
| REVIEW_SIGNING_KEY | 접속 코드와 다른 32자 이상의 임의 문자열. 모든 함수에서 같은 값 사용 |

`PUBLIC_APP_URL`은 사용자 지정 도메인을 쓸 때 `https://도메인` 형태로 추가합니다.
Vercel이 제공하는 기본·프로덕션·브랜치 주소는 Vercel 환경변수로 허용합니다.
코드에는 실제 키나 접속 코드를 넣지 않습니다. 로컬 생성 예: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
생성값을 각각 별도로 설정하세요. 이 명령은 API 키를 생성하지 않습니다.

접속자는 앱의 테스트 접속 코드 창에 TEST_ACCESS_TOKEN 값만 입력합니다. OPENAI_API_KEY를 입력하지 않습니다.
API 키는 서버만 사용합니다. 테스트 접속 코드는 현재 탭의 sessionStorage에만 저장됩니다.
화면 정적 파일은 공개될 수 있지만 보고서·AI API는 접속 코드로 보호합니다.
이는 기관 계정 로그인이나 사용자별 권한 체계를 대체하지 않습니다.

## 배포 후 확인

1. `/api/health`에서 `{"ok":true}`인지 확인합니다.
2. 접속 코드를 입력하고 OpenAI 설정 상태를 확인합니다.
3. 가상 메모로 ‘초안에 반영’을 실행합니다. API 계정의 사용 한도·크레딧과 모델 접근이 필요합니다.
4. 필수 항목 팝업과 입력 근거를 확인한 뒤 HWPX를 다운로드합니다.
5. 파일을 한글에서 열어 내용과 배치를 확인합니다.

API 키는 ChatGPT 구독과 별도인 API 계정에서 준비해야 합니다. 실제 호출에는 API 사용료가 발생할 수 있습니다.
`store:false`로 요청하지만 이것이 모든 서비스 측 로그·보존이 없다는 보장은 아닙니다.
따라서 시험 데이터만 사용합니다.

## 실행 구조와 제한

- 화면은 `public/`, 서버 함수는 `api/index.mjs`, HWPX 템플릿은 `templates/report.hwpx`입니다.
- `/api/schema`, `/api/draft`, `/api/export` 요청을 하나의 Node.js 함수로 연결합니다.
- HWPX 처리에 쓰지 않는 OCR·PDF 네이티브 의존성은 배포 설치에서 제외합니다. OCR/PDF 기능은 이 배포본 범위에 포함하지 않습니다.
- 빌드 때 `scripts/check-deployment.mjs`가 HWPX 실제 생성 가능 여부를 검사합니다.
- 함수 실행 제한을 60초로 설정했습니다. 계정별 제공 제한과 빌드 크기는 실제 배포 로그로 확인해야 합니다.
- 작성 내용은 자동 저장되지 않습니다. 새로고침·종료 시 사라집니다.
- 메모리 기반 동시 요청·분당 제한은 함수 인스턴스별입니다. 공개 운영 시 플랫폼 방화벽·별도 분산 제한·사용량 모니터링이 필요합니다.
- 환경변수 변경 후 재배포합니다. 서명키를 바꾸면 기존 초안의 근거는 다시 확인해야 합니다.

## 로컬 인터넷 시험

Node.js 24에서 `npm ci`, `.env.example`을 `.env`로 복사한 뒤 OpenAI 관련 값을 설정하고 `npm start`를 실행합니다.
`npm test`, `npm run check:deploy`로 자동 검증할 수 있습니다.

## 검증 상태

모의 OpenAI 응답으로 요청 형식·오류·응답 검증을 확인할 수 있습니다. 실제 API 키가 없는 상태에서는
실제 OpenAI 변환 품질과 Vercel 운영 환경을 검증했다고 주장하지 않습니다.
Docker·Vercel 같은 런타임이 없어 로컬 클라우드 빌드를 못 한 경우도 별도로 기록합니다.

공식 참고:
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/limitations
