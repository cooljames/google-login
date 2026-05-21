# 🚀 JamesBoard — 소셜 로그인 커뮤니티 플랫폼

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**구글 · 네이버 · 카카오 소셜 로그인 및 JWT 인증을 지원하는 풀스택 커뮤니티 게시판**

[라이브 데모](#) · [버그 리포트](../../issues) · [기능 제안](../../issues)

</div>

---

## 📋 목차

- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [아키텍처](#-아키텍처)
- [폴더 구조](#-폴더-구조)
- [시작하기](#-시작하기)
- [환경 변수](#-환경-변수)
- [API 엔드포인트](#-api-엔드포인트)
- [배포 가이드](#-배포-가이드-vercel)
- [기여 방법](#-기여-방법)
- [라이선스](#-라이선스)

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🔐 **소셜 로그인** | Google · Naver · Kakao OAuth 2.0 팝업 인증 |
| 📧 **이메일 로그인** | 이메일/비밀번호 회원가입 및 로그인 |
| 🔑 **JWT 인증** | HttpOnly 쿠키 기반 세션 관리 (7일 유효) |
| 📝 **커뮤니티 게시판** | 글 작성 · 수정 · 삭제 · 조회수 · 페이지네이션 |
| 📎 **파일 첨부** | Vercel Blob을 이용한 첨부파일 업로드/삭제 연동 |
| 👤 **프로필 관리** | 이름 · 프로필 사진 수정 |
| 🛡️ **관리자 패널** | 사용자·게시글 통계, 일괄 삭제, 권한 관리 |
| 📱 **반응형 UI** | 모바일/데스크톱 완전 대응 |

---

## 🛠 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| React | 19 | UI 프레임워크 |
| React Router DOM | 7 | 클라이언트 사이드 라우팅 |
| Tailwind CSS | 4 | 스타일링 |
| Vite | 6 | 번들러 / 개발 서버 |
| TypeScript | 5.8 | 정적 타입 |

### Backend
| 기술 | 버전 | 용도 |
|------|------|------|
| Express.js | 4 | API 서버 |
| tsx | 4 | TypeScript 런타임 (개발) |
| jsonwebtoken | 9 | JWT 발급/검증 |
| bcryptjs | 3 | 비밀번호 해싱 |
| multer | 2 | 파일 업로드 파싱 |
| nodemailer | 8 | 이메일 전송 |

### 인프라
| 기술 | 용도 |
|------|------|
| Neon PostgreSQL | 서버리스 데이터베이스 |
| Vercel Blob | 파일 스토리지 |
| Vercel | 호스팅 (서버리스 함수 + CDN) |

---

## 🏗 아키텍처

```mermaid
graph TB
    subgraph Client["클라이언트 (React SPA)"]
        A[Auth 페이지] --> AC[AuthContext]
        B[Board 페이지] --> AC
        C[Admin 패널] --> AC
        D[Profile 페이지] --> AC
        AC --> API[api.ts fetch wrapper]
    end

    subgraph Server["서버 (Express on Vercel)"]
        API -->|HTTP / Cookie| E[Express Router]
        E --> F[requireAuth 미들웨어]
        F --> G[JWT 검증]
        G --> H[PostgreSQL Pool]
        E --> I[OAuth Callback Handler]
        I --> J[Google / Naver / Kakao API]
        E --> K[Vercel Blob]
    end

    subgraph DB["데이터베이스 (Neon PostgreSQL)"]
        H --> L[(users)]
        H --> M[(posts)]
    end

    subgraph OAuth["OAuth 제공자"]
        J --> N[Google]
        J --> O[Naver]
        J --> P[Kakao]
    end
```

### 인증 흐름

```
[사용자] → SNS 버튼 클릭
    → 팝업 창 오픈 → OAuth 제공자 인증
    → /auth/callback 수신 (백엔드)
    → JWT 발급 → HttpOnly 쿠키 저장
    → postMessage로 부모 창에 알림
    → AuthContext에서 /api/me 호출 → 로그인 완료
```

---

## 📁 폴더 구조

```
google-login/
├── src/                        # 프론트엔드 소스
│   ├── components/
│   │   ├── AuthContext.tsx      # 전역 인증 상태 관리 (Context)
│   │   └── Layout.tsx          # 공통 레이아웃 (헤더/푸터)
│   ├── pages/
│   │   ├── Landing.tsx         # 랜딩 페이지
│   │   ├── Auth.tsx            # 로그인 / 회원가입
│   │   ├── Board.tsx           # 게시판 목록
│   │   ├── PostDetail.tsx      # 게시글 상세
│   │   ├── PostEditor.tsx      # 게시글 작성/수정
│   │   ├── Admin.tsx           # 관리자 패널
│   │   └── Profile.tsx         # 프로필 관리
│   ├── lib/
│   │   ├── api.ts              # fetch 래퍼 (토큰 자동 첨부)
│   │   └── utils.ts            # 공통 유틸 함수
│   ├── App.tsx                 # 라우터 설정
│   ├── main.tsx                # 앱 진입점
│   └── index.css               # 글로벌 스타일 (Tailwind)
├── server.ts                   # Express 백엔드 (단일 파일)
├── vercel.json                 # Vercel 배포 설정 (리라이트 규칙)
├── vite.config.ts              # Vite 설정
├── tsconfig.json               # TypeScript 설정
├── .env.example                # 환경 변수 예시
└── package.json
```

---

## 🚀 시작하기

### 사전 요구사항

- **Node.js** 18 이상
- **npm** 또는 **yarn**
- [Neon](https://neon.tech) PostgreSQL 데이터베이스 (무료 플랜 가능)
- Google / Naver / Kakao OAuth 앱 등록 (선택)

### 1. 저장소 클론

```bash
git clone https://github.com/cooljames/google-login.git
cd google-login
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 아래 항목을 채웁니다 ([환경 변수 섹션](#-환경-변수) 참고).

### 4. 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 으로 접속합니다.

> **💡 팁:** Naver/Kakao OAuth 키가 없어도 Mock 로그인(샌드박스 모드)으로 테스트할 수 있습니다.

---

## 🔑 환경 변수

`.env.example`을 복사하여 `.env` 파일을 생성하고 아래 항목을 설정하세요.

```env
# Gemini API (AI Studio 자동 주입)
GEMINI_API_KEY="your_gemini_api_key"

# 앱 URL (로컬: http://localhost:3000)
APP_URL="http://localhost:3000"

# Google OAuth
# https://console.cloud.google.com → API 및 서비스 → 사용자 인증 정보
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Naver OAuth
# https://developers.naver.com/apps
NAVER_CLIENT_ID=""
NAVER_CLIENT_SECRET=""

# Kakao OAuth
# https://developers.kakao.com/console/app
KAKAO_CLIENT_ID=""
KAKAO_CLIENT_SECRET=""

# JWT 서명 키 (프로덕션에서는 반드시 강력한 랜덤 값으로 변경)
JWT_SECRET="DEV_SECRET_KEY_CHANGE_IN_PROD"

# Neon PostgreSQL 연결 문자열
# https://console.neon.tech
DATABASE_URL="postgres://user:password@endpoint.neon.tech/dbname?sslmode=require"

# Vercel Blob 토큰
# https://vercel.com/dashboard → Storage → Blob
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_TOKEN"
```

### OAuth 리다이렉트 URI 설정

각 OAuth 앱에서 아래 URI를 **승인된 리다이렉트 URI**로 등록하세요.

| 환경 | URI |
|------|-----|
| 로컬 | `http://localhost:3000/auth/callback` |
| 프로덕션 | `https://your-domain.vercel.app/auth/callback` |

---

## 📡 API 엔드포인트

### 인증

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|----------|
| `POST` | `/api/auth/register` | 이메일 회원가입 | ❌ |
| `POST` | `/api/auth/login` | 이메일 로그인 | ❌ |
| `GET` | `/api/auth/url?provider=google` | OAuth URL 생성 (`google`\|`naver`\|`kakao`) | ❌ |
| `GET` | `/auth/callback` | OAuth 콜백 처리 | ❌ |
| `GET` | `/api/me` | 현재 로그인 사용자 조회 | ✅ |
| `PUT` | `/api/me` | 프로필 수정 (이름, 사진) | ✅ |
| `POST` | `/api/logout` | 로그아웃 | ❌ |

### 게시판

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|----------|
| `GET` | `/api/posts?page=1&limit=10` | 게시글 목록 (페이지네이션) | ❌ |
| `GET` | `/api/posts/:id` | 게시글 상세 (조회수 증가) | ❌ |
| `POST` | `/api/posts` | 게시글 작성 (파일 첨부 가능) | ✅ |
| `PUT` | `/api/posts/:id` | 게시글 수정 | ✅ |
| `DELETE` | `/api/posts/:id` | 게시글 삭제 (Blob 파일 자동 삭제) | ✅ |

### 관리자

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| `GET` | `/api/admin/stats` | 통계 (사용자·게시글 수) | 관리자 |
| `GET` | `/api/admin/users` | 전체 사용자 목록 | 관리자 |
| `PUT` | `/api/admin/users/:id/role` | 사용자 권한 변경 | 관리자 |
| `DELETE` | `/api/admin/posts/bulk` | 게시글 일괄 삭제 | 관리자 |
| `DELETE` | `/api/admin/users/:id` | 사용자 삭제 | 관리자 |
| `DELETE` | `/api/admin/users/bulk` | 사용자 일괄 삭제 | 관리자 |

---

## ☁️ 배포 가이드 (Vercel)

### 1. Vercel 프로젝트 연결

```bash
npm i -g vercel
vercel
```

또는 GitHub 저장소를 [Vercel 대시보드](https://vercel.com/new)에서 Import합니다.

### 2. 환경 변수 등록

Vercel 대시보드 → **Settings → Environment Variables** 에서 `.env`의 모든 항목을 등록합니다.

> ⚠️ `APP_URL`은 실제 Vercel 배포 URL로 변경하세요.  
> ⚠️ `JWT_SECRET`은 반드시 강력한 랜덤 문자열로 변경하세요.

### 3. 빌드 설정

`vercel.json`이 이미 포함되어 있어 별도 설정 없이 배포됩니다.

| 설정 | 값 |
|------|-----|
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### 4. 데이터베이스 마이그레이션

로컬 첫 실행 시 `initDb()`가 자동으로 테이블을 생성합니다.  
Vercel 환경에서는 최초 배포 후 Neon 콘솔에서 직접 실행하거나, 로컬에서 `DATABASE_URL`을 프로덕션 URL로 설정 후 한 번 실행하면 됩니다.

---

## 🤝 기여 방법

버그 수정, 기능 제안, 문서 개선 모두 환영합니다!

### 1. 이슈 먼저

기능 추가나 변경 전에 [이슈](../../issues)를 먼저 등록하여 논의합니다.

### 2. 포크 & 브랜치

```bash
git checkout -b feat/your-feature-name
# 또는
git checkout -b fix/your-bug-name
```

### 3. 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/ko/) 형식을 따릅니다.

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 스타일 변경 (로직 변경 없음)
refactor: 리팩토링
chore: 빌드, 설정 변경
```

### 4. PR 제출

- `main` 브랜치로 Pull Request를 올립니다.
- PR 설명에 변경 사항과 테스트 방법을 명시합니다.
- 스크린샷이 있으면 첨부해주세요.

---

## 📄 라이선스

[MIT License](LICENSE) © 2025 CoolJames

---

<div align="center">

**⭐ 이 프로젝트가 도움이 됐다면 Star를 눌러주세요!**

Made with ❤️ using React + Express + Neon + Vercel

</div>
