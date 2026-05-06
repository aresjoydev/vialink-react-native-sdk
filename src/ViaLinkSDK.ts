import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ViaLinkSDK: NativeSDK } = NativeModules;
const emitter = new NativeEventEmitter(NativeSDK);

export interface DeepLinkData {
  path: string;
  params: Record<string, string>;
  shortCode?: string;
  /// 어트리뷰션용 numeric link id (네이티브 SDK가 디퍼드/딥링크 매칭 후 전달).
  /// 네이티브 SDK가 결제 시도에 자동 첨부하므로, JS 측 결제 호출 시 별도 지정 불필요.
  linkId?: number;
}

/**
 * 디퍼드 매칭 실패 정보
 *
 * `onDeferredDeepLink((data, error) => ...)` 콜백의 두 번째 인자로 전달된다.
 * `data == null && error == null`이면 매칭 결과가 "없음"(organic install)이다.
 *
 * - `code`:
 *   - `'timeout'`: 5초 데드라인 만료
 *   - `'network'`: DNS 실패, 연결 거부 등 (3회 재시도 모두 실패)
 *   - `'server_error'`: HTTP 5xx (3회 재시도 모두 실패)
 *   - `'invalid_response'`: 응답 JSON 파싱 실패
 *   - `'unknown'`: 그 외 모든 예외
 * - `retryable`이 true면 SDK가 다음 앱 실행에서 자동으로 다시 시도한다.
 */
export interface DeferredError {
  code: 'timeout' | 'network' | 'server_error' | 'invalid_response' | 'unknown';
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

/// native event payload — `onDeferredDeepLink` emit 시 native가 전달하는 raw 객체
interface DeferredEventPayload {
  data?: DeepLinkData | null;
  error?: DeferredError | null;
}

/**
 * 결제 시도 이벤트 입력 인자.
 *
 * - orderId: 운영자가 발급하는 주문번호 (1~100자, 영문/숫자/하이픈/언더스코어)
 * - amount: 결제 금액 (통화 단위 그대로, > 0)
 * - currency: ISO 4217 통화 코드 (예: "KRW", "USD", "JPY")
 * - linkId: (옵션) 사용자가 진입한 링크 id
 * - paymentMethod: (옵션) 결제 수단 식별자 (예: "card", "kakao_pay")
 * - metadata: (옵션) 운영자 자유 메타데이터 (iOS 호환을 위해 string-only)
 */
export interface PaymentInitiatedArgs {
  orderId: string;
  amount: number;
  currency: string;
  linkId?: number;
  paymentMethod?: string;
  metadata?: Record<string, string>;
}

/**
 * 결제 시도 응답.
 *
 * - success: 서버에서 성공 처리되었는지 여부
 * - paymentEventId: 서버에서 발급한 결제 이벤트 ID (문자열로 정규화)
 */
/// `createLink()`의 5번째 인자 — 폴백 URL, OG 메타태그, 채널/태그 등 부가 옵션.
/// 서버 `/api/links`가 받는 모든 옵션 필드를 그대로 노출한다. 모두 선택.
export interface CreateLinkExtraOptions {
  /// iOS App Store 폴백 URL
  iosUrl?: string;
  /// Android Play Store 폴백 URL
  androidUrl?: string;
  /// 웹 폴백 URL
  webUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  /// 유입 채널 (`email`, `sms`, `social` 등)
  channel?: string;
  /// 기능 태그 (`product_share` 등)
  feature?: string;
  tags?: string[];
  /// 만료일 (ISO 8601, 예: `'2026-12-31T23:59:59Z'`)
  expiresAt?: string;
}

export interface PaymentInitiatedResult {
  success: boolean;
  paymentEventId: string;
}

/// orderId 형식 검증 (1~100자, 영문/숫자/하이픈/언더스코어)
const ORDER_ID_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

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
   * 딥링크 수신 콜백 등록 (3.1.0+).
   *
   * 네이티브 SDK가 진입 알림(`handleIntent`/`handleUniversalLink`/`notifyAppLaunch`)을 처리할 때 항상 1회 호출됩니다.
   * - App Links / Universal Links 진입이면 매칭된 [DeepLinkData]가 전달됩니다.
   * - 일반 진입(아이콘 탭 등)이면 `null`이 전달됩니다.
   *
   * ```typescript
   * ViaLinkSDK.shared.onDeepLink((data) => {
   *   if (!data) {
   *     // 일반 진입 — 기본 라우트 유지
   *     return;
   *   }
   *   navigation.navigate(data.path, data.params);
   * });
   * ```
   */
  onDeepLink(callback: (data: DeepLinkData | null) => void): void {
    this.deepLinkSub?.remove();
    this.deepLinkSub = emitter.addListener('onDeepLink', (event: DeepLinkData | null | undefined) => {
      // 네이티브 모듈은 일반 진입 시 null payload, link 진입 시 DeepLinkData를 전달한다.
      callback(event ?? null);
    });
  }

