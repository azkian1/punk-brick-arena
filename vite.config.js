import { defineConfig } from 'vite';
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from './scripts/security-policy.mjs';

export default defineConfig({
  build: { sourcemap: false },
  preview: { host: '127.0.0.1', headers: SECURITY_HEADERS },
  plugins: [{
    name: 'production-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      }],
    },
  }],
});
