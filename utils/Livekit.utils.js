import { AccessToken, EgressClient, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { AppError } from "../middleware/error.middleware.js";

// ─── Env guard ─────────────────────────────────────────────────────────────
// LIVEKIT_API_KEY / LIVEKIT_API_SECRET must NEVER be sent to the frontend.
// LIVEKIT_URL is the ws(s):// endpoint the frontend connects to directly —
// it is not a secret, but we still keep it server-side and hand it back in
// the /join response so the frontend has zero LiveKit config of its own.
function assertConfigured() {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    throw new AppError(
      "Live classes are not configured yet. Please contact support.",
      503
    );
  }
}

let _egressClient = null;
let _roomServiceClient = null;

function getEgressClient() {
  assertConfigured();
  if (!_egressClient) {
    _egressClient = new EgressClient(
      process.env.LIVEKIT_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );
  }
  return _egressClient;
}

function getRoomServiceClient() {
  assertConfigured();
  if (!_roomServiceClient) {
    _roomServiceClient = new RoomServiceClient(
      process.env.LIVEKIT_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );
  }
  return _roomServiceClient;
}

/**
 * Generate a signed LiveKit access token for a single user joining a single room.
 * Grants are role-scoped: hosts get publish + room-admin style permissions,
 * participants get publish (mic/cam, screenshare only if allowed) + subscribe.
 *
 * This is the ONLY place tokens are minted. Callers must have already verified
 * the user's permission to join before calling this function.
 */
export async function createLiveKitToken({
  roomName,
  identity, // must be the Mongo user _id as a string — used for attendance matching
  name,
  role, // "host" | "participant"
  allowScreenShare = false,
  maxParticipants,
}) {
  assertConfigured();

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      name,
      ttl: "4h",
    }
  );

  const isHost = role === "host";

  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: false, // rooms are implicitly created on first publish/join by LiveKit
    canPublish: true,
    canPublishData: true, // needed for chat / raise-hand data messages
    canSubscribe: true,
    canPublishSources: isHost || allowScreenShare
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.CAMERA, TrackSource.MICROPHONE],
    roomAdmin: isHost, // lets host mute/remove participants via server API if needed
    roomRecord: isHost,
  });

  if (maxParticipants) {
    // Enforced at the join-permission check in the controller, not here —
    // LiveKit grants don't support a hard room-wide cap directly.
  }

  return at.toJwt();
}

/** Ensures a room exists with the class's max-participant limit applied. */
export async function ensureRoom(roomName, maxParticipants) {
  const svc = getRoomServiceClient();
  try {
    await svc.createRoom({
      name: roomName,
      emptyTimeout: 60 * 30, // auto-close 30 min after last participant leaves
      maxParticipants: maxParticipants || 100,
    });
  } catch (err) {
    // Room may already exist — LiveKit's createRoom is idempotent-ish, but
    // guard anyway so a race condition doesn't fail the "start class" call.
    if (!/already exists/i.test(err.message || "")) throw err;
  }
}

/** Forcefully closes a room (used when a class ends). */
export async function closeRoom(roomName) {
  const svc = getRoomServiceClient();
  try {
    await svc.deleteRoom(roomName);
  } catch (err) {
    console.error(`[livekit] closeRoom(${roomName}) failed:`, err.message);
  }
}

/**
 * Starts room-composite egress (recording) for a room.
 *
 * NOTE: This requires LiveKit Egress to be deployed with a configured file
 * output (S3/GCS/Azure) on the LiveKit server side — see LIVEKIT egress.yaml.
 * The specific bucket/credentials are infrastructure config, not application
 * code, and are intentionally NOT hardcoded here. Until that's provisioned,
 * this call will throw and the caller should surface a clear "not configured"
 * error rather than silently failing.
 */
export async function startRoomRecording(roomName, outputConfig) {
  const egress = getEgressClient();
  if (!outputConfig) {
    throw new AppError(
      "Recording storage is not configured on the server (LiveKit Egress output).",
      503
    );
  }
  // outputConfig shape depends on target, e.g. for S3:
  // { file: { filepath: `recordings/${roomName}/{room_name}-{time}.mp4`, s3: {...} } }
  return egress.startRoomCompositeEgress(roomName, outputConfig);
}

export async function stopRoomRecording(egressId) {
  const egress = getEgressClient();
  return egress.stopEgress(egressId);
}