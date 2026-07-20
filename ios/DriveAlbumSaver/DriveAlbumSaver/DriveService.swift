import Foundation

final class DriveService {
    private let token: String

    init(token: String) {
        self.token = token
    }

    func scanSharedURL(_ rawURL: String) async throws -> ScanResult {
        let info = try DriveURLParser.parse(rawURL)
        if info.type == .file {
            let file = try await fetchFile(id: info.id)
            if file.isImage {
                return ScanResult(folders: 0, images: [file], videos: [])
            }
            if file.isVideo {
                return ScanResult(folders: 0, images: [], videos: [file])
            }
            return ScanResult()
        }

        return try await scanFolder(id: info.id)
    }

    func download(file: DriveFile) async throws -> URL {
        var components = URLComponents(string: "https://www.googleapis.com/drive/v3/files/\(file.id)")!
        components.queryItems = [URLQueryItem(name: "alt", value: "media")]

        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (tempURL, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw DriveError.downloadFailed(file.name)
        }

        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(fileExtension(for: file))

        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: tempURL, to: destination)
        return destination
    }

    private func scanFolder(id: String) async throws -> ScanResult {
        var result = ScanResult()
        let children = try await listChildren(folderID: id)

        for child in children {
            if child.isFolder {
                result.folders += 1
                let nested = try await scanFolder(id: child.id)
                result.folders += nested.folders
                result.images.append(contentsOf: nested.images)
                result.videos.append(contentsOf: nested.videos)
            } else if child.isImage {
                result.images.append(child)
            } else if child.isVideo {
                result.videos.append(child)
            }
        }

        return result
    }

    private func listChildren(folderID: String) async throws -> [DriveFile] {
        var allFiles: [DriveFile] = []
        var pageToken: String?

        repeat {
            var components = URLComponents(string: "https://www.googleapis.com/drive/v3/files")!
            var items = [
                URLQueryItem(name: "q", value: "'\(folderID)' in parents and trashed = false"),
                URLQueryItem(name: "fields", value: "nextPageToken,files(id,name,mimeType,size,webViewLink)"),
                URLQueryItem(name: "pageSize", value: "1000"),
                URLQueryItem(name: "supportsAllDrives", value: "true"),
                URLQueryItem(name: "includeItemsFromAllDrives", value: "true")
            ]
            if let pageToken {
                items.append(URLQueryItem(name: "pageToken", value: pageToken))
            }
            components.queryItems = items

            var request = URLRequest(url: components.url!)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw DriveError.listFailed(String(data: data, encoding: .utf8) ?? "Unknown Drive error")
            }

            let decoded = try JSONDecoder().decode(DriveListResponse.self, from: data)
            allFiles.append(contentsOf: decoded.files)
            pageToken = decoded.nextPageToken
        } while pageToken != nil

        return allFiles
    }

    private func fetchFile(id: String) async throws -> DriveFile {
        var components = URLComponents(string: "https://www.googleapis.com/drive/v3/files/\(id)")!
        components.queryItems = [
            URLQueryItem(name: "fields", value: "id,name,mimeType,size,webViewLink"),
            URLQueryItem(name: "supportsAllDrives", value: "true")
        ]

        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw DriveError.listFailed(String(data: data, encoding: .utf8) ?? "Unknown Drive error")
        }

        return try JSONDecoder().decode(DriveFile.self, from: data)
    }

    private func fileExtension(for file: DriveFile) -> String {
        let nameExtension = URL(fileURLWithPath: file.name).pathExtension
        if !nameExtension.isEmpty {
            return nameExtension
        }
        if file.isVideo {
            return "mov"
        }
        return "jpg"
    }
}

enum DriveItemType {
    case file
    case folder
}

struct DriveURLInfo {
    let id: String
    let type: DriveItemType
}

enum DriveURLParser {
    static func parse(_ rawURL: String) throws -> DriveURLInfo {
        guard let url = URL(string: rawURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw DriveError.invalidURL
        }

        let path = url.path
        if let folderID = firstMatch(in: path, pattern: #"/folders/([A-Za-z0-9_-]+)"#) {
            return DriveURLInfo(id: folderID, type: .folder)
        }
        if let fileID = firstMatch(in: path, pattern: #"/file/d/([A-Za-z0-9_-]+)"#) {
            return DriveURLInfo(id: fileID, type: .file)
        }
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let id = components.queryItems?.first(where: { $0.name == "id" })?.value {
            return DriveURLInfo(id: id, type: .file)
        }

        throw DriveError.invalidURL
    }

    private static func firstMatch(in value: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return nil
        }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let match = regex.firstMatch(in: value, range: range),
              let captureRange = Range(match.range(at: 1), in: value) else {
            return nil
        }
        return String(value[captureRange])
    }
}

enum DriveError: LocalizedError {
    case invalidURL
    case listFailed(String)
    case downloadFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Google Drive 파일 또는 폴더 URL을 확인해주세요."
        case .listFailed(let message):
            return "Drive 목록 조회 실패: \(message)"
        case .downloadFailed(let name):
            return "다운로드 실패: \(name)"
        }
    }
}
