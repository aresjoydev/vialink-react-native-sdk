import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ViaLinkSDK: NativeSDK } = NativeModules;
const emitter = new NativeEventEmitter(NativeSDK);

export interface DeepLinkData {
  path: string;
  params: Record<string, string>;
  shortCode?: string;
}

/**
 * ViaLink React Native SDK
 *
 * 네이티브 브릿지 기반 딥링크 라우팅, 디퍼드 딥링킹, 이벤트 추적을 제공합니다.
 * Android(.aar) 및 iOS(.xcframework) 네이티브 SDK를 호출합니다.
 *
 * ```typescript
 * // 초기화 (App.tsx)
 * await ViaLinkSDK.shared.configure('YOUR_API_KEY');
 *
 * // 딥링크 콜백
 * ViaLinkSDK.shared.onDeepLink((data) => {
 *   navigation.navigate(data.path, data.params);
 * });
 * ```
 */
export class ViaLinkSDK {
  private static _instance: ViaLinkSDK;
  private deepLinkSub: any;
  private deferredSub: any;

  private constructor() {}

  /// 싱글턴 인스턴스
  static get shared(): ViaLinkSDK {
    if (!this._instance) this._instance = new ViaLinkSDK();
    return this._instance;
  }

  /**
   * SDK 초기화 - 앱 최상위(App.tsx)에서 호출
   * @param apiKey 대시보드에서 발급받은 API Key
   */
  async configure(apiKey: string): Promise<void> {
    await NativeSDK.configure(apiKey);
  }

  /**
   * 딥링크 수신 콜백 등록
   * App Links / Universal Links로 앱이 열렸을 때 호출됩니다.
   */
  onDeepLink(callback: (data: DeepLinkData) => void): void {
    this.deepLinkSub?.remove();
    this.deepLinkSub = emitter.addListener('onDeepLink', callback);
  }

  /**
   * 디퍼드 딥링크 콜백 등록
   * 앱 첫 설치 후 실행 시 fingerprint 매칭으로 딥링크 데이터를 전달합니다.
   */
  onDeferredDeepLink(callback: (data: DeepLinkData) => void): void {
    this.deferredSub?.remove();
    this.deferredSub = emitter.addListener('onDeferredDeepLink', callback);
  }

  /**
   * 커스텀 이벤트 추적
   *
   * ```typescript
   * ViaLinkSDK.shared.track('purchase', { product_id: '123', revenue: 29900 });
   * ```
   */
  track(eventName: string, data?: Record<string, unknown>): void {
    NativeSDK.track(eventName, data ?? null);
  }

  /**
   * 앱 내에서 딥링크 생성
   *
   * ```typescript
   * const url = await ViaLinkSDK.shared.createLink('/product/123', { promo: 'FRIEND' }, 'referral');
   * ```
   */
  async createLink(
    path: string,
    data?: Record<string, unknown>,
    campaign?: string,
  ): Promise<string> {
    return NativeSDK.createLink(path, data ?? null, campaign ?? null);
  }

  /// SDK 정리 (앱 종료 또는 unmount 시 호출)
  destroy(): void {
    this.deepLinkSub?.remove();
    this.deferredSub?.remove();
  }
}
