package com.vialink.reactnative

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vialink.sdk.ViaLinkSDK
import com.vialink.sdk.model.DeepLinkData
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

        ViaLinkSDK.onDeepLink { data ->
            val map = data.toWritableMap()
            if (listenerCount > 0) sendEvent("onDeepLink", map)
            else pendingDeepLink = map
        }
        ViaLinkSDK.onDeferredDeepLink { data ->
            val map = data.toWritableMap()
            if (listenerCount > 0) sendEvent("onDeferredDeepLink", map)
            else pendingDeferred = map
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
    fun createLink(path: String, data: ReadableMap?, campaign: String?, linkType: String, promise: Promise) {
        scope.launch {
            // linkType("dynamic" | "static") 을 native SDK에 전달.
            // Android core SDK가 linkType 인자를 지원하면 아래 호출에 linkType을 함께 넘긴다.
            val result = ViaLinkSDK.createLink(path, data?.toHashMap()?.mapValues { it.value as Any }, campaign)
            result.onSuccess { promise.resolve(it) }
            result.onFailure { promise.reject("CREATE_LINK_ERROR", it.message) }
        }
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
    return map
}
