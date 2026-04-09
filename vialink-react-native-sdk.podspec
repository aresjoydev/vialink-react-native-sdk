Pod::Spec.new do |s|
  s.name         = "vialink-react-native-sdk"
  s.version      = "2.0.8"
  s.summary      = "ViaLink Deep Link SDK for React Native"
  s.homepage     = "https://vialink.app"
  s.license      = "MIT"
  s.author       = "Aresjoy Inc."
  s.source       = { :git => "https://github.com/aresjoydev/vialink-react-native-sdk.git", :tag => s.version }
  s.platform     = :ios, '15.0'
  s.swift_version = '5.9'

  s.source_files = "ios/**/*.{swift,m}"
  s.vendored_frameworks = "ios/Frameworks/ViaLinkCore.xcframework"

  s.dependency "React-Core"
end
