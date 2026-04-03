"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const Y = __importStar(require("yjs"));
dotenv_1.default.config({
    path: path_1.default.resolve(process.cwd(), "../../.env")
});
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 4000);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase server environment variables. Check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
}
const supabaseAuth = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const roomStates = new Map();
const roomMessages = new Map();
const roomDocs = new Map();
const roomAwareness = new Map();
const roomMediaReady = new Map();
const DEFAULT_EDITOR_STATE = {
    language: "javascript",
    code: [
        "function greet(name) {",
        "  return `Hello, ${name}!`;",
        "}",
        "",
        "console.log(greet('student'));"
    ].join("\n")
};
function generateInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function generateMessageId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function getRoomName(sessionId, channel = "session") {
    return `session:${sessionId}:${channel}`;
}
function getOrCreateRoomDoc(sessionId) {
    const existingDoc = roomDocs.get(sessionId);
    if (existingDoc) {
        return existingDoc;
    }
    const roomState = roomStates.get(sessionId) ?? DEFAULT_EDITOR_STATE;
    const doc = new Y.Doc();
    const text = doc.getText("monaco");
    if (text.length === 0 && roomState.code) {
        text.insert(0, roomState.code);
    }
    roomDocs.set(sessionId, doc);
    return doc;
}
function syncRoomStateFromDoc(sessionId) {
    const doc = getOrCreateRoomDoc(sessionId);
    const text = doc.getText("monaco").toString();
    const currentState = roomStates.get(sessionId) ?? DEFAULT_EDITOR_STATE;
    roomStates.set(sessionId, {
        ...currentState,
        code: text
    });
}
function getSingleValue(value) {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}
async function getProfile(userId) {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .single();
    if (error || !data) {
        return null;
    }
    return data;
}
async function getSessionById(sessionId) {
    const { data, error } = await supabaseAdmin
        .from("sessions")
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .eq("id", sessionId)
        .single();
    if (error || !data) {
        return null;
    }
    return data;
}
async function endSessionByMentor(sessionId, mentorId) {
    const session = await getSessionById(sessionId);
    if (!session) {
        return { ok: false, error: "Session not found.", status: 404 };
    }
    if (session.mentor_id !== mentorId) {
        return {
            ok: false,
            error: "You can only end your own sessions.",
            status: 403
        };
    }
    const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from("sessions")
        .update({
        status: "ended",
        ended_at: new Date().toISOString()
    })
        .eq("id", sessionId)
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .single();
    if (updateError || !updatedSession) {
        return {
            ok: false,
            error: updateError?.message ?? "Could not end session.",
            status: 500
        };
    }
    roomStates.delete(sessionId);
    roomMessages.delete(sessionId);
    roomDocs.get(sessionId)?.destroy();
    roomDocs.delete(sessionId);
    roomAwareness.delete(sessionId);
    roomMediaReady.delete(sessionId);
    io.to(getRoomName(sessionId, "session")).emit("session:ended");
    return { ok: true, session: updatedSession };
}
function canAccessSession(session, userId) {
    return session.mentor_id === userId || session.student_id === userId;
}
async function requireAuth(request, response, next) {
    const authorizationHeader = request.headers.authorization;
    if (!authorizationHeader?.startsWith("Bearer ")) {
        response.status(401).json({ error: "Missing bearer token." });
        return;
    }
    const token = authorizationHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        response.status(401).json({ error: "Invalid or expired token." });
        return;
    }
    request.user = {
        id: user.id,
        email: user.email ?? ""
    };
    next();
}
app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "server" });
});
app.get("/api/sessions", requireAuth, async (request, response) => {
    const user = request.user;
    if (!user) {
        response.status(401).json({ error: "Unauthorized." });
        return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
        response.status(404).json({ error: "Profile not found." });
        return;
    }
    const sessionColumn = profile.role === "mentor" ? "mentor_id" : "student_id";
    const { data, error } = await supabaseAdmin
        .from("sessions")
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .eq(sessionColumn, user.id)
        .order("created_at", { ascending: false });
    if (error) {
        response.status(500).json({ error: error.message });
        return;
    }
    response.json({ sessions: data });
});
app.get("/api/sessions/:sessionId", requireAuth, async (request, response) => {
    const user = request.user;
    const sessionId = getSingleValue(request.params.sessionId);
    if (!user || !sessionId) {
        response.status(401).json({ error: "Unauthorized." });
        return;
    }
    const session = await getSessionById(sessionId);
    if (!session) {
        response.status(404).json({ error: "Session not found." });
        return;
    }
    if (!canAccessSession(session, user.id)) {
        response.status(403).json({ error: "You do not have access to this session." });
        return;
    }
    response.json({
        session,
        editorState: roomStates.get(sessionId) ?? DEFAULT_EDITOR_STATE,
        messages: roomMessages.get(sessionId) ?? []
    });
});
app.post("/api/sessions", requireAuth, async (request, response) => {
    const user = request.user;
    const { title } = request.body;
    if (!user) {
        response.status(401).json({ error: "Unauthorized." });
        return;
    }
    if (!title?.trim()) {
        response.status(400).json({ error: "Session title is required." });
        return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
        response.status(404).json({ error: "Profile not found." });
        return;
    }
    if (profile.role !== "mentor") {
        response.status(403).json({ error: "Only mentors can create sessions." });
        return;
    }
    const inviteCode = generateInviteCode();
    const { data, error } = await supabaseAdmin
        .from("sessions")
        .insert({
        mentor_id: user.id,
        title: title.trim(),
        invite_code: inviteCode
    })
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .single();
    if (error || !data) {
        response
            .status(500)
            .json({ error: error?.message ?? "Could not create session." });
        return;
    }
    await supabaseAdmin.from("session_participants").insert({
        session_id: data.id,
        user_id: user.id
    });
    roomStates.set(data.id, DEFAULT_EDITOR_STATE);
    roomMessages.set(data.id, []);
    getOrCreateRoomDoc(data.id);
    response.status(201).json({ session: data });
});
app.post("/api/sessions/join", requireAuth, async (request, response) => {
    const user = request.user;
    const { inviteCode } = request.body;
    if (!user) {
        response.status(401).json({ error: "Unauthorized." });
        return;
    }
    if (!inviteCode?.trim()) {
        response.status(400).json({ error: "Invite code is required." });
        return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
        response.status(404).json({ error: "Profile not found." });
        return;
    }
    if (profile.role !== "student") {
        response.status(403).json({ error: "Only students can join sessions." });
        return;
    }
    const normalizedCode = inviteCode.trim().toUpperCase();
    const { data: session, error: sessionError } = await supabaseAdmin
        .from("sessions")
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .eq("invite_code", normalizedCode)
        .single();
    if (sessionError || !session) {
        response
            .status(404)
            .json({ error: "Session not found for that invite code." });
        return;
    }
    if (session.status === "ended") {
        response.status(400).json({ error: "This session has already ended." });
        return;
    }
    if (session.student_id && session.student_id !== user.id) {
        response
            .status(400)
            .json({ error: "This session already has a student." });
        return;
    }
    const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from("sessions")
        .update({
        student_id: user.id,
        status: "active",
        started_at: session.started_at ?? new Date().toISOString()
    })
        .eq("id", session.id)
        .select("id, title, status, invite_code, mentor_id, student_id, started_at, ended_at, created_at")
        .single();
    if (updateError || !updatedSession) {
        response
            .status(500)
            .json({ error: updateError?.message ?? "Could not join session." });
        return;
    }
    const { data: existingParticipant } = await supabaseAdmin
        .from("session_participants")
        .select("id")
        .eq("session_id", session.id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!existingParticipant) {
        await supabaseAdmin.from("session_participants").insert({
            session_id: session.id,
            user_id: user.id
        });
    }
    if (!roomStates.has(session.id)) {
        roomStates.set(session.id, DEFAULT_EDITOR_STATE);
    }
    if (!roomMessages.has(session.id)) {
        roomMessages.set(session.id, []);
    }
    getOrCreateRoomDoc(session.id);
    response.json({ session: updatedSession });
});
app.post("/api/sessions/:sessionId/end", requireAuth, async (request, response) => {
    const user = request.user;
    const sessionId = getSingleValue(request.params.sessionId);
    if (!user || !sessionId) {
        response.status(401).json({ error: "Unauthorized." });
        return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
        response.status(404).json({ error: "Profile not found." });
        return;
    }
    if (profile.role !== "mentor") {
        response.status(403).json({ error: "Only mentors can end sessions." });
        return;
    }
    const result = await endSessionByMentor(sessionId, user.id);
    if (!result.ok) {
        response.status(result.status).json({ error: result.error });
        return;
    }
    response.json({ session: result.session });
});
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: clientUrl,
        methods: ["GET", "POST"]
    }
});
io.use(async (socket, next) => {
    const token = getSingleValue(socket.handshake.auth.token);
    const sessionId = getSingleValue(socket.handshake.auth.sessionId);
    if (!token || !sessionId) {
        next(new Error("Missing socket auth token or session ID."));
        return;
    }
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        next(new Error("Socket authentication failed."));
        return;
    }
    const session = await getSessionById(sessionId);
    if (!session) {
        next(new Error("Session not found."));
        return;
    }
    if (session.status === "ended") {
        next(new Error("Session already ended."));
        return;
    }
    if (!canAccessSession(session, user.id)) {
        next(new Error("You do not have access to this session."));
        return;
    }
    socket.data.userId = user.id;
    socket.data.sessionId = sessionId;
    socket.data.userEmail = user.email ?? "";
    socket.data.profile = await getProfile(user.id);
    next();
});
io.on("connection", (socket) => {
    const sessionId = socket.data.sessionId;
    const sessionRoomName = getRoomName(sessionId, "session");
    const collabRoomName = getRoomName(sessionId, "collab");
    const roomState = roomStates.get(sessionId) ?? DEFAULT_EDITOR_STATE;
    const roomDoc = getOrCreateRoomDoc(sessionId);
    const profile = socket.data.profile;
    roomStates.set(sessionId, roomState);
    if (!roomMessages.has(sessionId)) {
        roomMessages.set(sessionId, []);
    }
    if (!roomAwareness.has(sessionId)) {
        roomAwareness.set(sessionId, new Map());
    }
    if (!roomMediaReady.has(sessionId)) {
        roomMediaReady.set(sessionId, new Set());
    }
    socket.join(sessionRoomName);
    socket.join(collabRoomName);
    socket.emit("editor:state", roomState);
    socket.emit("chat:history", roomMessages.get(sessionId) ?? []);
    socket.emit("collab:sync", Array.from(Y.encodeStateAsUpdate(roomDoc)));
    socket.emit("collab:awareness-history", Array.from(roomAwareness.get(sessionId)?.values() ?? []));
    if (profile) {
        socket.to(sessionRoomName).emit("participant:joined", {
            userId: profile.id,
            name: profile.full_name,
            role: profile.role
        });
    }
    socket.on("collab:join", () => {
        socket.join(collabRoomName);
        socket.emit("collab:sync", Array.from(Y.encodeStateAsUpdate(roomDoc)));
        socket.emit("collab:awareness-history", Array.from(roomAwareness.get(sessionId)?.values() ?? []));
    });
    socket.on("editor:update", (payload) => {
        const currentState = roomStates.get(sessionId) ?? DEFAULT_EDITOR_STATE;
        const nextState = {
            code: payload.code ?? currentState.code,
            language: payload.language ?? currentState.language
        };
        roomStates.set(sessionId, nextState);
        socket.to(sessionRoomName).emit("editor:update", nextState);
    });
    socket.on("collab:sync-request", () => {
        socket.emit("collab:sync", Array.from(Y.encodeStateAsUpdate(roomDoc)));
    });
    socket.on("collab:update", (payload) => {
        const update = Uint8Array.from(payload);
        Y.applyUpdate(roomDoc, update);
        syncRoomStateFromDoc(sessionId);
        socket.to(collabRoomName).emit("collab:update", Array.from(update));
    });
    socket.on("collab:awareness-update", (payload) => {
        if (!payload.clientIds?.length || !payload.update) {
            return;
        }
        const awarenessEntry = {
            socketId: socket.id,
            clientIds: payload.clientIds,
            update: Array.from(payload.update)
        };
        roomAwareness.get(sessionId)?.set(socket.id, awarenessEntry);
        socket
            .to(collabRoomName)
            .emit("collab:awareness-update", awarenessEntry);
    });
    socket.on("chat:send", (payload) => {
        const content = payload.content?.trim();
        if (!content || !profile) {
            return;
        }
        const nextMessage = {
            id: generateMessageId(),
            senderId: profile.id,
            senderName: profile.full_name,
            senderRole: profile.role,
            content,
            createdAt: new Date().toISOString()
        };
        const nextMessages = [...(roomMessages.get(sessionId) ?? []), nextMessage];
        roomMessages.set(sessionId, nextMessages);
        io.to(sessionRoomName).emit("chat:new", nextMessage);
    });
    socket.on("webrtc:offer", (payload) => {
        if (!payload.offer) {
            return;
        }
        socket.to(sessionRoomName).emit("webrtc:offer", payload);
    });
    socket.on("webrtc:answer", (payload) => {
        if (!payload.answer) {
            return;
        }
        socket.to(sessionRoomName).emit("webrtc:answer", payload);
    });
    socket.on("webrtc:ice-candidate", (payload) => {
        if (!payload.candidate) {
            return;
        }
        socket.to(sessionRoomName).emit("webrtc:ice-candidate", payload);
    });
    socket.on("webrtc:media-ready", () => {
        const readySockets = roomMediaReady.get(sessionId);
        readySockets?.add(socket.id);
        if ((readySockets?.size ?? 0) >= 2) {
            io.to(sessionRoomName).emit("webrtc:peer-ready");
        }
    });
    socket.on("session:end-request", async () => {
        if (!profile || profile.role !== "mentor") {
            return;
        }
        await endSessionByMentor(sessionId, profile.id);
    });
    socket.on("disconnect", () => {
        const awarenessEntry = roomAwareness.get(sessionId)?.get(socket.id);
        if (awarenessEntry) {
            roomAwareness.get(sessionId)?.delete(socket.id);
            socket
                .to(collabRoomName)
                .emit("collab:awareness-remove", { clientIds: awarenessEntry.clientIds });
        }
        roomMediaReady.get(sessionId)?.delete(socket.id);
        if (profile) {
            socket.to(sessionRoomName).emit("participant:left", {
                userId: profile.id,
                name: profile.full_name,
                role: profile.role
            });
        }
        socket.to(sessionRoomName).emit("webrtc:peer-left");
        console.log(`socket disconnected: ${socket.id}`);
    });
});
httpServer.listen(port, () => {
    console.log(`server listening on http://localhost:${port}`);
});
