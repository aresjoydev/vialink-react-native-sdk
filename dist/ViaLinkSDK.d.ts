export interface DeepLinkData {
    path: string;
    params: Record<string, string>;
    shortCode?: string;
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
export interface CreateLinkExtraOptions {
    iosUrl?: string;
    androidUrl?: string;
    webUrl?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    channel?: string;
    feature?: string;
    tags?: string[];
    expiresAt?: string;
}
export interface PaymentInitiatedResult {
    success: boolean;
    paymentEventId: string;
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
export declare class ViaLinkSDK {
    private static _instance;
    private deepLinkSub;
    private deferredSub;
    private constructor();
    static get shared(): ViaLinkSDK;
    /**
     * SDK 초기화 - 앱 최상위(App.tsx)에서 호출
     * @param apiKey 대시보드에서 발급받은 API Key
     */
    configure(apiKey: string): Promise<void>;
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
    onDeepLink(callback: (data: DeepLinkData | null) => void): void;
    /**
     * 디퍼드 딥링크 콜백 등록
     *
     * 앱 진입 시 매번 1회 호출됩니다 (3.2.0+).
     * - 첫 실행: `/v1/open` 매칭 결과 결정 즉시 호출. 5초 안에 결과가 결정되지 않으면 `error.code === 'timeout'`.
     * - 비첫 실행: `/v1/open` 호출 없이 즉시 `(null, null)` (organic install과 동일 의미).
     *
     * ```typescript
     * ViaLinkSDK.shared.onDeferredDeepLink((data, error) => {
     *   if (error) {
     *     // 매칭 실패 (timeout/network/server_error 등) — 일반 진입
     *     return;
     *   }
     *   if (!data) {
     *     // organic install 또는 비첫 실행 — 일반 진입
     *     return;
     *   }
     *   navigation.navigate(data.path, data.params);
     * });
     * ```
     *
     * 콜백은 멱등성을 보장합니다 (앱 프로세스당 총 1회 호출).
     * 첫 실행에서 `error.retryable === true` 인 실패가 나오면 다음 앱 실행에서 자동 재시도되며,
     * 그 경우 사용자가 앱을 사용 중일 때 콜백이 도착할 수 있습니다.
     */
    onDeferredDeepLink(callback: (data: DeepLinkData | null, error: DeferredError | null) => void): void;
    /**
     * 커스텀 이벤트 추적
     *
     * ```typescript
     * ViaLinkSDK.shared.track('purchase', { product_id: '123', revenue: 29900 });
     * ```
     */
    track(eventName: string, data?: Record<string, unknown>): void;
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
    createLink(path: string, data?: Record<string, unknown>, campaign?: string, linkType?: 'dynamic' | 'static', options?: CreateLinkExtraOptions): Promise<string>;
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
    readonly payment: {
        /**
         * 결제 시도 기록 (POST /v1/payments/initiated).
         * 결제창을 띄우기 직전에 호출합니다. 즉시 전송 (배치 X).
         */
        initiated: (args: PaymentInitiatedArgs) => Promise<PaymentInitiatedResult>;
    };
    destroy(): void;
}
