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
    ViaLinkSDK.init('a47b2617f7b650ca44c2e0665264e9408b309eb03cd9220d3c8644b839482eeb');
    showToast('SDK 초기화 완료');

    // 딥링크 콜백
    ViaLinkSDK.onDeepLink((data) => {
      if (data) {
        showResultDialog('딥링크 진입', `경로: ${data.path}\n파라미터: ${JSON.stringify(data.params)}`);
      } else {
        showResultDialog('일반 진입', 'data == null');
      }
    });

    // 디퍼드 딥링크 콜백
    ViaLinkSDK.onDeferredDeepLink((data, error) => {
      if (error) {
        showResultDialog('디퍼드 에러', JSON.stringify(error));
      } else if (!data) {
        showResultDialog('디퍼드 딥링크', '매칭 결과 없음 (organic install)');
      } else {
        showResultDialog('디퍼드 딥링크', `경로: ${data.path}`, data.linkId);
      }
    });
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
          <ActionButton title="회원가입 이벤트 전송" onPress={() => {
            // ViaLinkSDK.trackEvent('signup');
            showToast('✅ 회원가입 이벤트 전송 완료');
          }} />
          <ActionButton title="구매 이벤트 전송" onPress={() => {
            // ViaLinkSDK.trackEvent('purchase', { revenue: 100 });
            showToast('✅ 구매 이벤트 전송 완료');
          }} />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="2. 링크 생성" />
          <ActionButton title="딥링크 생성 (referral)" onPress={() => {
            showToast('🔗 딥링크 생성 요청 중...');
            setTimeout(() => {
              showResultDialog('링크 생성 성공', 'shortUrl: https://vialink.app/abc', 'https://vialink.app/abc');
            }, 1000);
          }} />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="3. 데이터 가져오기" />
          <ActionButton title="딥링크 가져오기 (Sync)" onPress={() => {
            showResultDialog('딥링크 (Sync)', '캐시된 데이터 없음');
          }} />
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <SectionTitle title="4. 결제 추적" />
          <ActionButton title="결제 시도 (initiated)" onPress={() => {
            showToast('💳 결제 시도 요청 중...');
            setTimeout(() => {
              showResultDialog('결제 추적', 'success, paymentEventId: 123');
            }, 1000);
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
