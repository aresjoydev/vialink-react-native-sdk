# ViaLink React Native SDK Sample

이 프로젝트는 ViaLink React Native SDK의 샘플 앱입니다. (독립적으로 빌드 및 실행 가능한 형태입니다)

## 실행 방법

1. **의존성 설치**
   ```bash
   npm install
   # 혹은 yarn install
   ```

2. **iOS 빌드 (Mac 전용)**
   ```bash
   cd ios
   pod install
   cd ..
   npx react-native run-ios
   ```

3. **Android 빌드**
   ```bash
   npx react-native run-android
   ```

## 딥링크 연동 설정 가이드

실제 기기 테스트를 위해서는 호스트명 `vialink.app` 연동이 필요합니다.

### Android (`android/app/src/main/AndroidManifest.xml`)
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="vialink.app" />
</intent-filter>
```

### iOS
1. **Associated Domains** 추가: `applinks:vialink.app`
2. **`AppDelegate.mm`** 설정:
```objc
#import <React/RCTLinkingManager.h>

- (BOOL)application:(UIApplication *)application
   continueUserActivity:(NSUserActivity *)userActivity
     restorationHandler:(void(^)(NSArray<id<UIUserActivityRestoring>> * __nullable restorableObjects))restorationHandler
{
  return [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
}
```
