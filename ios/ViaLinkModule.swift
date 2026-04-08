import Foundation
import React
import ViaLinkSDK  // xcframework

@objc(ViaLinkSDK)
class ViaLinkModule: RCTEventEmitter {

    private var pendingDeepLink: [String: Any?]?
    private var pendingDeferred: [String: Any?]?
    private var hasListeners = false

    override static func moduleName() -> String! { "ViaLinkSDK" }
    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["onDeepLink", "onDeferredDeepLink"]
    }

    override func startObserving() {
        hasListeners = true
        if let pending = pendingDeepLink {
            sendEvent(withName: "onDeepLink", body: pending)
            pendingDeepLink = nil
        }
        if let pending = pendingDeferred {
            sendEvent(withName: "onDeferredDeepLink", body: pending)
            pendingDeferred = nil
        }
    }

    override func stopObserving() { hasListeners = false }

    @objc func configure(_ apiKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            ViaLinkSDK.shared.configure(apiKey: apiKey)

            ViaLinkSDK.shared.onDeepLink { [weak self] data in
                let map = data.toDictionary()
                if self?.hasListeners == true {
                    self?.sendEvent(withName: "onDeepLink", body: map)
                } else {
                    self?.pendingDeepLink = map
                }
            }

            ViaLinkSDK.shared.onDeferredDeepLink { [weak self] data in
                let map = data.toDictionary()
                if self?.hasListeners == true {
                    self?.sendEvent(withName: "onDeferredDeepLink", body: map)
                } else {
                    self?.pendingDeferred = map
                }
            }

            resolve(nil)
        }
    }

    @objc func track(_ eventName: String, data: NSDictionary?) {
        let dict = data as? [String: Any]
        ViaLinkSDK.shared.track(eventName, data: dict)
    }

    @objc func createLink(_ path: String, data: NSDictionary?, campaign: String?,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let url = try await ViaLinkSDK.shared.createLink(path: path, data: data as? [String: Any], campaign: campaign)
                DispatchQueue.main.async { resolve(url) }
            } catch {
                DispatchQueue.main.async { reject("CREATE_LINK_ERROR", error.localizedDescription, error) }
            }
        }
    }
}

extension DeepLinkData {
    func toDictionary() -> [String: Any?] {
        ["path": path, "params": params, "shortCode": shortCode]
    }
}
