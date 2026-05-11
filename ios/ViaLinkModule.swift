import Foundation
import React
import ViaLinkCore  // xcframework module: ViaLinkCore (class: ViaLinkSDK)

@objc(ViaLinkSDK)
class ViaLinkModule: RCTEventEmitter {

    static let wrapperVersion = "2.1.0"

    private var pendingDeepLink: [String: Any?]?
    private var pendingDeferred: [String: Any?]?
    private var hasListeners = false

    // RCTEventEmitter가 New Arch/Bridgeless 모드에서 종종 이벤트를 JS로 전달하지 못하는 이슈가 있어,
    // Promise 기반 "다음 이벤트 기다리기" 방식을 같이 제공한다. JS가 루프로 호출해 다음 발생을 받는다.
    private var nextDeepLinkResolver: RCTPromiseResolveBlock?
    private var nextDeferredResolver: RCTPromiseResolveBlock?
    private let nextLock = NSLock()

    override static func moduleName() -> String! { "ViaLinkSDK" }
    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["onDeepLink", "onDeferredDeepLink"]
    }

    override func startObserving() {
        hasListeners = true
        NSLog("[ViaLink] startObserving — hasListeners=true, pendingDeepLink=\(pendingDeepLink != nil), pendingDeferred=\(pendingDeferred != nil)")
        if let pending = pendingDeepLink {
            sendEvent(withName: "onDeepLink", body: pending)
            pendingDeepLink = nil
        }
        if let pending = pendingDeferred {
            sendEvent(withName: "onDeferredDeepLink", body: pending)
            pendingDeferred = nil
        }
    }

    override func stopObserving() {
        hasListeners = false
        NSLog("[ViaLink] stopObserving — hasListeners=false")
    }

    @objc func configure(_ apiKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            ViaLinkSDK.shared.setWrapperInternal("react-native/\(Self.wrapperVersion)")
            ViaLinkSDK.shared.configure(apiKey: apiKey)

            ViaLinkSDK.shared.onDeepLink { [weak self] data in
                guard let self = self else { return }
                let map = data.toDictionary()
                NSLog("[ViaLink] onDeepLink fired — path=\(data.path) hasListeners=\(self.hasListeners)")
                // 1) RCTEventEmitter 경로 (Old Arch에서 동작)
                if self.hasListeners {
                    self.sendEvent(withName: "onDeepLink", body: map)
                } else {
                    self.pendingDeepLink = map
                }
                // 2) Promise 기반 awaitNextDeepLink 경로 (New Arch/Bridgeless에서 안정적)
                self.nextLock.lock()
                let resolver = self.nextDeepLinkResolver
                self.nextDeepLinkResolver = nil
                self.nextLock.unlock()
                resolver?(map)
            }

            // 디퍼드 콜백: SDK 3.0+ 시그니처 (data, error) — 항상 1회 호출
            ViaLinkSDK.shared.onDeferredDeepLink { [weak self] data, error in
                guard let self = self else { return }
                var payload: [String: Any?] = [:]
                if let data = data { payload["data"] = data.toDictionary() }
                if let error = error { payload["error"] = error.toDictionary() }
                if self.hasListeners {
                    self.sendEvent(withName: "onDeferredDeepLink", body: payload)
                } else {
                    self.pendingDeferred = payload
                }
                self.nextLock.lock()
                let resolver = self.nextDeferredResolver
                self.nextDeferredResolver = nil
                self.nextLock.unlock()
                resolver?(payload)
            }

            resolve(nil)
        }
    }

    @objc func track(_ eventName: String, data: NSDictionary?) {
        // 네이티브 iOS SDK는 [String: String]만 받으므로 문자열 값만 전달한다.
        let dict = data as? [String: String]
        ViaLinkSDK.shared.track(eventName, data: dict)
    }

    @objc func createLink(_ path: String, data: NSDictionary?, campaign: String?,
                          linkType: String,
                          options: NSDictionary?,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                // 5번째 인자(options)는 폴백 URL/OG/채널/태그 등 부가 옵션 (선택).
                let url = try await ViaLinkSDK.shared.createLink(
                    path: path,
                    data: data as? [String: String],
                    campaign: campaign,
                    linkType: linkType,
                    iosUrl: options?["iosUrl"] as? String,
                    androidUrl: options?["androidUrl"] as? String,
                    webUrl: options?["webUrl"] as? String,
                    ogTitle: options?["ogTitle"] as? String,
                    ogDescription: options?["ogDescription"] as? String,
                    ogImageUrl: options?["ogImageUrl"] as? String,
                    channel: options?["channel"] as? String,
                    feature: options?["feature"] as? String,
                    tags: options?["tags"] as? [String],
                    expiresAt: options?["expiresAt"] as? String
                )
                DispatchQueue.main.async { resolve(url) }
            } catch {
                DispatchQueue.main.async { reject("CREATE_LINK_ERROR", error.localizedDescription, error) }
            }
        }
    }

    /// 결제 시도 이벤트를 native iOS SDK(ViaLinkSDK.shared.payment.initiated)로 전달.
    /// args: { orderId, amount, currency, linkId?, paymentMethod?, metadata? }
    /// resolve: { success: Bool, paymentEventId: String }
    @objc func paymentInitiated(_ args: NSDictionary,
                                resolve: @escaping RCTPromiseResolveBlock,
                                reject: @escaping RCTPromiseRejectBlock) {
        guard let orderId = args["orderId"] as? String, !orderId.isEmpty else {
            reject("E_INVALID_ARG", "orderId가 필요합니다.", nil)
            return
        }
        guard let amountValue = args["amount"] as? NSNumber else {
            reject("E_INVALID_ARG", "amount가 필요합니다.", nil)
            return
        }
        guard let currency = args["currency"] as? String, !currency.isEmpty else {
            reject("E_INVALID_ARG", "currency가 필요합니다.", nil)
            return
        }

        let linkId = args["linkId"] as? Int
        let paymentMethod = args["paymentMethod"] as? String
        let metadata = args["metadata"] as? [String: String]

        let payArgs = PaymentInitiatedArgs(
            orderId: orderId,
            amount: amountValue.doubleValue,
            currency: currency,
            linkId: linkId,
            paymentMethod: paymentMethod,
            metadata: metadata
        )

        Task {
            do {
                let result = try await ViaLinkSDK.shared.payment.initiated(payArgs)
                DispatchQueue.main.async {
                    resolve([
                        "success": result.success,
                        "paymentEventId": result.paymentEventId,
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("E_PAYMENT_FAILED", error.localizedDescription, error)
                }
            }
        }
    }

    // Pull APIs
    @objc func getDeferredLinkData(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let data = ViaLinkSDK.shared.getDeferredLinkData() {
            resolve(data.toDictionary())
        } else {
            resolve(nil)
        }
    }

    @objc func awaitDeferredLinkData(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                if let data = try await ViaLinkSDK.shared.awaitDeferredLinkData() {
                    DispatchQueue.main.async { resolve(data.toDictionary()) }
                } else {
                    DispatchQueue.main.async { resolve(nil) }
                }
            } catch {
                DispatchQueue.main.async { reject("E_AWAIT_DEFERRED_FAILED", error.localizedDescription, error) }
            }
        }
    }

    @objc func getDeepLinkData(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let data = ViaLinkSDK.shared.getDeepLinkData() {
            resolve(data.toDictionary())
        } else {
            resolve(nil)
        }
    }

    @objc func awaitDeepLinkData(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                if let data = try await ViaLinkSDK.shared.awaitDeepLinkData() {
                    DispatchQueue.main.async { resolve(data.toDictionary()) }
                } else {
                    DispatchQueue.main.async { resolve(nil) }
                }
            } catch {
                DispatchQueue.main.async { reject("E_AWAIT_DEEPLINK_FAILED", error.localizedDescription, error) }
            }
        }
    }

    /// JS가 루프로 호출. 다음 새 딥링크가 도착할 때까지 무기한 대기 후 resolve.
    /// 동시에 한 개의 pending resolver만 유지 (덮어쓰기). 캐시된 값은 반환하지 않으므로 중복 emit 없음.
    @objc func awaitNextDeepLink(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        nextLock.lock()
        // 이전 resolver가 남아 있으면 nil로 해제 (JS 측 이전 await가 정리됨)
        if let prev = nextDeepLinkResolver { prev(NSNull()) }
        nextDeepLinkResolver = resolve
        nextLock.unlock()
    }

    /// JS가 한 번 호출. 디퍼드 매칭 결과를 무기한 대기 후 resolve.
    @objc func awaitNextDeferred(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        nextLock.lock()
        if let prev = nextDeferredResolver { prev(NSNull()) }
        nextDeferredResolver = resolve
        nextLock.unlock()
    }
}

extension DeepLinkData {
    func toDictionary() -> [String: Any?] {
        // 어트리뷰션용 numeric link_id 포함 — JS 측 DeepLinkData.linkId로 노출됨
        ["path": path, "params": params, "shortCode": shortCode, "linkId": linkId]
    }
}

extension DeferredError {
    /// JS DeferredError 인터페이스와 키가 일치해야 함
    func toDictionary() -> [String: Any?] {
        [
            "code": code.rawValue,
            "message": message,
            "httpStatus": httpStatus,
            "retryable": retryable,
        ]
    }
}
