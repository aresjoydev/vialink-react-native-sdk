import Foundation
import React
import ViaLinkCore  // xcframework module: ViaLinkCore (class: ViaLinkSDK)

@objc(ViaLinkSDK)
class ViaLinkModule: RCTEventEmitter {

    static let wrapperVersion = "2.1.0"

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
            ViaLinkSDK.shared.setWrapper("react-native/\(Self.wrapperVersion)")
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
                          linkType: String,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                // TODO: ViaLinkCore가 linkType을 지원하면 아래 호출에 linkType 전달 필요.
                //       현재 iOS core SDK는 다른 sub-agent가 linkType 인자를 추가 중.
                let url = try await ViaLinkSDK.shared.createLink(path: path, data: data as? [String: Any], campaign: campaign)
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
