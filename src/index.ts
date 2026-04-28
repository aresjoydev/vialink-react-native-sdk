/// ViaLink React Native SDK (v2.0 — 네이티브 브릿지)
///
/// Android(.aar) + iOS(.xcframework) 네이티브 SDK를 통해
/// 딥링크 라우팅, 디퍼드 딥링킹, 이벤트 추적을 제공합니다.
///
/// ```typescript
/// import { ViaLinkSDK } from 'vialink-react-native-sdk';
///
/// await ViaLinkSDK.shared.configure('YOUR_API_KEY');
/// ViaLinkSDK.shared.onDeepLink((data) => { ... });
/// ViaLinkSDK.shared.track('purchase', { revenue: 29900 });
/// ```

export { ViaLinkSDK } from './ViaLinkSDK';
export type {
  DeepLinkData,
  PaymentInitiatedArgs,
  PaymentInitiatedResult,
} from './ViaLinkSDK';
