# 시드 개념 후보 (Notion 복습 문서, 2026-10-16)

시드 YAML을 만들기 위한 입력이다. 시드는 2026-10-16에 확정했다(`src/core/knowledge/seed/`, 256개). 근거가 약한 하위 개념은 상위 개념의 별칭으로 합쳤고, 취업·면접 개념은 서술형을 만들 때 넣기로 해 비워 두었다. 그래서 이 파일은 취업·면접 절과 실수 기록(★)을 서술형 설계와 3단계 출제 우선순위에 쓸 때까지 남긴다.

- **출처:** Notion `복습` 아래 문서. GIS 프로젝트 복습 문서 145개(섹션 9개), 서버 개발 & Spring 필독서 7편, git 이력 관리, 고객수 사전집계, 프런트엔드 면접 109제(질문 제목만), TanStack Query 메모.
- **추출 방법:** 서브에이전트 6개가 섹션을 나눠 모두 읽고 개념을 뽑았다. 회사·업무 용어는 빼고 그 밑의 일반 기술 개념만 남긴 뒤 중복을 합쳤다. 트랙은 [ADR-0021](../adr/0021-tracks-and-decision-cases.md)의 다섯 트랙으로 나눴다.
- **표기:** `상위 개념: 하위 개념 · 하위 개념 …`
  - ★ 문서에 실제로 틀렸거나 헷갈렸거나 사고가 난 기록이 있음. 퀴즈를 낼 때 우선 대상이다.
  - (n) 대략적인 근거 문서 수. 5 이상만 적었다.
- **규모:** 상위 개념 약 100개, 하위 개념까지 약 400개.

## CS 기초 (원리)

