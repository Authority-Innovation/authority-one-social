import AuthenticationServices
import ExpoModulesCore
import UIKit

// Signature sign-in (Community): the Janus authorize leg in
// ASWebAuthenticationSession, completed by the CLAIMED https callback
// (ASWebAuthenticationSession.Callback.https, iOS 17.4+) instead of a custom
// scheme. expo-web-browser's openAuthSessionAsync only takes a scheme, hence
// this module.
//
// Non-ephemeral on purpose: the person's Janus browser session (Google, one
// tap) carries over, exactly as the scheme path did.
//
// The OS only completes the session on a navigation to EXACTLY `host` + `path`;
// the app needs an associated domain for that host (app.config.js adds
// applinks: and webcredentials: for it when the lane is armed) and the host's
// AASA must list this bundle. Nothing here ever reads or keeps a token: the
// callback URL (code + state) goes straight back to JS, which checks the
// state and has the runtime redeem it.

private final class AnchorProvider: NSObject,
  ASWebAuthenticationPresentationContextProviding
{
  func presentationAnchor(for session: ASWebAuthenticationSession)
    -> ASPresentationAnchor
  {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
    let active = scenes.filter { $0.activationState == .foregroundActive }
    for scene in active + scenes {
      if let key = scene.windows.first(where: { $0.isKeyWindow }) {
        return key
      }
    }
    if let any = scenes.first?.windows.first {
      return any
    }
    return ASPresentationAnchor()
  }
}

public final class ExpoAOAuthSessionModule: Module {
  // One session at a time; held strongly until it completes (the OS does not
  // retain it for us).
  private var session: ASWebAuthenticationSession?
  private let anchor = AnchorProvider()

  public func definition() -> ModuleDefinition {
    Name("ExpoAOAuthSession")

    Function("isSupported") { () -> Bool in
      if #available(iOS 17.4, *) {
        return true
      }
      return false
    }

    AsyncFunction("authorizeHttps") {
      (url: String, host: String, path: String, promise: Promise) in
      guard #available(iOS 17.4, *) else {
        promise.reject("ERR_AO_AUTH_UNSUPPORTED", "Requires iOS 17.4 or later")
        return
      }
      guard self.session == nil else {
        promise.reject("ERR_AO_AUTH_BUSY", "A sign-in is already in progress")
        return
      }
      guard let authURL = URL(string: url), authURL.scheme == "https",
        !host.isEmpty, path.hasPrefix("/")
      else {
        promise.reject("ERR_AO_AUTH_ARGS", "Invalid authorize URL or callback")
        return
      }

      let s = ASWebAuthenticationSession(
        url: authURL,
        callback: .https(host: host, path: path)
      ) { [weak self] callbackURL, error in
        self?.session = nil
        if let callbackURL = callbackURL {
          promise.resolve(["type": "success", "url": callbackURL.absoluteString])
          return
        }
        if let e = error as? ASWebAuthenticationSessionError,
          e.code == .canceledLogin
        {
          promise.resolve(["type": "cancel"])
          return
        }
        promise.reject(
          "ERR_AO_AUTH_SESSION",
          "The sign-in session ended without a callback"
        )
      }
      s.prefersEphemeralWebBrowserSession = false
      s.presentationContextProvider = self.anchor
      self.session = s
      if !s.start() {
        self.session = nil
        promise.reject("ERR_AO_AUTH_START", "Could not start the sign-in session")
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { [session] in
        session?.cancel()
      }
    }
  }
}
