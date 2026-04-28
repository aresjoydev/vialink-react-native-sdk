# ViaLink React Native SDK

ViaLink 딥링크 인프라 서비스를 위한 React Native SDK입니다.
v2.0부터 네이티브 브릿지 방식(Android .aar + iOS .xcframework)으로 동작합니다.

## 요구사항

- React Native 0.73+
- Android: minSdk 24, compileSdk 34
- iOS: 15.0+, Swift 5.9+

## 설치

```bash
npm install vialink-react-native-sdk
```

### iOS 추가 설정

```bash
cd ios && pod install
```

### Android 추가 설정

`android/app/build.gradle`에서 설정 확인:

```groovy
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 24
    }
}
```

`MainApplication.kt` (또는 `.java`)에 패키지 등록:

```kotlin
import com.vialink.reactnative.ViaLinkPackage

override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    packages.add(ViaLinkPackage())
    return packages
}
```

## 사용법

```typescript
import { ViaLinkSDK } from 'vialink-react-native-sdk';

// 초기화 (App.tsx)
await ViaLinkSDK.shared.configure('YOUR_API_KEY');

// 딥링크 수신 콜백
ViaLinkSDK.shared.onDeepLink((data) => {
  console.log('딥링크:', data.path, data.params);
  navigation.navigate(data.path, data.params);
});

// 디퍼드 딥링크 (앱 첫 설치 후 실행 시)
ViaLinkSDK.shared.onDeferredDeepLink((data) => {
  console.log('디퍼드 딥링크:', data.path);
  navigation.navigate(data.path, data.params);
});

// 이벤트 추적
ViaLinkSDK.shared.track('purchase', { product_id: '123', revenue: 29900 });

// 딥링크 생성
const url = await ViaLinkSDK.shared.createLink('/product/123', { promo: 'FRIEND' }, 'referral');

// 정리 (앱 종료 시)
ViaLinkSDK.shared.destroy();
```

## 문서

- [SDK 가이드](https://docs.vialink.app)