- **네트워크:** 공인·사설 IP · NAT·포트포워딩·헤어핀 · 라우팅 테이블 · 서브넷·CIDR · DNS 이름 해석과 레코드 · 연결 실패 단계별 해석(refused / timeout / auth)
- **HTTP (10+):** 상태 코드 의미(401/403/404/409/5xx, 502 vs 500) · Host 헤더와 가상호스트 · 콘텐츠 협상·압축 헤더(Accept-Encoding, Vary) · Content-Type·MIME★ · HTTP 캐시(Cache-Control, ETag·304, URL 버저닝)★ · REST · HTTP/1.1 vs 2 · 실시간 통신(WebSocket·SSE·폴링) · TTFB vs 다운로드 · 전송 크기 vs 파싱 비용★ · 브라우저 통신 과정
- **TLS 원리:** 핸드셰이크·버전 협상★ · SNI · 서명 알고리즘과 폐기(SHA-1) · 인증서 체인과 CA
- **OS:** 권한 비트·소유권 · 프로세스의 그룹 소속은 시작할 때 고정됨★ · 유닉스 도메인 소켓 vs TCP · SSH 공개키 인증 원리
- **DB 이론:** 트랜잭션 ACID · 격리 수준·MVCC · 락과 대기 · 트랜잭션 DDL · NULL 3값 논리★ · null(모름) vs 0(없음)★ · 정규화·함수 종속(파생값은 저장하지 않기)★ · 데이터 그레인★ · 조인 fan-out★
- **인덱스 원리 (6):** B-tree vs GiST(R-tree) · 선택도와 Seq vs Index Scan · 인덱스를 못 타는 조건(sargability)★ · BRIN과 물리 정렬 상관 · 데이터 지역성과 I/O
- **동시성 제어:** 확인 후 실행 경쟁(check-then-act)★ · 낙관적·비관적 잠금
- **계산 기하 (10+):** 점-다각형 포함 판정(ray casting) · bbox 사전 거절 · 보로노이와 "최근접 중심 = 포함 셀"★ · 공간 인덱스 · 좌표계와 투영(위경도 거리 왜곡)★ · Haversine★
- **수치 표현:** 부동소수점·Float32 유효숫자 · 반올림의 비가역성★ · 반올림 규약(banker's rounding)★
- **통계 기초 (5):** 집계의 가산성 · 중간값(짝수 표본, 부분 중간값의 합 ≠ 전체 중간값)★ · 비율 지표의 분자·분모 정합★ · 코호트(비교군) 설계 · 정밀도·재현율 · 최빈값 vs 평균
- **압축:** DEFLATE(LZ77+Huffman) vs brotli★
- **GPU 파이프라인:** readback 동기 스톨★ · instancing과 컬링 시점★ · 폴리곤 테셀레이션
- **기타:** Base64·문자 인코딩 · 성능 비용 모델(빈도 × 단가) · 구간 분류와 경계 조건

## 백엔드 (애플리케이션)

- **Spring 핵심 (7):** IoC 컨테이너와 빈 생명주기 · DI·생성자 주입·빈 후보 선택 · 빈 스코프 · DIP와 포트·어댑터 · AOP · AOP 프록시(JDK vs CGLIB) · 프록시 자기 호출 함정★ (5개 묶음에서 반복)
- **트랜잭션 (7):** @Transactional · 롤백 규칙 · 전파 · readOnly와 메서드 덮어쓰기★ · 트랜잭션 범위와 커넥션 고갈 · 다중 쓰기의 원자성·애그리거트 경계 · TransactionTemplate과 검산 롤백 · 테스트의 @Transactional 함정★
- **JPA·Hibernate (10+):** 영속성 컨텍스트 · 더티 체킹·준영속★ · 지연 로딩 · N+1 · 엔티티 vs DTO · JPQL·QueryDSL(텍스트 블록 공백★) · Persistable·할당형 PK · BigDecimal 무지정 = numeric(38,2)★ · 외부 소유 테이블은 JdbcTemplate · ddl-auto=update의 한계★ (6개 묶음, 사고 여러 건)
- **Spring MVC:** DispatcherServlet 흐름 · 파라미터 바인딩 · 검증·전역 예외·예외 번역 · 필터 vs 인터셉터 vs AOP · 계층형 아키텍처 · 요청당 스레드 모델 · Jackson 네이밍 전략★ · springdoc 스펙 vs 실제 응답 불일치★
- **Spring 설정:** 프로파일·외부 설정 · @Profile vs 런타임 능력 탐지★ · 다중 DataSource(defaultCandidate=false) · ApplicationRunner·ReadyEvent·@Async · @Scheduled · Actuator health vs readiness★ · ThreadLocal 정리
- **인증·인가 (5):** 401 vs 403 · Security 필터 체인 · 요청 매처 순서(first match)★ · 메서드 보안 · 세션 vs JWT · JWT 구조 · 세션 고정 방지 · 비밀번호 해싱 · CORS와 allowCredentials · 객체 단위 권한(IDOR) · 프론트 가드는 UX일 뿐
- **서버 캐시 (10+):** @Cacheable·@CacheEvict · Caffeine 매니저 동적/비동적★ · TTL vs 스케줄 evict&warm★ · 변경 감지 폴링(제자리 UPDATE 사각지대★, 자가 치유) · 캐시 스탬피드(sync=true)★ · 인메모리 스냅샷 캐시 · 커밋 전 evict 경쟁★ · 브라우저 캐시 vs 서버 캐시★
- **커넥션 풀:** HikariCP 고갈과 connection-timeout★
- **Java:** 박싱 타입 캐스팅★ · 정적 초기화 실패 연쇄★ · DateTimeFormatter STRICT·uuuu★ · 스레드 안전하지 않은 객체 재사용 · 타임존 명시(ZoneId)★ · 방어선 위치(parse-or-null)★
- **PostgreSQL 사용 (10+):** 실행계획 EXPLAIN · 복합 인덱스 선두 컬럼 · 부분 인덱스·부분 유니크★ · 식 인덱스 · LATERAL JOIN · 윈도 함수로 최신 행 · 조건부 집계 FILTER · COUNT DISTINCT 정렬 vs 해시 · NULL 안전 비교(IS DISTINCT FROM) · 문자열 날짜 비교·패딩 키 조인★ · UPSERT와 최초값 보존 · FK·UNIQUE 쓰기 순서 · 골격 CROSS JOIN + LEFT · 페이지를 먼저 자르고 조인 · unnest 배치 조회
- **스키마 마이그레이션 (7):** 확장-축소(expand-contract) · 배포 순서(추가는 배포 전, 삭제는 배포 후)★ · 제약 추가 전 검증 · Flyway·Liquibase · 리네임과 종속 객체 이름★ · PL/pgSQL 마이그레이션 기법 · 운영 데이터 런북·리허설
- **PostGIS (8):** ST_Covers vs ST_Contains★ · ST_DWithin · ST_Intersects · Union·Difference · ST_MakeValid · KNN·LATERAL 최근접★ · bbox 프리필터(&&) · SRID와 ST_Transform★ · GeoJSON·WKT · 육각 격자 · ST_AsMVT vs 정적 타일
- **데이터 모델링 (15):** 이력(리비전) 테이블·SCD2★ · EAV와 피벗 · enum 상태 모델링(boolean 대신) · 오버레이 패턴 · 단일 진실 공급원과 파생 뷰★ · 알고리즘을 바꾸면 저장값도 재계산★ · 값의 단위 계약★ · 손실 있는 상태 매핑★ · 허용 목록 vs 제외 목록★ · 다형 참조와 FK
- **데이터 통합·배치 (15+):** 사전집계·데이터 마트(계층과 소유권)★ · 교차 DB 앱 병합과 매치율★ · 모수 정의와 필터 위치★ · 데이터 품질(센티넬 값)★ · 이관 전 기간 커버리지★ · 늦게 도착하는 데이터 · 전량 교체 vs diff·원자적 교체 · 멱등성 · 증분 계산★ · 스냅샷 diff 변경 감지·기준선·워터마크 · 레코드 매칭★ · 회차 스냅샷과 재현 가능한 시간 창★ · 연속 실패 한도★ · 파괴 작업 전 사전 검증 · 부분 실패 격리·fail-soft · 누적 집계★ · 모수·시점 정합성★ · 측정 대상 검증★
- **API 설계 (7):** 안정 식별자 vs 표시 라벨★ · 하위 호환과 배포 스큐 · 슬림 목록 + 상세 분리 · 전량 vs bbox·페이지 · 서버 집계로 책임 이동 · 한 쿼리를 공유해 숫자 정합 · N+1 요청 회피 · 멱등 PUT·ensure 연산 · 엔드포인트 통합·분리 판단 · 측정 먼저(Server-Timing)
- **서비스 설계 (6):** 서비스 의존 방향과 단일 진입점 · 여러 경로의 자격 기준 일치★ · 삭제 리팩터링 · 재사용 함수의 숨은 전제★ · 조용한 실패 탐지★
- **파일 업로드:** multipart 상한 · 오브젝트 스토리지와 메타 분리·고아 객체★ · 프리사인드 URL vs 프록시 서빙 · 클라우드 SDK 자격증명 체인
- **테스트 (7):** Testcontainers 실 DB · mock이 못 잡는 SQL 오류★ · 슬라이스 테스트 · SQL 문자열 계약 테스트 · 독립 오라클·RED 먼저★ · 순수 로직 분리 · 불변식·술어 고정 · 테스트 더블
- **git:** merge vs rebase vs cherry-pick★ · revert로 빼고 병합 · MERGE_HEAD★ · worktree · 공유 이력 재작성 금지★ · pull.rebase·fast-forward 판정★ · abort와 복구 지점 · 충돌 해결 원칙

## 프론트 심화 (지금 쓰는 스택)

- **JS 언어 (10):** 원시·참조, == vs === · 얕은·깊은 복사 · 프로토타입·클래스 · 스프레드·레스트 · 불변성 · 참조 동일성 vs 값 동등★ (8개 문서) · WeakMap · getter의 숨은 비용★ · 센티넬 값 설계★ · NaN·nullish 함정★ · 디바운스·스로틀(trailing, 실행 중 가드)★ · 타임존 안전 시간 계산 · ESM vs CJS
- **실행 컨텍스트:** 호이스팅·TDZ · 스코프 체인 · 클로저 · this와 화살표 함수
- **실행 모델:** 이벤트 루프·마이크로태스크 · queueMicrotask와 재진입 회피 · 비동기 패턴
- **TypeScript (7):** interface vs type · as const 리터럴 유니온·타입 가드 · 판별 유니온★ · satisfies vs 타입 주석★ · 교차 타입으로 계약 고정 · 신뢰 경계의 런타임 정규화(as T는 검증이 아님)★ · OpenAPI 타입 생성★ · DTO → 뷰모델 어댑터·단위 정규화★
- **React (6+):** 가상 DOM·재조정 · key · 훅·커스텀 훅 · useEffect 의존성과 참조 동일성★ · effect로 상태를 동기화하는 함정★ · 조건부 렌더의 falsy 0★ · useMemo 메모 경계★ · React Compiler의 한계 · memo·useCallback · 구독 위치와 리렌더 경계 · latest-ref 패턴★ · HMR에서 살아남는 상태★ · 낡은 스냅샷 읽기★ · UI 숨김과 상태 리셋의 짝★ · Context · 동시성 기능 · 에러 바운더리 · 가상 스크롤
- **jotai (9):** atom·파생 atom · atomWithStorage 스키마 진화★ · 파사드 훅·쓰기 atom · 쓰기 단일 창구 · 판정 단일 출처 · 상호배타 코디네이터★
- **XState (7):** 상태기계를 쓸 기준(값 vs 절차) · 전이표와 불가능한 상태 제거 · exit → 전이 → entry 순서★ (같은 실수 2번) · 정의 안 된 이벤트·값 가드★ · always 전이 · actor 생명주기 · emit·output·sendParent · 머신에 의존성 주입 · 지연 이벤트 디바운스
- **TanStack Query (10+):** Query·Observer·Cache 계층 · queryKey 설계·dedup★ · staleTime vs gcTime(함수형 staleTime)★ · placeholderData·keepPreviousData(useQueries에서 죽는 이유)★ · invalidate vs setQueryData·refetchType(none 의미 메모 미해결)★ · enabled 게이팅 · prefetchQuery는 enabled를 무시★ · AbortSignal 취소 · useSuspenseQueries와 워터폴 · v5 onError 이중 발화★ · 한 화면 값은 한 쿼리로(원자성)
- **브라우저 렌더링·성능 (10):** 렌더링 파이프라인 · INP와 롱태스크★ · 태스크 분포(총량 vs 최장) · rAF·requestIdleCallback★ · Performance 트레이스 분석★ · DPR과 canvas 버퍼★ · Core Web Vitals · 로딩 최적화 · rAF 루프의 예외★ · 이벤트 전파·위임 · contextmenu 소비 체인
- **deck.gl·WebGL (16):** 레이어 diff·data 참조 · accessor·updateTriggers★ · attribute vs uniform · visible 토글 vs 조건부 조립 · 자주 바뀌는 축을 오버레이로 · 레이어 인스턴스 재사용 금지★ · GPU 컬러 피킹·info.object 계약★ · hover leave 정규화★ · IconLayer 그리기 순서★ · binary attributes★ · MVT 타일 로딩★ · pointer-events:none·이벤트 포워딩★
- **웹 지도 렌더링 전략 (7):** DOM·Canvas·WebGL 선택★ · 정적 형상 + 동적 속성 · 뷰포트 조회와 격자 스냅★ · 부분 집합 대조의 모수 불일치★ · 줌 기반 비용 게이팅 · columnar JSON★
- **CSS (5):** 캐스케이드·명시도·!important★ · @media print·@page★ · truncate 조건·fit-content★ · flex min-width:auto · flex 높이 계약(h-0 flex-1) · 박스 모델·display · Flex vs Grid · 쌓임 맥락 · 반응형 · 애니메이션 · 방법론(BEM·Sass)
- **HTML:** 문서 구조 · 시맨틱·접근성 · 반응형 이미지
- **웹 플랫폼:** Web Storage 수명·실패 모드 · 파비콘 로딩★ · 이미지 축소·multipart · same-origin 프록시·rewrite★ · 빌드 타임 기능 플래그 · 인증 오류 분류·mock 폴백★
- **빌드:** 번들러 · Vite proxy·changeOrigin★ · Vite 콘텐츠 해시 · ESM vs CJS
- **웹 보안 (5):** SOP·CORS · CSRF · XSS · 쿠키 속성·토큰 저장 위치 · 클라이언트 비밀 관리
- **프론트 아키텍처 (7):** 규칙을 순수 함수로 · 폴더 의존 방향·순환 제거★ · 계층 경계(shared → features)
- **프론트 에러 처리 (6):** 조용한 실패 드러내기★ · 실패 사유를 반환값으로★
- **프론트 테스트:** 오라클 독립성★ · 테스트 더블 충실도★ · Vitest 환경(jsdom, vi.hoisted) · 회귀 테스트가 실제로 실패하는지 확인
- **우선순위 낮음 (면접 109제에만 나오고 지금 쓰는 스택 밖):** CSR·SSR·SSG·하이드레이션 · Next.js·RSC · 마이크로 프론트엔드 · 웹뷰 브리지 · LLM 프론트 통합(스트리밍, Abort, 출력 검증, 토큰 비용) · react-aria 내부 분석

## IT 인프라 (구성·운영·진단)

- **네트워크 운영 (8):** 방화벽 방향·포트 규칙 · VPN 연결과 라우팅 진단★ · NAT 헤어핀·비대칭 라우팅 진단★ · 패킷 캡처로 도달 여부 판정 · 망 분리 배포 구성(외부 공개 프런트, 내부망 백엔드)
- **DNS·인증서 운영 (7):** split-horizon DNS·리바인딩 보호★ · 도메인 이전 순서(DNS → 인증서 → HSTS)★ · 자체 서명 인증서 · ACME HTTP-01 vs DNS-01★ · HSTS · JDK TLS 보안 프로퍼티와 적용 시점★
- **리눅스 운영:** 권한 오류 진단(실행 계정 vs 소유자)★ · docker 그룹과 소켓 권한★ · systemd 유닛과 설치 형태(snap/apt)★ · SSH 키 파일 요건과 키 배포★ (사고 3번)
- **Docker (11):** 컨테이너 안의 localhost★ · 브리지 게이트웨이·host.docker.internal★ · 서비스 이름 DNS · compose depends_on·--no-deps★ · 태그 vs 이미지 ID(롤백 재료) · 바인드 마운트와 실행 계정 경로★ · Dockerfile 레이어 순서★ · init 스크립트와 pg_isready 레이스★
- **nginx (5):** 리버스 프록시·upstream · 지시어 상속과 add_header 예외★ · 엣지 gzip(gzip_types, gzip_proxied)★ · gzip_static 사전압축★ · 버전 URL + immutable 캐시
- **CI/CD (8):** GitHub Actions vs GitLab CI 실행 모델 · parent-child·include·flat 구성★ · rules·workflow:rules·changes 함정★ · Runner·executor·tags★ · resource_group·interruptible · 변수·시크릿(File 타입, Protected) · 빌드 타임 설정 주입★ · 예약 파이프라인·종료 코드 규약 · 배포 헬스체크·자동 롤백★ · 빌드/실행 분리 SSH-Push 배포
- **패키지 매니저:** corepack · packageManager 필드와 자동 버전 전환★ · pnpm 빌드 스크립트 승인
- **PostgreSQL 운영 (5):** 인증 방식(peer·scram·pg_hba)★ · listen_addresses · pg_dump/pg_restore★ · 환경별 설정 drift★

## 취업·면접 (설명 능력, 서술형과 함께 다시 켬)

- **기술 의사결정 설명 (15+):** 트레이드오프·대안 비교 · 안 쓴 기술과 YAGNI 설명 · 되돌린 결정 설명★ · 도입한 기술의 대가 · 결정 기록(ADR)·번복 사유 · 리팩터링 범위와 부채 기록
- **문제 해결 서술 (10+):** 장애 회고·근본 원인 분석 · 가설-증거 기반 디버깅 · 근본 원인 수정 vs 땜질 · 성능 개선을 수치로 검증해 설명 · STAR 서술
- **소통:** 지표 정의 변경과 이해관계자 공지 · 기술 발표 · git 협업 전략 설명

이 트랙의 판단 원칙(null vs 0, 배포 순서, 조용한 실패 등)은 기술 트랙 개념으로 옮겼고, 상황 판단형 객관식으로 묻는다(ADR-0021).

## 실수가 여러 문서에서 반복된 개념 (출제 1순위)

1. ddl-auto=update의 한계와 마이그레이션 배포 순서: 409 오류, 빈 테이블 생성, NOT NULL 컬럼 추가 실패, 리네임 사고
2. Spring 프록시 자기 호출: 캐시·트랜잭션·보안이 조용히 꺼짐
3. 좌표계 왜곡, ST_Covers vs Contains, 보로노이 성립 조건: 2.5% 오배정, 잘못 칠한 칸 46건
4. null vs 0, 값의 단위 계약(월·연, %·분수), 모수·시점 정합성: 12배·380%·790%, 음수가 될 수 없는 값의 음수
5. 참조 동일성: memo·effect·deck.gl·XState 가드 무력화
6. 캐시 신선도: 근거 없는 TTL을 넣고 뺌, evict 경쟁, 캐시 이름 미등록 500
7. 조용한 실패와 mock의 한계: SQL 오류가 운영에서야 드러남
8. XState exit 순서(같은 실수 2번), satisfies
9. 인프라 진단: peer 인증 오추론, 컨테이너 localhost, DNS 문제를 인증서 문제로 오진, SSH 키 사고 3번

## 참고

- Notion에서 읽음 표시가 꺼진(아직 복습하지 않은) 문서가 17개쯤 있다. 출제 우선순위를 올릴 후보다.
- 면접 109제는 숙련도 칸이 모두 비어 있어 약점 신호가 없다.
- GIS 복습 문서는 거의 모두 5지선다 퀴즈와 오답 해설을 담고 있다. 판단 사례를 추출할 때와 3단계 출제의 기준 자료로 쓸 수 있다.
