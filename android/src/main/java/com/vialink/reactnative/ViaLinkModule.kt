package com.vialink.reactnative

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vialink.sdk.ViaLinkSDK
import com.vialink.sdk.model.DeepLinkData
import kotlinx.coroutines.*

class ViaLinkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {

    companion object {
        const val WRAPPER_VERSION = "2.0.5"
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
    fun createLink(path: String, data: ReadableMap?, campaign: String?, promise: Promise) {
        scope.launch {
            val result = ViaLinkSDK.createLink(path, data?.toHashMap()?.mapValues { it.value as Any }, campaign)
            result.onSuccess { promise.resolve(it) }
            result.onFailure { promise.reject("CREATE_LINK_ERROR", it.message) }
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
