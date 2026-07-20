# Drive Save

빌드 없이 iPhone Safari와 iOS 단축어만으로 Google Drive 사진/동영상을 사진 앱 앨범에 저장하기 위한 정적 웹앱입니다.

## 아이폰에서 쓰는 순서

1. GitHub Pages로 배포된 웹페이지를 iPhone Safari에서 엽니다.
2. `단축어 만들기`에서 `Drive Album Save` 단축어를 아이폰에 한 번 만듭니다.
3. 메인 화면에서 Google Drive 공유 URL과 앨범 이름을 입력합니다.
4. Google OAuth Client ID를 입력하고 Google 로그인을 합니다.
5. `Drive 확인`으로 사진/동영상 개수를 확인합니다.
6. `단축어 실행`을 눌러 아이폰 사진 앱 앨범에 저장합니다.
7. 단축어가 끝나면 저장 성공 개수를 Drive 기준 개수와 비교합니다.

## 핵심 구조

웹페이지는 Drive 폴더를 확인하고 단축어에 넘길 다운로드 목록을 만듭니다. iOS 사진 앱 저장은 단축어 앱이 처리합니다.

```text
Safari 웹페이지
→ Google 로그인
→ Drive 폴더 사진/동영상 개수 확인
→ Drive Album Save 단축어 실행
→ 단축어가 다운로드
→ 사진 앱 앨범에 저장
→ 성공 개수 비교
```

웹페이지 단독으로 사진 앱 앨범에 저장하는 것은 iOS 권한 정책 때문에 불가능합니다. 빌드 없이 가능한 최종 형태는 이 웹앱 + 단축어 조합입니다.

## 현재 지원하는 흐름

1. Google Drive 공유 URL을 입력합니다.
2. 저장할 사진 앱 앨범 이름을 입력합니다.
3. 폴더 링크인 경우 Google 로그인으로 Drive 읽기 권한을 받아 사진/동영상 목록을 조회합니다.
4. Drive 기준 사진 개수, 동영상 개수, 합계를 표시합니다.
5. iOS 단축어 `Drive Album Save`로 `files`, `albumName`, `expectedCount`가 들어간 JSON을 넘깁니다.
6. 단축어 완료 후 저장 성공 개수를 입력하거나 콜백 URL을 열어 Drive 기준 개수와 비교합니다.

## 중요한 제한

웹페이지는 iOS 사진 앱 앨범을 직접 만들거나, 사진/동영상을 특정 앨범에 조용히 저장할 권한이 없습니다. 실제 다운로드와 앨범 저장은 iOS 단축어가 처리해야 합니다.

공유 폴더에 접근할 수 있는 Google 계정으로 로그인해야 합니다. 회사 보안 정책에 따라 외부 웹앱의 Drive 읽기 권한 승인이 막힐 수도 있습니다.

정적 웹페이지에서 Google 로그인을 띄우려면 Google OAuth Web Client ID가 필요합니다. Google Cloud Console에서 Drive API를 사용 설정하고 OAuth 클라이언트 ID를 만든 뒤, GitHub Pages 주소를 Authorized JavaScript origins에 추가하세요. 이건 앱 빌드가 아니라 웹 로그인 설정입니다.

## 단축어 입력 예시

```json
{
  "albumName": "2026 여름 여행",
  "source": "google-drive",
  "type": "folder",
  "folderId": "DRIVE_FOLDER_ID",
  "expectedCount": 42,
  "mediaSummary": {
    "imageCount": 35,
    "videoCount": 7,
    "totalCount": 42
  },
  "files": [
    {
      "id": "DRIVE_FILE_ID",
      "name": "IMG_0001.JPG",
      "mimeType": "image/jpeg",
      "kind": "image",
      "downloadUrl": "https://www.googleapis.com/drive/v3/files/DRIVE_FILE_ID?alt=media",
      "authorizationHeader": "Bearer {ACCESS_TOKEN}"
    }
  ],
  "accessToken": "GOOGLE_ACCESS_TOKEN",
  "authorizationHeader": "Bearer GOOGLE_ACCESS_TOKEN",
  "callbackUrl": "https://example.com/?expected=42&album=2026%20여름%20여행&saved={SAVED_COUNT}"
}
```

## 단축어 구성 기준

웹앱의 `단축어 만들기` 화면에 아이폰용 액션 순서를 넣어두었습니다. 단축어는 아이폰에서 한 번만 만들면 됩니다.

1. 단축어 이름을 `Drive Album Save`로 만듭니다.
2. 텍스트 입력으로 JSON을 받습니다.
3. JSON의 `files`를 반복합니다.
4. 각 파일의 `downloadUrl` 콘텐츠를 가져옵니다.
5. URL 콘텐츠 요청 헤더에 `Authorization` 값을 추가합니다.
6. 사진 앱에 저장하고 `albumName` 앨범에 추가합니다.
7. 성공한 개수를 셉니다.
8. 마지막에 `callbackUrl`의 `{SAVED_COUNT}`를 성공 개수로 바꾼 뒤 URL을 열면 웹페이지가 비교 결과를 보여줍니다.

## 배포

빌드 과정은 없습니다. GitHub Pages에서 저장소 루트를 배포하면 됩니다.
