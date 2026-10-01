import jwt from "jsonwebtoken";
import LiveClass from "../models/LiveClass.model.js";
import LiveClassRegistration from "../models/LiveClassRegistration.model.js";

// In-memory room registry. roomId -> { creatorSocketId, students: Map(studentId -> socketId) }
// This is fine for a single Node instance. If you scale to multiple instances,
// move this to Redis (e.g. with the socket.io-redis adapter) and keep the same shape.
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { creatorSocketId: null, students: new Map() });
  }
  return rooms.get(roomId);
}

export default function initLiveClassSocket(io) {
  const nsp = io.of("/live");

  // Auth handshake — expects the same JWT you already issue on login.
  // ⚠️ Adjust process.env.JWT_SECRET and the decoded field names ({id, role, name})
  // to match your existing token payload shape.
  nsp.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie?.match(/accessToken=([^;]+)/)?.[1];
      if (!token) return next(new Error("Not authenticated"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.userName = decoded.name;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  nsp.on("connection", (socket) => {
    socket.on("join-room", async ({ roomId }, callback) => {
      try {
        const liveClass = await LiveClass.findOne({ roomId });
        if (!liveClass) return callback?.({ success: false, message: "Room not found" });

        const isCreator = liveClass.creator.toString() === socket.userId;

        if (!isCreator) {
          const registration = await LiveClassRegistration.findOne({
            liveClass: liveClass._id,
            student: socket.userId,
            paymentStatus: "paid",
          });
          if (!registration) return callback?.({ success: false, message: "Not registered" });
          if (liveClass.status !== "live") return callback?.({ success: false, message: "Class not live" });
        }

        socket.roomId = roomId;
        socket.isCreator = isCreator;
        socket.join(roomId);

        const room = getRoom(roomId);
        if (isCreator) {
          room.creatorSocketId = socket.id;
        } else {
          room.students.set(socket.userId, socket.id);
          // Tell the creator a new student joined so it can open a peer connection to them.
          if (room.creatorSocketId) {
            nsp.to(room.creatorSocketId).emit("student-joined", {
              studentId: socket.userId,
              studentName: socket.userName,
              socketId: socket.id,
            });
          }
        }

        callback?.({
          success: true,
          isCreator,
          chatRestricted: liveClass.chatRestricted,
          status: liveClass.status,
        });
      } catch (err) {
        callback?.({ success: false, message: "Failed to join room" });
      }
    });

    // ── WebRTC signaling relay ───────────────────────────────────────────
    // Messages are targeted at a specific socket id, so the creator can hold
    // one RTCPeerConnection per connected student (mesh, host-centric).
    socket.on("webrtc-signal", ({ to, signal }) => {
      nsp.to(to).emit("webrtc-signal", { from: socket.id, fromUserId: socket.userId, signal });
    });

    // ── Media state (mic/cam/screen-share on-off) — for UI indicators ────
    socket.on("media-state", ({ roomId, kind, enabled }) => {
      socket.to(roomId).emit("media-state", { userId: socket.userId, kind, enabled });
    });

    // ── Chat ───────────────────────────────────────────────────────────
    socket.on("chat-message", async ({ roomId, text, to }) => {
      const liveClass = await LiveClass.findOne({ roomId });
      if (!liveClass || !text?.trim()) return;

      const message = {
        from: socket.userId,
        fromName: socket.userName,
        isCreator: socket.isCreator,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      if (socket.isCreator) {
        // Creator can DM one student, or broadcast to the whole room.
        if (to) {
          const room = getRoom(roomId);
          const targetSocketId = room.students.get(to);
          if (targetSocketId) nsp.to(targetSocketId).emit("chat-message", message);
          socket.emit("chat-message", message); // echo back to the host
        } else {
          nsp.to(roomId).emit("chat-message", message);
        }
        return;
      }

      // Student sending a message.
      if (liveClass.chatRestricted) {
        // Restricted mode: students may only message the creator, never each other.
        const room = getRoom(roomId);
        if (room.creatorSocketId) nsp.to(room.creatorSocketId).emit("chat-message", message);
        socket.emit("chat-message", message); // echo back to sender
      } else {
        nsp.to(roomId).emit("chat-message", message);
      }
    });

    // ── Creator moderation controls ──────────────────────────────────────
    socket.on("mute-participant", ({ roomId, studentId }) => {
      if (!socket.isCreator) return;
      const room = getRoom(roomId);
      const targetSocketId = room.students.get(studentId);
      if (targetSocketId) nsp.to(targetSocketId).emit("force-mute");
    });

    socket.on("kick-participant", ({ roomId, studentId }) => {
      if (!socket.isCreator) return;
      const room = getRoom(roomId);
      const targetSocketId = room.students.get(studentId);
      if (targetSocketId) {
        nsp.to(targetSocketId).emit("kicked");
        nsp.sockets.get(targetSocketId)?.leave(roomId);
        room.students.delete(studentId);
      }
    });

    socket.on("leave-room", () => handleLeave(socket));
    socket.on("disconnect", () => handleLeave(socket));

    function handleLeave(sock) {
      if (!sock.roomId) return;
      const room = getRoom(sock.roomId);
      if (sock.isCreator) {
        room.creatorSocketId = null;
      } else {
        room.students.delete(sock.userId);
        if (room.creatorSocketId) {
          nsp.to(room.creatorSocketId).emit("student-left", { studentId: sock.userId });
        }
      }
      sock.leave(sock.roomId);
    }
  });
}