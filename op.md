# 🔧 Operation Plan: Google 로그인 수정 + 코드 리팩터링

> 상태: **대기 중 (승인 후 코딩 시작)**  
> 생성일: 2026-05-16

---

## 🐛 1. Google 로그인 버그 분석

### 핵심 문제: `/auth/callback` 라우트 경로 불일치

#### 문제 상황
```
브라우저 → Google → redirect_uri: https://[domain]/auth/callback
Vercel 라우팅 → /auth/callback → /api/index (✅)
server.ts 내 라우트 등록: app.get('/auth/callback', ...) (✅)
```

라우팅 자체는 맞지만, **콜백 핸들러 내부**에 버그가 존재합니다.

---

### 버그 #1: `redirect_uri` 동적 계산 불일치 (Critical)

**위치:** `server.ts` L352–L375, `/auth/callback` 핸들러

**문제:**
```typescript
// /api/auth/url 에서 redirect_uri를 만들 때
const redirectUri = `${origin}/auth/callback`;  // origin = 프론트엔드 origin

// /auth/callback 콜백에서 fallback redirect_uri 재계산 시
const host = req.headers['x-forwarded-host'] || req.headers.host;
const proto = req.headers['x-forwarded-proto'] || 'http';
const origin = host?.includes('localhost') ? `http://${host}` : `${proto}://${host}`;
redirectUri = `${origin}/auth/callback`;  // ← Vercel에서 host가 API 서버 호스트가 됨
```

**왜 실패하나:**
- Google OAuth에서 `redirect_uri`는 토큰 교환 시 처음 요청과 **완전히 동일**해야 합니다.
- Vercel serverless에서 `req.headers.host`는 API 함수의 내부 호스트가 될 수 있어, state에서 파싱한 `redirectUri`와 달라질 수 있습니다.
- state 파싱 실패 시 fallback이 잘못된 URL을 생성합니다.

---

### 버그 #2: `postMessage` 보안 취약 + 로직 경쟁 조건 (Medium)

**위치:** `server.ts` L425–L447, 콜백 HTML 응답

**문제 코드:**
```javascript
// 서버에서 생성하는 인라인 스크립트
window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${sessionToken}' }, '*');
//                                                                                   ^^
//                                                                    origin이 '*' → 보안 위험
```

**문제점 2가지:**
1. `postMessage(..., '*')` → 모든 origin에 토큰이 노출됩니다. targetOrigin을 명시해야 합니다.
2. 팝업이 `window.opener`를 찾지 못하면 `/board?token=${sessionToken}` 리다이렉트 → URL에 토큰 노출

---

### 버그 #3: `AuthContext.tsx` message 수신 origin 검증 허술 (Medium)

**위치:** `AuthContext.tsx` L73–L76

**문제 코드:**
```typescript
const origin = event.origin;
if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
  return;
}
```

**문제점:**
- `.run.app`으로 끝나는 **모든** 도메인의 메시지를 허용합니다 (오버스코프).
- Vercel 배포 환경에서는 `.vercel.app`도 허용되어야 하는데 빠져 있습니다.
- `window.location.origin`만 허용하면 충분합니다 (콜백 서버 == 앱 서버이므로).

---

### 버그 #4: `/api/auth/url` 과 `/api/auth/google/redirect` 중복 (Low)

**위치:** `server.ts` L285–L350

**문제:**
두 라우트(`/api/auth/url`, `/api/auth/google/redirect`)가 거의 동일한 로직을 수행합니다.
`/api/auth/google/redirect`는 현재 프론트엔드에서 사용되지 않습니다.

---

### 버그 #5: URL에 토큰 노출 (`/board?token=...`)

**위치:** `server.ts` L441

```javascript
window.location.href = '/board?token=${sessionToken}';
```

`AuthContext.tsx`의 `useEffect`에서 URL 파라미터로 토큰을 처리하지만,
JWT가 브라우저 히스토리와 서버 로그에 남습니다.

---

## 🧹 2. 삭제할 불필요한 코드

| 위치 | 코드 | 이유 |
|------|------|------|
| `server.ts` L285–L316 | `GET /api/auth/google/redirect` 전체 라우트 | `/api/auth/url`과 중복, 사용 안 됨 |
| `server.ts` L174–L178 | Request logger 미들웨어 | 프로덕션에 console.log 남김 (디버그용) |
| `server.ts` L191–L193 | `GET /api/test` 라우트 | 개발용 테스트 엔드포인트, 필요 없음 |
| `server.ts` L7 | `import fs from 'fs'` | 코드 어디서도 `fs`를 사용하지 않음 (dead import) |
| `server.ts` L126–L138 | `initDb` 내 admin 역할 자동 갱신 로직 | 하드코딩된 이메일, 보안 위험 |

---

## ✅ 3. 수정 계획 (코딩 내용)

### Phase 1: Google 로그인 버그 수정

#### 1-1. `server.ts` — `/auth/callback` redirect_uri 강화
- State에서 `redirectUri`를 항상 신뢰하도록 변경
- Fallback 시 `APP_URL` 환경변수 사용

#### 1-2. `server.ts` — postMessage targetOrigin 명시
- `'*'` 대신 state에서 추출한 실제 origin 사용
- 콜백 HTML에서 `targetOrigin` 변수를 서버에서 미리 계산 후 삽입

#### 1-3. `server.ts` — URL 토큰 노출 제거
- 쿠키가 이미 설정되었으므로 `/board?token=...` 대신 `/board`로 리다이렉트

#### 1-4. `AuthContext.tsx` — origin 검증 강화
```typescript
// 자기 자신의 origin만 허용
if (event.origin !== window.location.origin) return;
```

### Phase 2: 코드 정리 (Refactoring)

- `import fs` 제거 (dead import)
- `/api/auth/google/redirect` 라우트 제거 (중복)
- `/api/test` 라우트 제거 (개발용)
- Request logger를 `NODE_ENV !== 'production'` 조건부로 변경
- `initDb` 내 하드코딩 admin 이메일 로직 제거

---

## 📁 4. 수정 대상 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `server.ts` | 버그 수정 + 코드 정리 |
| `src/components/AuthContext.tsx` | 버그 수정 (origin 검증) |

---

## ⚠️ 확인 필요 사항 (시작 전 체크)

1. **Vercel 환경변수**: `APP_URL`이 실제 배포 URL로 설정되어 있는지?
   - 현재 `.env`: `APP_URL="http://localhost:3000"` → Vercel 대시보드에 별도 설정 필요
2. **Google Cloud Console**: Authorized redirect URIs에 현재 Vercel 도메인이 등록되어 있는지?
3. **`initDb` admin 이메일 로직**: 제거해도 되는지? (이미 DB에 admin 권한 있다면 불필요)

---

> 승인 시 위 계획대로 코딩을 시작합니다.