  /**
   * 디퍼드 딥링크 콜백 등록
   *
   * 앱 첫 실행 시 매칭 결과가 결정되는 즉시 항상 1회 호출됩니다.
   * 5초 안에 결과가 결정되지 않으면 `error.code === 'timeout'`으로 호출됩니다.
   *
   * ```typescript
   * ViaLinkSDK.shared.onDeferredDeepLink((data, error) => {
   *   if (error) {
   *     // 매칭 실패 (timeout/network/server_error 등) — 일반 진입
   *     return;
   *   }
   *   if (!data) {
   *     // organic install — 일반 진입
   *     return;
   *   }
   *   navigation.navigate(data.path, data.params);
   * });
   * ```
   *
   * 콜백은 멱등성을 보장합니다 (총 1회 호출).
   * `error.retryable`이 true면 다음 앱 실행에서 자동 재시도되며, 그 경우 사용자가 앱을 사용 중일 때 콜백이 도착할 수 있습니다.
   */
  onDeferredDeepLink(
    callback: (data: DeepLinkData | null, error: DeferredError | null) => void,
  ): void {
    this.deferredSub?.remove();
    this.deferredSub = emitter.addListener(
      'onDeferredDeepLink',
      (event: DeferredEventPayload) => {
        callback(event?.data ?? null, event?.error ?? null);
      },
    );
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
   * - `dynamic` (기본값): 클릭할 때마다 통계·어트리뷰션이 집계되는 동적 링크
   * - `static`: 고정된 목적지 URL만 제공하는 정적 링크 (통계 미집계)
   *
   * ```typescript
   * // 동적 링크 (기본값 — 생략 가능)
   * const url = await ViaLinkSDK.shared.createLink('/product/123', { promo: 'FRIEND' }, 'referral');
   *
   * // 정적 링크 (통계 미집계)
   * const url = await ViaLinkSDK.shared.createLink('/product/123', { promo: 'FRIEND' }, 'referral', 'static');
   * ```
   */
  async createLink(
    path: string,
    data?: Record<string, unknown>,
    campaign?: string,
    linkType: 'dynamic' | 'static' = 'static',
    options?: CreateLinkExtraOptions,
  ): Promise<string> {
    return NativeSDK.createLink(
      path,
      data ?? null,
      campaign ?? null,
      linkType,
      options ?? null,
    );
  }

  /**
   * 결제 추적 namespace.
   *
   * `succeeded`/`failed`는 서버-투-서버(S2S) 엔드포인트라 클라이언트 SDK에서는 노출하지 않습니다.
   *
   * ```typescript
   * const result = await ViaLinkSDK.shared.payment.initiated({
   *   orderId: 'ORD-2026-0001',
   *   amount: 19900,
   *   currency: 'KRW',
   *   paymentMethod: 'card',
   * });
   * // result.success === true, result.paymentEventId === '123'
   * ```
   */
  readonly payment = {
    /**
     * 결제 시도 기록 (POST /v1/payments/initiated).
     * 결제창을 띄우기 직전에 호출합니다. 즉시 전송 (배치 X).
     */
    initiated: async (args: PaymentInitiatedArgs): Promise<PaymentInitiatedResult> => {
      // 입력 검증 (native에서도 검증하지만 빠른 실패를 위해 클라이언트에서도 1차 검증)
      if (!args || typeof args !== 'object') {
        throw new Error('args가 필요합니다.');
      }
      if (typeof args.orderId !== 'string' || !ORDER_ID_REGEX.test(args.orderId)) {
        throw new Error('order_id 형식이 올바르지 않습니다 (1~100자, 영문/숫자/하이픈/언더스코어).');
      }
      if (typeof args.amount !== 'number' || !Number.isFinite(args.amount) || args.amount <= 0) {
        throw new Error('amount는 0보다 큰 숫자여야 합니다.');
      }
      if (typeof args.currency !== 'string' || args.currency.trim().length === 0) {
        throw new Error('currency가 필요합니다.');
      }

      const result = await NativeSDK.paymentInitiated({
        orderId: args.orderId,
        amount: args.amount,
        currency: args.currency.trim().toUpperCase(),
        linkId: args.linkId ?? null,
        paymentMethod: args.paymentMethod ?? null,
        metadata: args.metadata ?? null,
      });
      return {
        success: !!result?.success,
        paymentEventId: String(result?.paymentEventId ?? ''),
      };
    },
  };

  /// SDK 정리 (앱 종료 또는 unmount 시 호출)
  destroy(): void {
    this.deepLinkSub?.remove();
    this.deferredSub?.remove();
  }
}
