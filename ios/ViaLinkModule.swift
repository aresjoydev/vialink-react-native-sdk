import Foundation
import React
import ViaLinkCore  // xcframework module: ViaLinkCore (class: ViaLinkSDK)

@objc(ViaLinkSDK)
class ViaLinkModule: RCTEventEmitter {

    static let wrapperVersion = "3.1.0"

    /// onDeepLink가 hasListeners == false 시점에 호출된 경우의 캐시.
    /// 3.1.0부터 일반 진입(nil payload)도 콜백이 호출되므로, link 진입(map != nil) /
    /// 일반 진입(map == nil)을 구분하기 위해 별도 플래그(`hasPendingDeepLink`)를 둔다.
    private var pendingDeepLink: [String: Any?]?
    private var hasPendingDeepLink: Bool = false
    private var pendingDeferred: [String: Any?]?
    private var hasListeners = false

    override static func moduleName() -> String! { "ViaLinkSDK" }
    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["onDeepLink", "onDeferredDeepLink"]
    }

    override func startObserving() {
        hasListeners = true
        // 3.1.0+: pendingDeepLink가 nil이어도 hasPendingDeepLink가 true면 일반 진입 콜백을 flush한다.
        if hasPendingDeepLink {
            sendEvent(withName: "onDeepLink", body: pendingDeepLink as Any)
            pendingDeepLink = nil
            hasPendingDeepLink = false
        }
        if let pending = pendingDeferred {
            sendEvent(withName: "onDeferredDeepLink", body: pending)
            pendingDeferred = nil
        }
    }

    override func stopObserving() { hasListeners = false }

    @objc func configure(_ apiKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            ViaLinkSDK.shared.setWrapper("react-native/\(Self.wrapperVersion)")
            ViaLinkSDK.shared.configure(apiKey: apiKey)

            // 딥링크 콜백 — SDK 3.1.0+: data == nil이면 일반 진입을 의미한다.
            // JS 측 emitter는 null payload를 그대로 전달받아 `data: null`로 콜백을 호출한다.
            ViaLinkSDK.shared.onDeepLink { [weak self] data in
                let map: [String: Any?]? = data?.toDictionary()
                if self?.hasListeners == true {
                    self?.sendEvent(withName: "onDeepLink", body: map as Any)
                } else {
                    self?.pendingDeepLink = map
                    self?.hasPendingDeepLink = true
                }
            }

            // 디퍼드 콜백: SDK 3.0+ 시그니처 (data, error) — 항상 1회 호출
            // JS 측 emit 페이로드는 `{data, error}` 객체로 전달한다.
            ViaLinkSDK.shared.onDeferredDeepLink { [weak self] data, error in
                var payload: [String: Any?] = [:]
                if let data = data { payload["data"] = data.toDictionary() }
                if let error = error { payload["error"] = error.toDictionary() }
                if self?.hasListeners == true {
                    self?.sendEvent(withName: "onDeferredDeepLink", body: payload)
                } else {
                    self?.pendingDeferred = payload
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
