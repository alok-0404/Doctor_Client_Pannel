import type { Server as SocketServerType } from "socket.io";

let io: SocketServerType | null = null;

export const setIo = (instance: SocketServerType): void => {
  io = instance;
};

export const getIo = (): SocketServerType | null => io;
