import { io } from 'socket.io-client';
import { API_BASE, getAuthToken } from './api';

let socket = null;

export function connectSocket() {
  const token = getAuthToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  socket = io(API_BASE, { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
