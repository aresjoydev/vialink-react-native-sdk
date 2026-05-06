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
        const val WRAPPER_VERSION = "3.1.0"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    /// onDeepLink가 listenerCount==0 시점에 호출된 경우의 캐시.
    /// 3.1.0부터 일반 진입에서도 콜백이 호출되므로, link 진입(map != null) / 일반 진입(map == null)을
    /// 구분하기 위해 별도 플래그(`hasPendingDeepLink`)를 둔다.
    private var pendingDeepLink: WritableMap? = null
    private var hasPendingDeepLink: Boolean = false
    private var pendingDeferred: WritableMap? = null
    private var listenerCount = 0

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
        ViaLinkSDK.setWrapper("react-native/$WRAPPER_VERSION")
        ViaLinkSDK.init(context, apiKey)

        // 딥링크 콜백 — SDK 3.1.0+: data == null이면 일반 진입을 의미한다.
        // JS 측 emitter는 null payload를 그대로 전달받아 `data: null`로 콜백을 호출한다.
        ViaLinkSDK.onDeepLink { data ->
            val map: WritableMap? = data?.toWritableMap()
            if (listenerCount > 0) sendEvent("onDeepLink", map)
            else {
                pendingDeepLink = map
                hasPendingDeepLink = true
            }
        }
        // 디퍼드 콜백: SDK 3.0+ 시그니처 (data, error) — 항상 1회 호출
        // JS 측 emit 페이로드는 `{data, error}` 객체로 전달한다.
        ViaLinkSDK.onDeferredDeepLink { data, error ->
            val payload = Arguments.createMap()
            data?.let { payload.putMap("data", it.toWritableMap()) }
            error?.let { payload.putMap("error", it.toWritableMap()) }
            if (listenerCount > 0) sendEvent("onDeferredDeepLink", payload)
            else pendingDeferred = payload
        }

        currentActivity?.intent?.let { ViaLinkSDK.handleIntent(it) }
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
                    val result = ViaLinkSDK.payment.initiated(payArgs)
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

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
        // pending 이벤트 flush — 3.1.0부터 일반 진입(null payload)도 flush해야 한다.
        if (eventName == "onDeepLink" && hasPendingDeepLink) {
            sendEvent("onDeepLink", pendingDeepLink)   // null payload도 그대로 전달
            pendingDeepLink = null
            hasPendingDeepLink = false
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
    override fun onNewIntent(intent: android.content.Intent?) {
        intent?.let { ViaLinkSDK.handleIntent(it) }
    }
    override fun onActivityResult(activity: android.app.Activity?, requestCode: Int, resultCode: Int, data: android.content.Intent?) {}

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

// DeferredError → WritableMap (JS DeferredError 인터페이스와 키가 일치해야 함)
private fun DeferredError.toWritableMap(): WritableMap {
    val map = Arguments.createMap()
    map.putString("code", code)
    map.putString("message", message)
    httpStatus?.let { map.putInt("httpStatus", it) }
    map.putBoolean("retryable", retryable)
    return map
}
