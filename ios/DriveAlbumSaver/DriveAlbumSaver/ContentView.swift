import SwiftUI

@MainActor
final class AppViewModel: ObservableObject {
    @Published var clientID = ""
    @Published var driveURL = ""
    @Published var albumName = ""
    @Published var status = "Google 로그인 후 Drive 폴더를 확인하세요."
    @Published var isSignedIn = false
    @Published var isWorking = false
    @Published var scanResult = ScanResult()
    @Published var saveSummary: SaveSummary?

    private let auth = GoogleAuthManager()
    private let photoSaver = PhotoLibrarySaver()
    private var driveService: DriveService?

    func signIn() {
        Task {
            isWorking = true
            defer { isWorking = false }
            do {
                let token = try await auth.signIn(clientID: clientID.trimmingCharacters(in: .whitespacesAndNewlines))
                driveService = DriveService(token: token)
                isSignedIn = true
                status = "Google 로그인 완료"
            } catch {
                status = error.localizedDescription
            }
        }
    }

    func scan() {
        Task {
            guard let driveService else {
                status = "먼저 Google 로그인을 해주세요."
                return
            }

            isWorking = true
            defer { isWorking = false }
            do {
                status = "Drive 폴더 확인 중..."
                scanResult = try await driveService.scanSharedURL(driveURL)
                saveSummary = nil
                status = "폴더 \(scanResult.folders)개, 사진 \(scanResult.images.count)개, 동영상 \(scanResult.videos.count)개 확인"
            } catch {
                status = error.localizedDescription
            }
        }
    }

    func saveToPhotos() {
        Task {
            guard let driveService else {
                status = "먼저 Google 로그인을 해주세요."
                return
            }
            guard !albumName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                status = "앨범 이름을 입력해주세요."
                return
            }

            let media = scanResult.media
            guard !media.isEmpty else {
                status = "저장할 사진/동영상이 없습니다."
                return
            }

            isWorking = true
            defer { isWorking = false }
            status = "사진 앱에 저장 중..."

            let summary = await photoSaver.save(files: media, albumName: albumName, downloader: { file in
                try await driveService.download(file: file)
            }, progress: { saved, total in
                Task { @MainActor in
                    self.status = "저장 중 \(saved)/\(total)"
                }
            })

            saveSummary = summary
            if summary.saved == summary.expected {
                status = "완료: Drive \(summary.expected)개, 사진 앱 저장 \(summary.saved)개"
            } else {
                status = "차이 있음: Drive \(summary.expected)개, 저장 \(summary.saved)개, 실패 \(summary.failed.count)개"
            }
        }
    }
}

struct ContentView: View {
    @StateObject private var model = AppViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section("Google") {
                    TextField("iOS OAuth Client ID", text: $model.clientID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(model.isSignedIn ? "Google 로그인됨" : "Google 로그인") {
                        model.signIn()
                    }
                    .disabled(model.isWorking || model.clientID.isEmpty)
                }

                Section("Drive") {
                    TextField("Google Drive 공유 URL", text: $model.driveURL, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .lineLimit(3...5)
                    TextField("저장할 사진 앱 앨범 이름", text: $model.albumName)
                    Button("Drive 확인") {
                        model.scan()
                    }
                    .disabled(model.isWorking || !model.isSignedIn || model.driveURL.isEmpty)
                }

                Section("확인 결과") {
                    LabeledContent("폴더", value: "\(model.scanResult.folders)")
                    LabeledContent("사진", value: "\(model.scanResult.images.count)")
                    LabeledContent("동영상", value: "\(model.scanResult.videos.count)")
                    LabeledContent("저장 대상", value: "\(model.scanResult.mediaCount)")
                }

                Section("사진 앱 저장") {
                    Button("아이폰 사진 앱에 저장") {
                        model.saveToPhotos()
                    }
                    .disabled(model.isWorking || model.scanResult.media.isEmpty || model.albumName.isEmpty)

                    if let summary = model.saveSummary {
                        LabeledContent("Drive 기준", value: "\(summary.expected)")
                        LabeledContent("저장 성공", value: "\(summary.saved)")
                        LabeledContent("미저장", value: "\(summary.missing)")
                        if !summary.failed.isEmpty {
                            Text("실패: \(summary.failed.prefix(5).joined(separator: ", "))")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("상태") {
                    Text(model.status)
                        .foregroundStyle(model.isWorking ? .blue : .primary)
                    if model.isWorking {
                        ProgressView()
                    }
                }
            }
            .navigationTitle("Drive 저장")
        }
    }
}
