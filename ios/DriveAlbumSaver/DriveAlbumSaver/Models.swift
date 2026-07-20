import Foundation

struct DriveFile: Identifiable, Hashable, Decodable {
    let id: String
    let name: String
    let mimeType: String
    let size: String?
    let webViewLink: String?

    var isFolder: Bool {
        mimeType == "application/vnd.google-apps.folder"
    }

    var isImage: Bool {
        mimeType.hasPrefix("image/")
    }

    var isVideo: Bool {
        mimeType.hasPrefix("video/")
    }
}

struct DriveListResponse: Decodable {
    let nextPageToken: String?
    let files: [DriveFile]
}

struct ScanResult {
    var folders: Int = 0
    var images: [DriveFile] = []
    var videos: [DriveFile] = []

    var media: [DriveFile] {
        images + videos
    }

    var mediaCount: Int {
        images.count + videos.count
    }
}

struct SaveSummary {
    let expected: Int
    let saved: Int
    let failed: [String]

    var missing: Int {
        max(expected - saved, 0)
    }
}
