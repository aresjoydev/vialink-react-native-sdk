import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'es2020',
  outDir: 'dist',
  clean: true,
  minify: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,

  // React Native는 번들에 포함하지 않음
  external: [
    'react-native',
  ],

  // .d.ts는 tsc가 별도 생성하므로 tsup에서는 생략
  dts: false,
});
