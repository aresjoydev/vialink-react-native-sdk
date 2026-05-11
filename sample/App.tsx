import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {ViaLinkSDK} from 'vialink-react-native-sdk';

const SAMPLE_API_KEY =
  'a47b2617f7b650ca44c2e0665264e9408b309eb03cd9220d3c8644b839482eeb';

// 모듈 스코프 toast 콜백 — useEffect 내부 콜백에서도 사용 가능하도록 래퍼 제공
let _toastImpl: ((msg: string) => void) | null = null;

const showToast = (msg: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    _toastImpl?.(msg);
  }
};

const showResultDialog = (
  title: string,
  message: string,
  copyableText?: string,
) => {
  const buttons: any[] = [];
  if (copyableText) {
    buttons.push({
      text: '복사하기',
      onPress: () => {
        Clipboard.setString(copyableText);
        showToast('📋 링크가 복사되었습니다');
      },
    });
  }
  buttons.push({text: '확인', style: 'cancel'});
  Alert.alert(title, message, buttons);
};

// ──────────────────────────────────────────────
// iOS용 비-block Toast 컴포넌트
// ──────────────────────────────────────────────

const IosToast: React.FC<{onMount: (show: (msg: string) => void) => void}> = ({
  onMount,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onMount((msg: string) => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
      setMessage(msg);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
      dismissTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => setMessage(null));
      }, 1500);
    });
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [onMount, opacity]);

  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, {opacity}]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

// ──────────────────────────────────────────────
// App
// ──────────────────────────────────────────────

