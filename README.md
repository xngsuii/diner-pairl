# Pair Diner — 페어 메뉴판 편집기

여러 캐릭터 페어를 레트로 다이너 메뉴판 한 장으로 정리해 PNG / JPEG / WEBP로 저장하는 정적 웹 앱입니다.
빌드 과정 없이 HTML·CSS·JS만으로 동작하므로 GitHub Pages에 그대로 올리면 됩니다.

## 구조

```
index.html        페이지 뼈대, 구글 폰트 / 라이브러리 로드
css/board.css     메뉴판(이미지로 저장되는 부분) 디자인 ← 폰트·장식 수정은 여기
css/editor.css    오른쪽 편집기 UI
js/app.js         상태 관리, 렌더링, 드래그 정렬, 저장, 이미지 내보내기
```

외부 라이브러리(CDN): [SortableJS](https://github.com/SortableJS/Sortable) (드래그 정렬), [html-to-image](https://github.com/bubkoo/html-to-image) (이미지 저장)

## GitHub Pages 배포

1. 이 폴더 내용을 GitHub 저장소에 커밋 & 푸시
2. 저장소 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, 브랜치 `main` / 폴더 `/ (root)` 선택
3. 잠시 후 `https://<아이디>.github.io/<저장소명>/` 에서 접속

## 로컬에서 실행

`index.html`을 바로 열어도 되지만, 로컬 서버로 띄우는 걸 권장합니다.

```bash
python -m http.server 5173
```

## 폰트 바꾸기

1. `index.html`의 `<link id="gfonts" ...>` 주소에 원하는 구글 폰트 family를 추가/교체
2. `css/board.css` 맨 위 `--f-title`, `--f-display` 등 변수의 폰트 이름 교체

| 변수 | 쓰이는 곳 | 기본값 |
| --- | --- | --- |
| `--f-title` | 메인 타이틀 | Yellowtail → Black Han Sans |
| `--f-display` | 카테고리 배너, 별 스티커, 푸터 | Anton → Black Han Sans |
| `--f-name` | 페어 이름 | Black Han Sans |
| `--f-num` | 가격, 번호 도장, 원형 도장, 리본 | Bungee → Black Han Sans |
| `--f-body` | 페어 설명 | Gowun Dodum |
| `--f-tag` | 키워드 | Do Hyeon |
| `--f-script` | 카테고리 한 줄 문구 | Yellowtail → Nanum Pen Script |

영문 폰트 뒤에 한글 폰트를 이어 쓰면, 영문은 앞 폰트로·한글은 뒤 폰트로 표시됩니다.
이미지 저장 시에는 `gfonts` 링크의 폰트 중 실제로 쓰인 글자 범위만 골라 넣습니다.

## 데이터 저장

- 작업 내용은 브라우저의 IndexedDB에 자동 저장됩니다 (이미지 포함, 기기·브라우저별로 따로).
- **저장** 탭에서 `.json` 프로젝트 파일로 백업하거나 다른 기기에서 불러올 수 있어요.
