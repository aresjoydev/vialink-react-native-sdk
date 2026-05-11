const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// `file:../` 로 연결된 로컬 SDK를 Metro가 추적할 수 있도록 부모 디렉토리도 watch 대상에 포함하고
// symlink 해석을 활성화한다. (Metro 0.80+ unstable_enableSymlinks 지원)
const localSdkRoot = path.resolve(__dirname, '..');

const config = {
  watchFolders: [localSdkRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(localSdkRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
