import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Workspace from "./models/workspace.js";

let io;

export const initSocket = (httpServer) => {
  const origins = (process.env.CLIENT_URLS || "http://localhost:5173").split(",").map((s) => s.trim());

  io = new Server(httpServer, {
    cors: { origin: origins, methods: ["GET", "POST"], credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      if (!mongoose.isValidObjectId(decoded?.userId)) return next(new Error("Invalid token"));
      socket.userId = String(decoded.userId);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on("join-workspace", async (workspaceId, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      try {
        if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId))
          return ack({ success: false, message: "Invalid workspace ID" });

        const isMember = await Workspace.exists({            // <-- the await
          _id: workspaceId,
          "members.user": socket.userId,
        });
        if (!isMember) return ack({ success: false, message: "Workspace not found or access denied" });

        await socket.join(`workspace:${workspaceId}`);
        ack({ success: true });
      } catch (err) {
        console.error("join-workspace error:", err);
        ack({ success: false, message: "Could not join workspace" });
      }
    });

    socket.on("leave-workspace", async (workspaceId, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      if (typeof workspaceId === "string") await socket.leave(`workspace:${workspaceId}`);
      ack({ success: true });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.IO has not been initialized");
  return io;
};

export const safeEmit = (room, event, payload) => {
  try {
    getIO().to(room).emit(event, payload);
  } catch (err) {
    console.error(`Socket emit failed (${event}):`, err.message);
  }
};