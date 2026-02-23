import http from "http";

import { Server as SocketServer } from "socket.io";

import app from "./app";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { Doctor } from "./models/Doctor";
import { setIo } from "./socket";

const startServer = async (): Promise<void> => {
  await connectDatabase();

  const server = http.createServer(app);

  const io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          origin === "http://localhost:3000" ||
          origin === "http://localhost:5173" ||
          origin.endsWith(".trycloudflare.com")
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"), false);
        }
      },
    },
  });

  io.on("connection", (socket) => {
    let doctorId = socket.handshake.query.doctorId;
    if (doctorId) {
      doctorId = Array.isArray(doctorId) ? doctorId[0] : doctorId;
      socket.join(`doctor:${doctorId}`);
      // If this user is an assistant, also join room for their doctor's availability updates
      void Doctor.findById(doctorId)
        .select("createdByDoctorId")
        .lean()
        .then((user) => {
          const createdBy = (user as any)?.createdByDoctorId?.toString();
          if (createdBy) {
            socket.join(`assistants-of-doctor:${createdBy}`);
          }
        });
    }
  });

  setIo(io);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.port}`);
  });
};

void startServer();