function App(): React.JSX.Element {
  useEffect(() => {
    // SDK 초기화 (spec §2.1)
    ViaLinkSDK.shared.configure(SAMPLE_API_KEY);
    showToast('SDK 초기화 완료');

    // 콜백 등록 (spec §2.2 / §2.3)
    ViaLinkSDK.shared.onDeepLink(data => {
      if (data) {
        showResultDialog(
          '딥링크 진입',
          `path: ${data.path}\nparams: ${JSON.stringify(data.params)}`,
          data.shortCode,
        );
      } else {
        showResultDialog('일반 진입', 'data == null');
      }
    });

    ViaLinkSDK.shared.onDeferredDeepLink((data, error) => {
      if (error) {
        showResultDialog(
          '디퍼드 매칭 실패',
          `code: ${error.code}\nmessage: ${error.message}\nretryable: ${error.retryable}`,
        );
      } else if (!data) {
        showResultDialog('디퍼드 딥링크', '매칭 결과 없음 (organic install)');
      } else {
        showResultDialog(
          '디퍼드 딥링크 매칭',
          `path: ${data.path}\nlinkId: ${data.linkId}\nparams: ${JSON.stringify(data.params)}`,
          data.shortCode,
        );
      }
    });

    return () => {
      ViaLinkSDK.shared.destroy();
    };
  }, []);

  // ──────────────────────────────────────────────
  // Section 1: 이벤트 추적 (spec §3.3 표 1)
  // ──────────────────────────────────────────────

  const onSignup = () => {
    try {
      ViaLinkSDK.shared.track('signup');
      showToast('✅ 회원가입 이벤트 전송 완료');
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  const onPurchase = () => {
    try {
      ViaLinkSDK.shared.track('purchase', {
        product_id: 'PROD-001',
        revenue: 29900,
        currency: 'KRW',
      });
      showToast('✅ 구매 이벤트 전송 완료');
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  const onAddToCart = () => {
    try {
      ViaLinkSDK.shared.track('add_to_cart', {product_id: 'PROD-001'});
      showToast('✅ 장바구니 추가 이벤트 전송 완료');
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  // ──────────────────────────────────────────────
  // Section 2: 링크 생성
  // ──────────────────────────────────────────────

  const onCreateDynamicLink = async () => {
    showToast('🔗 동적 링크 생성 요청 중…');
    try {
      const url = await ViaLinkSDK.shared.createLink(
        '/product/12345',
        {source: 'rn_sample'},
        'referral',
        'dynamic',
      );
      showResultDialog(
        '링크 생성 성공',
        `type: dynamic\nurl: ${url}`,
        url,
      );
    } catch (e: any) {
      Alert.alert('링크 생성 실패', e.message);
    }
  };

  const onCreateStaticLink = async () => {
    showToast('🔗 정적 링크 생성 요청 중…');
    try {
      const url = await ViaLinkSDK.shared.createLink(
        '/static/notice/123',
        {},
        undefined,
        'static',
      );
      showResultDialog(
        '링크 생성 성공',
        `type: static\nurl: ${url}`,
        url,
      );
    } catch (e: any) {
      Alert.alert('링크 생성 실패', e.message);
    }
  };

  // ──────────────────────────────────────────────
  // Section 3: Pull API (spec §3.3 표 3)
  // ──────────────────────────────────────────────

  const formatLinkData = (label: string, data: any) => {
    if (!data) return `${label}: 캐시/수신 데이터 없음 (null)`;
    const parts = [
      `path: ${data.path}`,
      data.shortCode ? `shortCode: ${data.shortCode}` : null,
      data.linkId != null ? `linkId: ${data.linkId}` : null,
      `params: ${JSON.stringify(data.params)}`,
    ].filter(Boolean);
    return parts.join('\n');
  };

  const onSyncDeepLink = async () => {
    try {
      const data = await ViaLinkSDK.shared.getDeepLinkData();
      showResultDialog('딥링크 (Sync)', formatLinkData('result', data), data?.shortCode);
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  const onAwaitDeepLink = async () => {
    showToast('⏳ 딥링크 대기 중…');
    try {
      const data = await ViaLinkSDK.shared.awaitDeepLinkData();
      showResultDialog('딥링크 (Await)', formatLinkData('result', data), data?.shortCode);
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  const onSyncDeferred = async () => {
    try {
      const data = await ViaLinkSDK.shared.getDeferredLinkData();
      showResultDialog('디퍼드 (Sync)', formatLinkData('result', data), data?.shortCode);
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  const onAwaitDeferred = async () => {
    showToast('⏳ 디퍼드 매칭 대기 중…');
    try {
      const data = await ViaLinkSDK.shared.awaitDeferredLinkData();
      showResultDialog('디퍼드 (Await)', formatLinkData('result', data), data?.shortCode);
    } catch (e: any) {
      Alert.alert('에러', e.message);
    }
  };

  // ──────────────────────────────────────────────
  // Section 4: 결제 추적
  // ──────────────────────────────────────────────

  const onPaymentInitiated = async () => {
    showToast('💳 결제 시도 요청 중…');
    const orderId = `ORDER-${Date.now()}`;
    try {
      const result = await ViaLinkSDK.shared.payment.initiated({
        orderId,
        amount: 29900,
        currency: 'KRW',
        paymentMethod: 'card',
        metadata: {user_tier: 'gold', channel: 'rn_sample'},
      });
      showResultDialog(
        '결제 시도 결과',
        `success: ${result.success}\npaymentEventId: ${result.paymentEventId}\norderId: ${orderId}`,
      );
    } catch (e: any) {
      showResultDialog('결제 시도 실패', e.message);
    }
  };

  // ──────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────

  const SectionTitle = ({title}: {title: string}) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  const ActionButton = ({
    title,
    onPress,
  }: {
    title: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaProvider style={{flex: 1}}>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ViaLink SDK Sample</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="1. 이벤트 추적" />
          <ActionButton title="회원가입 이벤트 전송" onPress={onSignup} />
          <ActionButton title="구매 이벤트 전송" onPress={onPurchase} />
          <ActionButton
            title="장바구니 추가 이벤트 전송"
            onPress={onAddToCart}
          />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="2. 링크 생성" />
          <ActionButton
            title="딥링크 생성 (referral, dynamic)"
            onPress={onCreateDynamicLink}
          />
          <ActionButton
            title="정적 링크 생성 (notice, static)"
            onPress={onCreateStaticLink}
          />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="3. 데이터 가져오기 (Pull API)" />
          <ActionButton title="딥링크 가져오기 (Sync)" onPress={onSyncDeepLink} />
          <ActionButton title="딥링크 대기 (Async)" onPress={onAwaitDeepLink} />
          <ActionButton title="디퍼드 딥링크 (Sync)" onPress={onSyncDeferred} />
          <ActionButton
            title="디퍼드 딥링크 대기 (Async)"
            onPress={onAwaitDeferred}
          />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="4. 결제 추적" />
          <ActionButton
            title="결제 시도 (initiated)"
            onPress={onPaymentInitiated}
          />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="정보" />
          <Text style={styles.infoText}>
            • 딥링크/디퍼드 결과는 AlertDialog로 표시됩니다.
          </Text>
          <Text style={styles.infoText}>• 콘솔 로그 태그: [ViaLink]</Text>
          <Text style={styles.infoText}>
            • 이벤트는 30초마다 배치 전송됩니다.
          </Text>
        </View>
      </ScrollView>

      {Platform.OS === 'ios' && (
        <IosToast
          onMount={showFn => {
            _toastImpl = showFn;
          }}
        />
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  section: {
    padding: 20,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#374151',
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default App;
