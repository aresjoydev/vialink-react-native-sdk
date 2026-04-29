export interface DeepLinkData {
    path: string;
    params: Record<string, string>;
    shortCode?: string;
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
     * 딥링크 수신 콜백 등록
     * App Links / Universal Links로 앱이 열렸을 때 호출됩니다.
     */
    onDeepLink(callback: (data: DeepLinkData) => void): void;
    /**
     * 디퍼드 딥링크 콜백 등록
     * 앱 첫 설치 후 실행 시 fingerprint 매칭으로 딥링크 데이터를 전달합니다.
     */
    onDeferredDeepLink(callback: (data: DeepLinkData) => void): void;
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
    createLink(path: string, data?: Record<string, unknown>, campaign?: string, linkType?: 'dynamic' | 'static'): Promise<string>;
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
