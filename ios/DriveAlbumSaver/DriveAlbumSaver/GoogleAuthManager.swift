import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

@MainActor
final class GoogleAuthManager: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var accessToken: String = ""

    private var authSession: ASWebAuthenticationSession?
    private var codeVerifier = ""

    func signIn(clientID: String) async throws -> String {
        let verifier = Self.randomString()
        codeVerifier = verifier

        let scheme = Self.reversedClientIDScheme(clientID: clientID)
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: "\(scheme):/oauth2redirect"),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "https://www.googleapis.com/auth/drive.readonly"),
            URLQueryItem(name: "access_type", value: "online"),
            URLQueryItem(name: "prompt", value: "consent"),
            URLQueryItem(name: "code_challenge", value: Self.codeChallenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256")
        ]

        let callbackURL = try await startAuthentication(url: components.url!, callbackScheme: scheme)
        guard
            let callbackComponents = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let code = callbackComponents.queryItems?.first(where: { $0.name == "code" })?.value
        else {
            throw AuthError.missingCode
        }

        let token = try await exchangeCodeForToken(code: code, clientID: clientID, redirectURI: "\(scheme):/oauth2redirect")
        accessToken = token
        return token
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    private func startAuthentication(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let callbackURL else {
                    continuation.resume(throwing: AuthError.missingCallback)
                    return
                }

                continuation.resume(returning: callbackURL)
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            session.start()
        }
    }

    private func exchangeCodeForToken(code: String, clientID: String, redirectURI: String) async throws -> String {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "code_verifier", value: codeVerifier),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "redirect_uri", value: redirectURI)
        ]
        request.httpBody = components.percentEncodedQuery?.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AuthError.tokenExchangeFailed(String(data: data, encoding: .utf8) ?? "Unknown token error")
        }

        let tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
        return tokenResponse.accessToken
    }

    static func reversedClientIDScheme(clientID: String) -> String {
        let suffix = ".apps.googleusercontent.com"
        let prefix = clientID.hasSuffix(suffix) ? String(clientID.dropLast(suffix.count)) : clientID
        return "com.googleusercontent.apps.\(prefix)"
    }

    private static func randomString() -> String {
        let characters = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return String((0..<64).compactMap { _ in characters.randomElement() })
    }

    private static func codeChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private struct TokenResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

enum AuthError: LocalizedError {
    case missingCallback
    case missingCode
    case tokenExchangeFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingCallback:
            return "Google 로그인 결과를 앱으로 돌려받지 못했습니다."
        case .missingCode:
            return "Google 로그인 코드가 없습니다."
        case .tokenExchangeFailed(let message):
            return "Google 토큰 발급 실패: \(message)"
        }
    }
}
