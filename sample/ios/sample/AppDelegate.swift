import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import ViaLinkCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "sample",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // Universal Link 처리 — `https://vialink.app/...` 등 entitlement에 등록된 도메인의 링크
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    NSLog("[ViaLink] AppDelegate.continue userActivity: type=\(userActivity.activityType) url=\(userActivity.webpageURL?.absoluteString ?? "-")")
    let handled = ViaLinkSDK.shared.handleUniversalLink(userActivity)
    NSLog("[ViaLink] handleUniversalLink returned \(handled)")
    return handled
  }

  // URL Scheme 처리 — `myapp://...` 같은 커스텀 스킴
  func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    NSLog("[ViaLink] AppDelegate.open URL: \(url.absoluteString)")
    let handled = ViaLinkSDK.shared.handleURL(url)
    NSLog("[ViaLink] handleURL returned \(handled)")
    return handled
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
