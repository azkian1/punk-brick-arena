import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
server.printUrls();
