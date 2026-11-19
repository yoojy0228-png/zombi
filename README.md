# 망자의 밤 — Render 배포 방법

이 폴더는 그대로 Render 정적 사이트(Static Site)로 배포할 수 있습니다. 서버나 빌드는 필요 없습니다.

```
render.yaml        Render 설정 (Blueprint 방식으로 배포할 때 사용)
public/index.html  게임 전체 (코드 + 좀비 모델이 한 파일에 들어 있음)
```

## 1. GitHub에 올리기
1. github.com 에서 새 저장소(Repository)를 만듭니다. (예: dead-night)
2. 이 폴더 안의 파일을 저장소에 올립니다. `public` 폴더와 `render.yaml`이 저장소 맨 위(루트)에 있어야 합니다.
   (웹 화면의 "Add file → Upload files"에 폴더째 끌어다 놓으면 됩니다.)

## 2. Render에서 배포하기
방법 A (간단, 대시보드):
1. dashboard.render.com → New → **Static Site**
2. GitHub 저장소를 연결하고 방금 만든 저장소를 선택
3. 설정값
   - Build Command: 비워두거나 `echo ok`
   - Publish Directory: `public`
4. Create Static Site → 잠시 뒤 `https://이름.onrender.com` 주소가 생깁니다.

방법 B (render.yaml 사용):
1. New → **Blueprint** → 저장소 선택 → Apply

## 참고
- 정적 사이트라 슬립(콜드 스타트) 없이 바로 열립니다.
- 3D 엔진(three.js)과 폰트는 인터넷(CDN)에서 불러오므로 접속하는 사람의 인터넷 연결이 필요합니다.
- 배포된 주소는 일반 웹페이지라서 클릭하면 마우스 시점 고정이 정상적으로 걸립니다. (`Esc`로 해제/일시정지)
- 게임을 고치면 저장소의 `public/index.html`만 새 파일로 바꿔서 올리면 자동으로 다시 배포됩니다.
