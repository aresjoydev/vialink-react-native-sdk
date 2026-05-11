package com.vialink.reactnative

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vialink.sdk.ViaLinkSDK
import com.vialink.sdk.model.DeepLinkData
import com.vialink.sdk.model.DeferredError
import com.vialink.sdk.model.PaymentInitiatedArgs
import kotlinx.coroutines.*

class ViaLinkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {

    companion object {
        const val WRAPPER_VERSION = "2.1.0"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var pendingDeepLink: WritableMap? = null
    private var pendingDeferred: WritableMap? = null
    private var listenerCount = 0

    // RCTEventEmitter가 New Arch / Bridgeless 모드에서 이벤트 전달이 불안정한 이슈를 우회하기 위한
    // Promise 기반 "다음 이벤트 기다리기" 메커니즘. JS가 루프로 호출해 다음 발생을 받는다.
    private var nextDeepLinkResolver: Promise? = null
    private var nextDeferredResolver: Promise? = null
    private val nextLock = Object()

    override fun getName() = "ViaLinkSDK"

    init {
        reactContext.addActivityEventListener(this)
    }

    // 이벤트 전송
    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun configure(apiKey: String, promise: Promise) {
        val context = reactApplicationContext
        ViaLinkSDK.setWrapperInternal("react-native/$WRAPPER_VERSION")
        ViaLinkSDK.init(context, apiKey)

        ViaLinkSDK.onDeepLink { data ->
            val map = data.toWritableMap()
            // 1) RCTEventEmitter 경로 (Old Arch에서 동작)
            if (listenerCount > 0) sendEvent("onDeepLink", map)
            else pendingDeepLink = map
            // 2) Promise 기반 awaitNextDeepLink 경로 (New Arch / Bridgeless에서 안정적)
            val resolver = synchronized(nextLock) {
                val r = nextDeepLinkResolver
                nextDeepLinkResolver = null
                r
            }
            resolver?.resolve(data.toWritableMap())
        }
        // 디퍼드 콜백: SDK 3.0+ 시그니처 (data, error) — 항상 1회 호출
        ViaLinkSDK.onDeferredDeepLink { data, error ->
            val payload = Arguments.createMap()
            data?.let { payload.putMap("data", it.toWritableMap()) }
            error?.let {
                val errMap = Arguments.createMap()
                errMap.putString("message", it.message)
                payload.putMap("error", errMap)
            }
            if (listenerCount > 0) sendEvent("onDeferredDeepLink", payload)
            else pendingDeferred = payload
            val resolver = synchronized(nextLock) {
                val r = nextDeferredResolver
                nextDeferredResolver = null
                r
            }
            // 새 payload 인스턴스를 만들어 전달 (한 ReadableMap을 재사용하면 RN이 에러)
            val payload2 = Arguments.createMap()
            data?.let { payload2.putMap("data", it.toWritableMap()) }
            error?.let {
                val errMap = Arguments.createMap()
                errMap.putString("message", it.message)
                payload2.putMap("error", errMap)
            }
            resolver?.resolve(payload2)
        }

        getCurrentActivity()?.intent?.let { ViaLinkSDK.handleIntent(it) }
        promise.resolve(null)
    }

    @ReactMethod
    fun track(eventName: String, data: ReadableMap?) {
        val map = data?.toHashMap()?.mapValues { it.value as Any }
        ViaLinkSDK.track(eventName, map)
    }

    @ReactMethod
    fun createLink(
        path: String,
        data: ReadableMap?,
        campaign: String?,
        linkType: String,
        options: ReadableMap?,
        promise: Promise
    ) {
        scope.launch {
            val dataMap = data?.toHashMap()?.mapValues { it.value as Any }
            // 5번째 인자는 폴백 URL/OG/채널/태그 등 부가 옵션 (선택).
            val tagsList = options?.takeIf { it.hasKey("tags") && !it.isNull("tags") }
                ?.getArray("tags")
                ?.toArrayList()
                ?.mapNotNull { it as? String }
            val result = ViaLinkSDK.createLink(
                path = path,
                data = dataMap,
                campaign = campaign,
                linkType = linkType,
                iosUrl = options?.optString("iosUrl"),
                androidUrl = options?.optString("androidUrl"),
                webUrl = options?.optString("webUrl"),
                ogTitle = options?.optString("ogTitle"),
                ogDescription = options?.optString("ogDescription"),
                ogImageUrl = options?.optString("ogImageUrl"),
                channel = options?.optString("channel"),
                feature = options?.optString("feature"),
                tags = tagsList,
                expiresAt = options?.optString("expiresAt"),
            )
            result.onSuccess { promise.resolve(it) }
            result.onFailure { promise.reject("CREATE_LINK_ERROR", it.message) }
        }
    }

    /// ReadableMap에서 String을 안전하게 꺼냄 (없거나 null이면 null 반환).
    private fun ReadableMap.optString(key: String): String? {
        if (!hasKey(key) || isNull(key)) return null
        return getString(key)
    }

    /// 결제 시도 이벤트를 native SDK(payment.initiated)로 전달.
    /// args: { orderId, amount, currency, linkId?, paymentMethod?, metadata? }
    /// resolve: { success: Boolean, paymentEventId: String }
    @ReactMethod
    fun paymentInitiated(args: ReadableMap, promise: Promise) {
        try {
            val orderId = if (args.hasKey("orderId") && !args.isNull("orderId"))
                args.getString("orderId") else null
            if (orderId.isNullOrEmpty()) {
                return promise.reject("E_INVALID_ARG", "orderId가 필요합니다.")
            }

            if (!args.hasKey("amount") || args.isNull("amount")) {
                return promise.reject("E_INVALID_ARG", "amount가 필요합니다.")
            }
            val amount = args.getDouble("amount")

            val currency = if (args.hasKey("currency") && !args.isNull("currency"))
                args.getString("currency") else null
            if (currency.isNullOrEmpty()) {
                return promise.reject("E_INVALID_ARG", "currency가 필요합니다.")
            }

            val linkId = if (args.hasKey("linkId") && !args.isNull("linkId"))
                args.getInt("linkId") else null
            val paymentMethod = if (args.hasKey("paymentMethod") && !args.isNull("paymentMethod"))
                args.getString("paymentMethod") else null
            val metadata = if (args.hasKey("metadata") && !args.isNull("metadata"))
                args.getMap("metadata")?.toHashMap()?.mapValues { it.value as Any? } else null

            val payArgs = PaymentInitiatedArgs(
                orderId = orderId,
                amount = amount,
                currency = currency,
                linkId = linkId,
                paymentMethod = paymentMethod,
                metadata = metadata,
            )

            scope.launch {
                try {
                    val result = ViaLinkSDK.trackPayment(payArgs)
                    val map = Arguments.createMap()
                    map.putBoolean("success", result.success)
                    map.putString("paymentEventId", result.paymentEventId)
                    promise.resolve(map)
                } catch (e: Exception) {
                    promise.reject("E_PAYMENT_FAILED", e.message ?: e.toString(), e)
                }
            }
        } catch (e: Exception) {
            promise.reject("E_PAYMENT_FAILED", e.message ?: e.toString(), e)
        }
    }

    // Pull APIs
    @ReactMethod
    fun getDeferredLinkData(promise: Promise) {
        try {
            val data = ViaLinkSDK.getDeferredLinkData()
            promise.resolve(data?.toWritableMap())
        } catch (e: Exception) {
            promise.reject("E_GET_DEFERRED_FAILED", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun awaitDeferredLinkData(promise: Promise) {
        scope.launch {
            try {
                val data = ViaLinkSDK.awaitDeferredLinkData()
                promise.resolve(data?.toWritableMap())
            } catch (e: Exception) {
                promise.reject("E_AWAIT_DEFERRED_FAILED", e.message ?: e.toString(), e)
            }
        }
    }

    @ReactMethod
    fun getDeepLinkData(promise: Promise) {
        try {
            val data = ViaLinkSDK.getDeepLinkData()
            promise.resolve(data?.toWritableMap())
        } catch (e: Exception) {
            promise.reject("E_GET_DEEPLINK_FAILED", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun awaitDeepLinkData(promise: Promise) {
        scope.launch {
            try {
                val data = ViaLinkSDK.awaitDeepLinkData()
                promise.resolve(data?.toWritableMap())
            } catch (e: Exception) {
                promise.reject("E_AWAIT_DEEPLINK_FAILED", e.message ?: e.toString(), e)
            }
        }
    }

    /// JS가 루프로 호출. 다음 새 딥링크가 도착할 때까지 무기한 대기 후 resolve.
    /// 동시에 한 개의 pending resolver만 유지 (덮어쓰기). 캐시된 값은 반환하지 않으므로 중복 emit 없음.
    @ReactMethod
    fun awaitNextDeepLink(promise: Promise) {
        synchronized(nextLock) {
            // 이전 resolver가 남아 있으면 nil로 해제
            nextDeepLinkResolver?.resolve(null)
            nextDeepLinkResolver = promise
        }
    }

    /// JS가 한 번 호출. 디퍼드 매칭 결과를 무기한 대기 후 resolve.
    @ReactMethod
    fun awaitNextDeferred(promise: Promise) {
        synchronized(nextLock) {
            nextDeferredResolver?.resolve(null)
            nextDeferredResolver = promise
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
        // pending 이벤트 flush
        if (eventName == "onDeepLink") {
            pendingDeepLink?.let { sendEvent("onDeepLink", it) }
            pendingDeepLink = null
        }
        if (eventName == "onDeferredDeepLink") {
            pendingDeferred?.let { sendEvent("onDeferredDeepLink", it) }
            pendingDeferred = null
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
        if (listenerCount < 0) listenerCount = 0
    }

    // ActivityEventListener -- 새 Intent 처리 (Warm Start)
    override fun onNewIntent(intent: android.content.Intent) {
        ViaLinkSDK.handleIntent(intent)
    }
    override fun onActivityResult(activity: android.app.Activity, requestCode: Int, resultCode: Int, data: android.content.Intent?) {}

    override fun onCatalystInstanceDestroy() {
        scope.cancel()
        super.onCatalystInstanceDestroy()
    }
}

private fun DeepLinkData.toWritableMap(): WritableMap {
    val map = Arguments.createMap()
    map.putString("path", path)
    val paramsMap = Arguments.createMap()
    params.forEach { (k, v) -> paramsMap.putString(k, v) }
    map.putMap("params", paramsMap)
    shortCode?.let { map.putString("shortCode", it) }
    // 어트리뷰션용 numeric link_id (없으면 키 자체를 누락)
    linkId?.let { map.putInt("linkId", it) }
    return map
}
