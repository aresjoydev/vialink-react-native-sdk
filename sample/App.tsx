import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ToastAndroid,
  Platform,
  Clipboard,
} from 'react-native';
import { ViaLinkSDK } from 'vialink-react-native-sdk';

const showToast = (msg: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('Toast (iOS)', msg); // iOS에는 Toast가 없어 임시 Alert 사용
  }
};

const showResultDialog = (title: string, message: string, copyableText?: string) => {
  const buttons: any[] = [{ text: '확인', style: 'cancel' }];
  if (copyableText) {
    buttons.push({
      text: '복사하기',
      onPress: () => {
        Clipboard.setString(copyableText);
        showToast('📋 링크가 복사되었습니다');
      },
    });
  }
  Alert.alert(title, message, buttons);
};

function App(): React.JSX.Element {
  useEffect(() => {
    // SDK 초기화
    ViaLinkSDK.shared.configure('a47b2617f7b650ca44c2e0665264e9408b309eb03cd9220d3c8644b839482eeb');
    showToast('SDK 초기화 완료');

    // 딥링크 콜백
    ViaLinkSDK.shared.onDeepLink((data) => {
      if (data) {
        showResultDialog('딥링크 진입', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}`);
      } else {
        showResultDialog('일반 진입', 'data == null');
      }
    });

    // 디퍼드 딥링크 콜백
    ViaLinkSDK.shared.onDeferredDeepLink((data, error) => {
      if (error) {
        showResultDialog('디퍼드 에러', `에러: ${error.message}\n재시도 가능: ${error.retryable}`);
      } else if (!data) {
        showResultDialog('디퍼드 딥링크', '매칭 결과 없음 (organic install)');
      } else {
        showResultDialog('디퍼드 딥링크 매칭!', `경로: ${data.path}\nlinkId: ${data.linkId}`);
      }
    });

    return () => {
      ViaLinkSDK.shared.destroy();
    };
  }, []);

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  const ActionButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ViaLink SDK Sample</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="1. 이벤트 추적" />
          <ActionButton title="장바구니 담기 이벤트 전송" onPress={() => {
            try {
              ViaLinkSDK.shared.track('add_to_cart', {
                product_id: 'P-10029',
                price: 59000,
              });
              showToast('✅ 장바구니 담기 이벤트 전송 완료');
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
          <ActionButton title="구매 이벤트 전송" onPress={() => {
            try {
              ViaLinkSDK.shared.track('purchase', { revenue: 100 });
              showToast('✅ 구매 이벤트 전송 완료');
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="2. 링크 생성" />
          <ActionButton title="동적 딥링크 생성" onPress={async () => {
            try {
              const url = await ViaLinkSDK.shared.createLink(
                '/promo/spring24',
                { discount: '20%' },
                'spring_campaign',
                'dynamic'
              );
              showResultDialog('동적 링크 생성 성공', `URL: ${url}`, url);
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
          <ActionButton title="정적 딥링크 생성" onPress={async () => {
            try {
              const url = await ViaLinkSDK.shared.createLink(
                '/static/notice/123',
                {},
                undefined,
                'static'
              );
              showResultDialog('정적 링크 생성 성공', `URL: ${url}`, url);
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="3. 결제 추적" />
          <ActionButton title="결제 시도 (initiated)" onPress={async () => {
            try {
              const result = await ViaLinkSDK.shared.payment.initiated({
                orderId: 'ORD-' + new Date().getTime(),
                amount: 19900,
                currency: 'KRW',
                paymentMethod: 'card',
                metadata: { user_tier: 'gold' },
              });
              showResultDialog('결제 시도 결과', `성공: ${result.success}\nID: ${result.paymentEventId}`);
            } catch (e: any) {
              Alert.alert('결제 전송 실패', e.message);
            }
          }} />
        </View>

        <View style={styles.section}>
          <SectionTitle title="4. Pull API" />
          <ActionButton title="디퍼드 데이터 즉시 조회 (Sync)" onPress={async () => {
            try {
              const data = await ViaLinkSDK.shared.getDeferredLinkData();
              if (data) {
                showResultDialog('디퍼드 (Sync)', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}\nlinkId: ${data.linkId}`);
              } else {
                showResultDialog('디퍼드 (Sync)', '캐시된 데이터 없음');
              }
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
          <ActionButton title="디퍼드 데이터 대기 (Await)" onPress={async () => {
            showToast('⏳ 디퍼드 데이터 대기 중...');
            try {
              const data = await ViaLinkSDK.shared.awaitDeferredLinkData();
              if (data) {
                showResultDialog('디퍼드 (Await)', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}\nlinkId: ${data.linkId}`);
              } else {
                showResultDialog('디퍼드 (Await)', '매칭 결과 없음 (organic install)');
              }
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
          <ActionButton title="딥링크 데이터 즉시 조회 (Sync)" onPress={async () => {
            try {
              const data = await ViaLinkSDK.shared.getDeepLinkData();
              if (data) {
                showResultDialog('딥링크 (Sync)', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}`);
              } else {
                showResultDialog('딥링크 (Sync)', '캐시된 데이터 없음');
              }
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
          <ActionButton title="딥링크 데이터 수신 대기 (Await)" onPress={async () => {
            showToast('⏳ 딥링크 데이터 대기 중 (최대 3초)...');
            try {
              const data = await ViaLinkSDK.shared.awaitDeepLinkData();
              if (data) {
                showResultDialog('딥링크 (Await)', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}`);
              } else {
                showResultDialog('딥링크 (Await)', '수신된 딥링크 없음 (타임아웃)');
              }
            } catch (e: any) {
              Alert.alert('에러', e.message);
            }
          }} />
        </View>

      </ScrollView>
    </SafeAreaView>
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
    marginVertical: 10,
  },
});

export default App;
