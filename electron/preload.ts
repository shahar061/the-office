import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('office', {
  ping: () => 'pong',
});