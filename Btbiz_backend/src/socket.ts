import type { Server as SocketServerType } from "socket.io";

let io: SocketServerType | null = null;

export const setIo = (instance: SocketServerType): void => {
  io = instance;
};

export const getIo = (): SocketServerType | null => io;

/** Room joined by every assistant of one hospital (tenant). */
export const hospitalDeskRoom = (tenantId: unknown): string =>
  `hospital-desk:${typeof tenantId === "string" && tenantId ? tenantId : "none"}`;
