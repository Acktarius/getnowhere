#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(GnhBackgroundSync, RCTEventEmitter)

RCT_EXTERN_METHOD(registerWebViewInjector)
RCT_EXTERN_METHOD(clearWebViewInjector)
RCT_EXTERN_METHOD(resolveBackgroundSync:(NSString *)requestId
                  outcome:(NSString *)outcome)

@end
