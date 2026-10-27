import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://izu-san.com',
  vite: {
    build: {
      // 書体の小さな分割ファイルを base64 で CSS に埋め込まない。
      // 埋め込むと woff2 と woff の両方が CSS に入り、描画をブロックする CSS が 300KB になる。
      assetsInlineLimit: 0,
    },
  },
});
