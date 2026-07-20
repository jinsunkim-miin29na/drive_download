import Photos
import UIKit

final class PhotoLibrarySaver {
    func requestPermission() async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else {
            throw PhotoSaveError.permissionDenied
        }
    }

    func save(files: [DriveFile], albumName: String, downloader: (DriveFile) async throws -> URL, progress: @escaping (Int, Int) -> Void) async -> SaveSummary {
        var saved = 0
        var failed: [String] = []

        do {
            try await requestPermission()
            let album = try await getOrCreateAlbum(named: albumName)

            for file in files {
                do {
                    let localURL = try await downloader(file)
                    try await save(localURL: localURL, file: file, album: album)
                    saved += 1
                    try? FileManager.default.removeItem(at: localURL)
                } catch {
                    failed.append(file.name)
                }
                progress(saved, files.count)
            }
        } catch {
            failed.append("Photos permission or album error")
        }

        return SaveSummary(expected: files.count, saved: saved, failed: failed)
    }

    private func getOrCreateAlbum(named name: String) async throws -> PHAssetCollection {
        if let existing = fetchAlbum(named: name) {
            return existing
        }

        var placeholder: PHObjectPlaceholder?
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: name)
            placeholder = request.placeholderForCreatedAssetCollection
        }

        guard let localIdentifier = placeholder?.localIdentifier else {
            throw PhotoSaveError.albumCreateFailed
        }

        let fetch = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [localIdentifier], options: nil)
        guard let album = fetch.firstObject else {
            throw PhotoSaveError.albumCreateFailed
        }
        return album
    }

    private func fetchAlbum(named name: String) -> PHAssetCollection? {
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "title = %@", name)
        return PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: options).firstObject
    }

    private func save(localURL: URL, file: DriveFile, album: PHAssetCollection) async throws {
        try await PHPhotoLibrary.shared().performChanges {
            let assetRequest = PHAssetCreationRequest.forAsset()
            let resourceType: PHAssetResourceType = file.isVideo ? .video : .photo
            assetRequest.addResource(with: resourceType, fileURL: localURL, options: nil)

            guard let placeholder = assetRequest.placeholderForCreatedAsset,
                  let albumRequest = PHAssetCollectionChangeRequest(for: album) else {
                return
            }

            albumRequest.addAssets([placeholder] as NSArray)
        }
    }
}

enum PhotoSaveError: LocalizedError {
    case permissionDenied
    case albumCreateFailed

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "사진 앱 저장 권한이 필요합니다."
        case .albumCreateFailed:
            return "사진 앨범을 만들 수 없습니다."
        }
    }
}
