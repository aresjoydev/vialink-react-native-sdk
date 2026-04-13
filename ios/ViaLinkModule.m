#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ViaLinkSDK, RCTEventEmitter)

RCT_EXTERN_METHOD(configure:(NSString *)apiKey
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(track:(NSString *)eventName
                  data:(NSDictionary *)data)

RCT_EXTERN_METHOD(createLink:(NSString *)path
                  data:(NSDictionary *)data
                  campaign:(NSString *)campaign
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
