# Drive Album Helper

iPhone Safari에서 Google Drive 공유 링크와 앨범 이름을 iOS 단축어로 넘기기 위한 정적 웹앱입니다.

## 왜 단축어가 필요한가요?

웹페이지는 iOS 사진 앱의 앨범을 직접 만들거나 특정 앨범에 사진/영상을 자동 저장할 권한이 없습니다. 이 앱은 Drive 링크를 정리하고 `Drive Album Save`라는 iOS 단축어로 JSON 입력을 넘깁니다. 실제 사진 앱 저장은 단축어에서 처리합니다.

## 배포

이 저장소는 빌드 과정이 없습니다. GitHub Pages에서 루트 폴더를 배포하면 됩니다.

## 단축어 입력 예시

```json
{
  "albumName": "2026 여름 여행",
  "source": "google-drive",
  "type": "file",
  "id": "DRIVE_FILE_ID",
  "url": "https://drive.google.com/file/d/DRIVE_FILE_ID/view",
  "openUrl": "https://drive.google.com/uc?export=download&id=DRIVE_FILE_ID",
  "createdAt": "2026-07-20T00:00:00.000Z"
}
```

## 권장 단축어 구성

1. 단축어 이름을 `Drive Album Save`로 만듭니다.
2. 단축어 입력을 텍스트로 받습니다.
3. 입력 JSON에서 `albumName`, `type`, `openUrl`, `url`을 읽습니다.
4. URL 콘텐츠를 가져옵니다.
5. 파일이 ZIP이면 압축을 풀고 이미지/영상을 필터링합니다.
6. 사진 앱에 저장한 뒤 `albumName` 앨범에 추가합니다.

Google Drive 공유 폴더 전체 자동 다운로드는 로그인, 파일 수, 공유 권한에 따라 제한될 수 있습니다. 가장 안정적인 운영 방식은 Drive에서 폴더를 ZIP으로 내려받게 한 뒤 단축어가 사진/영상만 골라 앨범에 넣는 흐름입니다.
