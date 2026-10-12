# C4 레벨 1: 시스템 컨텍스트

growth-assistant와 사용자, 외부 시스템의 관계.

```mermaid
flowchart TB
    user["👤 사용자<br/>(취업 준비 중인 개발자)"]
    ga["growth-assistant<br/>개인 AI 어시스턴트<br/>(튜터 모듈)"]
    discord["Discord<br/>개인 서버"]
    claude["Claude<br/>(구독, claude CLI)<br/>+ 웹 검색"]
    notion["Notion<br/>회고·트러블슈팅 기록"]
    velog["velog<br/>기술 블로그"]

    user -- "대화, 퀴즈 풀이, 명령" --> discord
    discord -- "메시지·버튼·모달 이벤트" --> ga
    ga -- "응답, 복습·주제·리포트 알림" --> discord
    ga -- "대화·출제·채점·추출 요청" --> claude
    ga -- "변경된 페이지 수집" --> notion
    ga -- "변경된 글 수집" --> velog
```

| 요소 | 역할 |
|---|---|
| 사용자 | 유일한 사용자. Discord로만 상호작용한다 |
| Discord | 인터페이스. 슬래시 명령, 버튼, 모달, 스레드를 제공한다 |
| Claude | 생성과 판단(대화, 출제, 서술형 채점, 경험 추출)을 맡는다. 상태는 없다 |
| Notion, velog | 과거 경험의 원천. 읽기만 한다 |
