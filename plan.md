# 프로젝트 구현 계획: 구글 로그인 게시판 (SQLite 기반)

## 1. 개요
현재 서버 메모리(MOCK_USERS, MOCK_POSTS)로 작동 중인 '구글 로그인 게시판' 앱을 **SQLite 데이터베이스** 기반 풀스택 구조로 전환하여 데이터를 영구적으로 보존하고, 게시판 CRUD 및 관리자(Admin) 기능을 실제 작동하도록 구현합니다.

## 2. 기술 스택 (Option B: SQLite)
- **Frontend**: React, React Router, Tailwind CSS
- **Backend**: Express.js
- **Database**: SQLite3 (`better-sqlite3` 모듈 사용 - 빠르고 동기적인 API 지원)
- **Auth**: Google OAuth 2.0 + JWT 기반 세션

## 3. 데이터베이스 스키마 설계
### 3.1 `users` 테이블
- `id` (TEXT, Primary Key): Google OAuth의 `sub` 고유 ID
- `email` (TEXT, Unique): 사용자 이메일
- `name` (TEXT): 사용자 이름 (수정 가능한 닉네임)
- `picture` (TEXT): 프로필 이미지 URL
- `role` (TEXT): 사용자의 권한 ('user' 또는 'admin', 기본값은 'user')
- `created_at` (DATETIME): 계정 생성일

### 3.2 `posts` 테이블
- `id` (INTEGER, Primary Key, Auto Increment)
- `type` (TEXT): 게시판 카테고리 (예: '공지', '일반', '이벤트')
- `title` (TEXT): 게시글 제목
- `content` (TEXT): 게시글 본문 
- `author_id` (TEXT, Foreign Key): 작성자 ID (`users` 테이블 참조)
- `views` (INTEGER): 게시글 조회수 (기본 0)
- `created_at` (DATETIME): 작성일시
- `updated_at` (DATETIME): 수정일시

## 4. 기능 및 페이지 연결 계획

### 4.1 데이터베이스 초기화 설정 (`server.ts` 또는 분리된 DB 모듈)
- 서버 실행 시 `better-sqlite3`를 통해 `database.db`에 연결하고, 테이블이 없으면 자동 생성(`CREATE TABLE IF NOT EXISTS`)하는 코드 작성.

### 4.2 게시판 (Board) CRUD 및 브레인스토밍
- **Read (목록 및 상세 조회)**:
  - `GET /api/posts`: 페이지네이션, 타입(공지/일반 등) 필터링, 검색을 지원하도록 SQL 쿼리 구성. 작성자 이름 반환을 위해 `users` 테이블과 JOIN.
  - `GET /api/posts/:id`: 게시글 상세 내용을 조회하며, 성공 시 `views`(조회수) 컬럼 증가.
  - 프론트엔드 연결: `Board.tsx` (목록) -> 클릭 시 `PostDetail.tsx` 라우트로 연결.
- **Create (게시글 작성)**:
  - `POST /api/posts`: 권한(로그인) 확인 후 `posts` 테이블에 INSERT.
  - 프론트엔드 연결: "새 글 쓰기" 버튼 -> `PostEditor.tsx` 페이지 또는 모달 창 오픈.
- **Update (수정)**:
  - `PUT /api/posts/:id`: 본인 작성글 또는 'admin' 권한일 경우에만 UPDATE.
- **Delete (삭제)**:
  - `DELETE /api/posts/:id`: 본인 작성글 또는 'admin' 권한일 경우만 DELETE.

### 4.3 관리자 (Admin) 기능
- **관리자 권한 미들웨어**: `requireAdmin` 미들웨어를 만들어, 사용자의 DB `role`이 'admin'인지 체크 후 보호된 API 통과. 최초 접속 자나 지정된 이메일을 admin으로 승격하는 부트스트랩 기능 필요.
- **Dashboard 데이터 API (`GET /api/admin/stats`)**: 총 사용자 수, 최근 등록 게시물 수 등을 COUNT 쿼리로 가져와 대시보드 지표 카드에 채우기.
- **사용자 관리 (`GET /api/admin/users`, `PUT /api/admin/users/:id/role`)**: 가입된 전체 사용자 리스트를 불러오고, 불량 사용자 제재나 운영자(admin) 권한 부여 등의 액션.
- **게시물 관리 (전역권한)**: 관리자 탭에서 모든 글 목록을 열람하고, 부적절한 글은 즉시 삭제/숨김 처리할 수 있도록 기능 구성.
- 프론트엔드 연결: `Admin.tsx` 화면에서 좌측 메뉴 클릭 시 우측 영역이 개요/사용자관리/게시물관리 컴포넌트로 전환되도록 설계.

### 4.4 프로필 (Profile) 수정
- **Update API (`PUT /api/me`)**: 사용자가 화면에서 닉네임을 변경할 때 DB의 `users.name` 컬럼 값을 UPDATE.

## 5. 단계별 개발 절차 (향후 진행)
1. **환경 세팅**: `better-sqlite3` npm 패키지 설치.
2. **DB 연동 & 인증 수정**: `server.ts` 내 MOCK 데이터를 SQLite로 변환하고, OAuth 콜백 처리 시 DB에 유저 정보를 안전하게 UPSERT 하도록 수정.
3. **API 개발**: 게시물 CRUD 컨트롤러 및 서비스, 관리자 통계 조회 API 작성 및 테스트.
4. **React 페이지 연동**: 라우터에 상세 페이지, 작성 페이지 등을 추가하고 실제 `fetch`를 이용해 화면 상태 데이터 연동. 
5. **검토 및 정리**: 관리자 뷰 확인, 퍼블리시 및 디버깅.
