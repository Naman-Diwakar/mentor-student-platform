"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiRequest, type SessionRecord } from "../../../lib/api";
import { getSupabaseBrowserClient } from "../../../lib/supabase";

const CollaborativeEditor = dynamic(
  () => import("../../../components/collaborative-editor"),
  {
    ssr: false
  }
);

type EditorState = {
  code: string;
  language: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "mentor" | "student";
  content: string;
  createdAt: string;
};

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const SERVER_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const languageOptions = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp"
];

function mergeUniqueMessages(messages: ChatMessage[]) {
  const seen = new Map<string, ChatMessage>();

  for (const message of messages) {
    seen.set(message.id, message);
  }

  return Array.from(seen.values()).sort((firstMessage, secondMessage) =>
    firstMessage.createdAt.localeCompare(secondMessage.createdAt)
  );
}

async function flushPendingIceCandidates(
  peerConnection: RTCPeerConnection,
  pendingIceCandidates: RTCIceCandidateInit[]
) {
  while (pendingIceCandidates.length > 0) {
    const candidate = pendingIceCandidates.shift();

    if (!candidate) {
      return;
    }

    if (!peerConnection.remoteDescription) {
      pendingIceCandidates.unshift(candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      pendingIceCandidates.unshift(candidate);
      return;
    }
  }
}

function formatStartedAt(timestamp: string | null) {
  if (!timestamp) {
    return "Ready to share";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short"
  }).format(new Date(timestamp));
}

export default function SessionRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const currentUserIdRef = useRef("");
  const otherParticipantNameRef = useRef("Participant");
  const sessionRef = useRef<SessionRecord | null>(null);
  const isRemoteConnectedRef = useRef(false);
  const mediaRecoveryTimeoutRef = useRef<number | null>(null);
  const isMakingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);
  const isExitingRef = useRef(false);
  const hasSentOfferRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [otherParticipantName, setOtherParticipantName] = useState("Participant");
  const [editorState, setEditorState] = useState<EditorState>({
    code: "",
    language: "javascript"
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting");
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isRemoteConnected, setIsRemoteConnected] = useState(false);
  const [collabStatus, setCollabStatus] = useState("Connecting sync");
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copyState, setCopyState] = useState("Copy invite link");
  const [sessionNotice, setSessionNotice] = useState("");
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isLeavingSession, setIsLeavingSession] = useState(false);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    otherParticipantNameRef.current = otherParticipantName;
  }, [otherParticipantName]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    isRemoteConnectedRef.current = isRemoteConnected;
  }, [isRemoteConnected]);

  function clearMediaRecoveryTimeout() {
    if (mediaRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(mediaRecoveryTimeoutRef.current);
      mediaRecoveryTimeoutRef.current = null;
    }
  }

  function cleanupRealtimeState(disconnectSocket = true) {
    clearMediaRecoveryTimeout();
    hasSentOfferRef.current = false;
    hasConnectedOnceRef.current = false;
    mediaReadyRef.current = false;
    pendingIceCandidatesRef.current = [];
    isMakingOfferRef.current = false;
    ignoreOfferRef.current = false;
    audioSenderRef.current = null;
    videoSenderRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setIsRemoteConnected(false);
    setIsMediaReady(false);
    if (disconnectSocket && socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  useEffect(() => {
    messagesContainerRef.current?.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  useEffect(() => {
    if (
      localVideoRef.current &&
      localStreamRef.current &&
      localVideoRef.current.srcObject !== localStreamRef.current
    ) {
      localVideoRef.current.srcObject = localStreamRef.current;
      void localVideoRef.current.play().catch(() => undefined);
    }

    if (
      remoteVideoRef.current &&
      remoteStreamRef.current &&
      remoteVideoRef.current.srcObject !== remoteStreamRef.current
    ) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      void remoteVideoRef.current.play().catch(() => undefined);
    }

    if (
      remoteAudioRef.current &&
      remoteStreamRef.current &&
      remoteAudioRef.current.srcObject !== remoteStreamRef.current
    ) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      void remoteAudioRef.current.play().catch(() => undefined);
    }
  });

  useEffect(() => {
    if (!session?.invite_code || typeof window === "undefined") {
      return;
    }

    setShareLink(`${window.location.origin}/join/${session.invite_code}`);
  }, [session?.invite_code]);

  useEffect(() => {
    if (!sessionNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSessionNotice(""), 2600);

    return () => window.clearTimeout(timeoutId);
  }, [sessionNotice]);

  useEffect(() => {
    let isCancelled = false;

    async function loadRoom() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setError(
          "Supabase environment variables are missing. Add them to apps/web/.env.local and restart the frontend server."
        );
        setLoading(false);
        return;
      }

      const {
        data: { session: authSession }
      } = await supabase.auth.getSession();

      if (!authSession?.user) {
        router.push("/auth");
        return;
      }

      const signedInUserId = authSession.user.id;
      setCurrentUserId(signedInUserId);
      currentUserIdRef.current = signedInUserId;

      try {
        const data = await apiRequest<{
          session: SessionRecord;
          editorState: EditorState;
          messages: ChatMessage[];
        }>(`/api/sessions/${params.sessionId}`);

        if (isCancelled) {
          return;
        }

        setSession(data.session);
        sessionRef.current = data.session;
        setEditorState(data.editorState);
        setMessages(mergeUniqueMessages(data.messages));
        const isMentorUser = signedInUserId === data.session.mentor_id;

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", authSession.user.id)
          .maybeSingle();

        const otherParticipantId =
          authSession.user.id === data.session.mentor_id
            ? data.session.student_id
            : data.session.mentor_id;

        if (otherParticipantId) {
          const { data: otherProfileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", otherParticipantId)
            .maybeSingle();

          if (!isCancelled && otherProfileData?.full_name) {
            setOtherParticipantName(otherProfileData.full_name);
            otherParticipantNameRef.current = otherProfileData.full_name;
          }
        }

        if (isCancelled) {
          return;
        }

        setCurrentUserName(profileData?.full_name ?? "You");

        const ensureLocalMedia = async (forceRefresh = false) => {
          const activeStream = localStreamRef.current;
          const liveAudioTrack = activeStream
            ?.getAudioTracks()
            .find((track) => track.readyState === "live");
          const liveVideoTrack = activeStream
            ?.getVideoTracks()
            .find((track) => track.readyState === "live");

          if (!forceRefresh && liveAudioTrack && liveVideoTrack) {
            return activeStream;
          }

          activeStream?.getTracks().forEach((track) => track.stop());

          const localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });

          if (isCancelled) {
            localStream.getTracks().forEach((track) => track.stop());
            return null;
          }

          localStreamRef.current = localStream;
          mediaReadyRef.current = true;
          setIsMediaReady(true);
          setIsMicEnabled(true);
          setIsCameraEnabled(true);
          setMediaError("");

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            void localVideoRef.current.play().catch(() => undefined);
          }

          return localStream;
        };

        try {
          await ensureLocalMedia();
        } catch (roomError) {
          const message =
            roomError instanceof Error
              ? roomError.message
              : "Camera or microphone access failed.";

          setIsMediaReady(false);
          mediaReadyRef.current = false;
          setMediaError(
            message.toLowerCase().includes("permission") ||
              message.toLowerCase().includes("device") ||
              message.toLowerCase().includes("denied")
              ? "Camera or microphone permission was blocked. Allow access in your browser settings."
              : message
          );
        }

        const createPeerConnection = () => {
          const remoteStream = new MediaStream();
          remoteStreamRef.current = remoteStream;

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }

          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
          }

          const peerConnection = new RTCPeerConnection(rtcConfiguration);
          peerConnectionRef.current = peerConnection;

          peerConnection.ontrack = (event) => {
            const attachRemoteTrack = (track: MediaStreamTrack) => {
              const exists = remoteStream
                .getTracks()
                .some((existingTrack) => existingTrack.id === track.id);

              if (!exists) {
                remoteStream.addTrack(track);
              }

              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                void remoteVideoRef.current.play().catch(() => undefined);
              }

              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                void remoteAudioRef.current.play().catch(() => undefined);
              }

              setIsRemoteConnected(true);
            };

            const incomingTracks =
              event.streams[0]?.getTracks() ?? (event.track ? [event.track] : []);

            incomingTracks.forEach((track) => {
              attachRemoteTrack(track);
              track.onunmute = () => attachRemoteTrack(track);
            });
          };

          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              socketRef.current?.emit("webrtc:ice-candidate", {
                candidate: event.candidate.toJSON()
              });
            }
          };

          peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;

            if (state === "connected") {
              setIsRemoteConnected(true);
              setConnectionStatus("In call");
            }

            if (
              state === "failed" ||
              state === "disconnected" ||
              state === "closed"
            ) {
              setIsRemoteConnected(false);
              hasSentOfferRef.current = false;
            }
          };

          peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;

            if (state === "connected" || state === "completed") {
              setIsRemoteConnected(true);
            }

            if (
              state === "failed" ||
              state === "disconnected" ||
              state === "closed"
            ) {
              setIsRemoteConnected(false);
            }
          };

          peerConnection.onnegotiationneeded = () => {
            void requestOffer();
          };

          return peerConnection;
        };

        const requestOffer = async () => {
          const activePeerConnection = peerConnectionRef.current;

          if (
            !isMentorUser ||
            !socketRef.current ||
            hasSentOfferRef.current ||
            !mediaReadyRef.current ||
            !activePeerConnection ||
            activePeerConnection.connectionState === "connected" ||
            activePeerConnection.signalingState !== "stable"
          ) {
            return;
          }

          try {
            hasSentOfferRef.current = true;
            isMakingOfferRef.current = true;
            const offer = await activePeerConnection.createOffer();

            if (activePeerConnection.signalingState !== "stable") {
              return;
            }

            await activePeerConnection.setLocalDescription(offer);
            socketRef.current.emit("webrtc:offer", { offer });
          } finally {
            isMakingOfferRef.current = false;
          }
        };

        const attachLocalTracks = async (peerConnection: RTCPeerConnection) => {
          const localStream = localStreamRef.current;

          if (!localStream) {
            return;
          }

          const audioTrack = localStream.getAudioTracks()[0] ?? null;
          const videoTrack = localStream.getVideoTracks()[0] ?? null;

          if (audioTrack) {
            if (audioSenderRef.current) {
              await audioSenderRef.current.replaceTrack(audioTrack);
            } else {
              audioSenderRef.current = peerConnection.addTrack(
                audioTrack,
                localStream
              );
            }
          }

          if (videoTrack) {
            if (videoSenderRef.current) {
              await videoSenderRef.current.replaceTrack(videoTrack);
            } else {
              videoSenderRef.current = peerConnection.addTrack(
                videoTrack,
                localStream
              );
            }
          }
        };

        const rebuildPeerConnection = async () => {
          clearMediaRecoveryTimeout();
          hasSentOfferRef.current = false;
          isMakingOfferRef.current = false;
          ignoreOfferRef.current = false;
          pendingIceCandidatesRef.current = [];
          audioSenderRef.current = null;
          videoSenderRef.current = null;
          peerConnectionRef.current?.close();
          setIsRemoteConnected(false);

          const nextPeerConnection = createPeerConnection();
          await attachLocalTracks(nextPeerConnection);
        };

        const recoverMediaConnection = async (forceNewMedia = false) => {
          if (
            isCancelled ||
            isExitingRef.current ||
            !socketRef.current?.connected ||
            isRemoteConnectedRef.current
          ) {
            return;
          }

          try {
            setSessionNotice("Reconnecting camera and microphone...");
            await ensureLocalMedia(forceNewMedia);
            await rebuildPeerConnection();
            socketRef.current?.emit("webrtc:media-ready");
            await requestOffer();
          } catch (recoveryError) {
            mediaReadyRef.current = false;
            setIsMediaReady(false);
            setMediaError(
              recoveryError instanceof Error
                ? recoveryError.message
                : "Could not access camera or microphone."
            );
          }
        };

        const scheduleMediaRecovery = (forceNewMedia = false) => {
          clearMediaRecoveryTimeout();
          mediaRecoveryTimeoutRef.current = window.setTimeout(() => {
            void recoverMediaConnection(forceNewMedia);
          }, 1400);
        };

        await rebuildPeerConnection();

        const socket = io(SERVER_URL, {
          autoConnect: false,
          auth: {
            token: authSession.access_token,
            sessionId: params.sessionId
          }
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("Connected");
          setError("");
          void (async () => {
            if (hasConnectedOnceRef.current) {
              await rebuildPeerConnection();
            } else {
              hasConnectedOnceRef.current = true;
            }

            if (mediaReadyRef.current) {
              socket.emit("webrtc:media-ready");
              await requestOffer();
              scheduleMediaRecovery();
            }
          })();
        });

        socket.on("disconnect", (reason) => {
          setConnectionStatus(reason === "io client disconnect" ? "Disconnected" : "Reconnecting");
        });

        socket.on("connect_error", (socketError) => {
          setConnectionStatus("Connection failed");
          setError(socketError.message);
        });

        socket.on("editor:update", (nextState: EditorState) => {
          setEditorState((currentState) => ({
            ...currentState,
            language: nextState.language ?? currentState.language
          }));
        });

        socket.on("chat:history", (nextMessages: ChatMessage[]) => {
          setMessages(mergeUniqueMessages(nextMessages));
        });

        socket.on("chat:new", (nextMessage: ChatMessage) => {
          setMessages((currentMessages) =>
            mergeUniqueMessages([...currentMessages, nextMessage])
          );
        });

        socket.on(
          "participant:joined",
          (payload: { userId: string; name: string }) => {
            if (payload.userId !== currentUserIdRef.current) {
              setSessionNotice(`${payload.name} joined the session`);
              setOtherParticipantName(payload.name);
              otherParticipantNameRef.current = payload.name;
              scheduleMediaRecovery();
            }
          }
        );

        socket.on(
          "participant:left",
          (payload: { userId: string; name: string }) => {
            if (payload.userId !== currentUserIdRef.current) {
              setSessionNotice(`${payload.name} left the session`);
            }
          }
        );

        socket.on("webrtc:peer-ready", async () => {
          if (!peerConnectionRef.current) {
            return;
          }

          await requestOffer();
          scheduleMediaRecovery();
        });

        socket.on(
          "webrtc:offer",
          async (payload: { offer?: RTCSessionDescriptionInit }) => {
            if (!payload.offer || !peerConnectionRef.current) {
              return;
            }

            const activePeerConnection = peerConnectionRef.current;
            const isOfferCollision =
              isMakingOfferRef.current ||
              activePeerConnection.signalingState !== "stable";
            const isPolitePeer = !isMentorUser;

            ignoreOfferRef.current = !isPolitePeer && isOfferCollision;

            if (ignoreOfferRef.current) {
              return;
            }

            hasSentOfferRef.current = false;

            if (
              isOfferCollision &&
              activePeerConnection.signalingState !== "stable"
            ) {
              await activePeerConnection.setLocalDescription({
                type: "rollback"
              });
            }

            await activePeerConnection.setRemoteDescription(
              new RTCSessionDescription(payload.offer)
            );
            await flushPendingIceCandidates(
              activePeerConnection,
              pendingIceCandidatesRef.current
            );
            if (activePeerConnection.signalingState !== "have-remote-offer") {
              return;
            }

            const answer = await activePeerConnection.createAnswer();
            if (activePeerConnection.signalingState !== "have-remote-offer") {
              return;
            }
            await activePeerConnection.setLocalDescription(answer);
            socket.emit("webrtc:answer", { answer });
            clearMediaRecoveryTimeout();
          }
        );

        socket.on(
          "webrtc:answer",
          async (payload: { answer?: RTCSessionDescriptionInit }) => {
            if (
              !payload.answer ||
              !peerConnectionRef.current ||
              peerConnectionRef.current.signalingState !== "have-local-offer"
            ) {
              return;
            }

            const activePeerConnection = peerConnectionRef.current;

            if (activePeerConnection.signalingState !== "have-local-offer") {
              return;
            }

            try {
              await activePeerConnection.setRemoteDescription(
                new RTCSessionDescription(payload.answer)
              );
            } catch {
              return;
            }
            await flushPendingIceCandidates(
              activePeerConnection,
              pendingIceCandidatesRef.current
            );
            hasSentOfferRef.current = false;
            clearMediaRecoveryTimeout();
          }
        );

        socket.on(
          "webrtc:ice-candidate",
          async (payload: { candidate?: RTCIceCandidateInit }) => {
            if (!payload.candidate || !peerConnectionRef.current) {
              return;
            }

            if (!peerConnectionRef.current.remoteDescription) {
              pendingIceCandidatesRef.current.push(payload.candidate);
              return;
            }

            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(payload.candidate)
              );
            } catch {
              pendingIceCandidatesRef.current.push(payload.candidate);
            }
          }
        );

        socket.on("webrtc:peer-left", () => {
          clearMediaRecoveryTimeout();
          setIsRemoteConnected(false);
          setConnectionStatus("Waiting for participant");
          setSessionNotice(`${otherParticipantNameRef.current} disconnected`);
          void rebuildPeerConnection();
        });

        socket.on("session:ended", () => {
          setConnectionStatus("Session ended");
          setIsRemoteConnected(false);
          setSessionNotice("Session ended");
          if (!isExitingRef.current) {
            isExitingRef.current = true;
            cleanupRealtimeState();
            router.replace("/dashboard");
          }
        });

        socket.connect();
      } catch (roomError) {
        setError(
          roomError instanceof Error ? roomError.message : "Could not load room."
        );
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadRoom();

    return () => {
      isCancelled = true;
      cleanupRealtimeState();
    };
  }, [params.sessionId, router]);

  async function handleRenegotiate() {
    const activePeerConnection = peerConnectionRef.current;

    if (
      !activePeerConnection ||
      !socketRef.current?.connected ||
      currentUserIdRef.current !== sessionRef.current?.mentor_id
    ) {
      return;
    }

    hasSentOfferRef.current = false;
    if (activePeerConnection.signalingState !== "stable") {
      return;
    }
    const offer = await activePeerConnection.createOffer({
      iceRestart: true
    });
    if (activePeerConnection.signalingState !== "stable") {
      return;
    }
    await activePeerConnection.setLocalDescription(offer);
    socketRef.current.emit("webrtc:offer", { offer });
  }

  function handleLanguageChange(language: string) {
    setEditorState((currentState) => ({
      ...currentState,
      language
    }));

    socketRef.current?.emit("editor:update", { language });
  }

  async function handleEndSession() {
    if (!session || isExitingRef.current) {
      return;
    }

    try {
      setIsEndingSession(true);
      isExitingRef.current = true;
      setSessionNotice("Ending session...");
      socketRef.current?.emit("session:end-request");
      cleanupRealtimeState(false);
      router.replace("/dashboard");

      void apiRequest<{ session: SessionRecord }>(`/api/sessions/${session.id}/end`, {
        method: "POST",
        keepalive: true
      });
    } catch (endError) {
      isExitingRef.current = false;
      setError(
        endError instanceof Error ? endError.message : "Could not end session."
      );
    } finally {
      setIsEndingSession(false);
    }
  }

  function handleLeaveSession() {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    setIsLeavingSession(true);
    setSessionNotice("Leaving session...");
    cleanupRealtimeState();
    router.replace("/dashboard");
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = messageInput.trim();

    if (!content) {
      return;
    }

    socketRef.current?.emit("chat:send", { content });
    setMessageInput("");
  }

  function handleToggleMic() {
    const nextValue = !isMicEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextValue;
    });
    setIsMicEnabled(nextValue);
  }

  function handleToggleCamera() {
    const nextValue = !isCameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextValue;
    });
    setIsCameraEnabled(nextValue);
  }

  async function handleCopyInviteLink() {
    if (!shareLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyState("Link copied");
      window.setTimeout(() => setCopyState("Copy invite link"), 1800);
    } catch {
      setCopyState("Copy failed");
      window.setTimeout(() => setCopyState("Copy invite link"), 1800);
    }
  }

  if (loading) {
    return (
      <main className="meet-shell flex h-screen w-full items-center justify-center overflow-hidden">
        <div className="rounded-[28px] border border-white/10 bg-[#1f1f1f] px-8 py-5 text-sm text-slate-200 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          Joining session...
        </div>
      </main>
    );
  }

  const isMentor = Boolean(session && currentUserId === session.mentor_id);
  return (
    <main className="meet-shell h-screen w-full overflow-hidden">
      <div className="flex h-full w-full flex-col bg-[#1f1f1f] px-4 py-4 text-white">
        {sessionNotice ? (
          <div className="mb-3 shrink-0 rounded-[20px] border border-[#27433a] bg-[#183028] px-4 py-3 text-sm text-[#d8efe6]">
            {sessionNotice}
          </div>
        ) : null}
        {error ? (
          <div className="mb-3 shrink-0 rounded-[24px] border border-[#5f2a26] bg-[#3a1d1a] px-4 py-3 text-sm text-[#f6c7c2]">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-3">
          <section className="flex min-h-0 flex-col rounded-[30px] border border-black/5 bg-[#f5f1e8] p-4 shadow-[0_24px_90px_rgba(15,23,42,0.12)]">
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.68fr)_320px]">
              <div className="flex min-h-0 flex-col gap-3">
                <div className="shrink-0 border-b border-[#e7dece] pb-3 text-[#231f20]">
                  <h1 className="text-[1.9rem] font-semibold leading-none tracking-tight">
                    {session?.title ?? "Session Room"}
                  </h1>
                  <p className="mt-1 text-sm text-[#7a6f61]">
                    Invite {session?.invite_code} | {formatStartedAt(session?.started_at ?? null)}
                  </p>
                </div>

                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#d9cfbe] bg-[#fcfaf5]">
                  <div className="flex shrink-0 items-center justify-between border-b border-[#e7dece] px-4 py-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a7d6d]">
                        Shared editor
                      </p>
                    </div>
                    <label className="flex items-center gap-3 text-sm text-[#5f564c]">
                      <span>Language</span>
                      <select
                        value={editorState.language}
                        onChange={(event) => handleLanguageChange(event.target.value)}
                        className="rounded-full border border-[#d9cfbe] bg-[#f5efe4] px-4 py-2 text-[#231f20] outline-none transition hover:bg-[#efe5d7] focus:border-[#a67c52]"
                      >
                        {languageOptions.map((language) => (
                          <option key={language} value={language}>
                            {language}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 bg-[#111111]">
                    <CollaborativeEditor
                      roomId={params.sessionId}
                      initialCode={editorState.code}
                      language={editorState.language}
                      userName={currentUserName}
                      userColor={isMentor ? "#b88746" : "#3f7a66"}
                      onStatusChange={setCollabStatus}
                    />
                  </div>
                </section>
              </div>

              <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1.45fr)_220px]">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-[#d9cfbe] bg-[#fcfaf5]">
                  <div className="flex shrink-0 items-center justify-between border-b border-[#e7dece] px-4 py-2.5">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[#8a7d6d]">
                      Message
                    </p>
                    <div className="text-xs font-medium text-[#8a7d6d]">
                      {messages.length}
                    </div>
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3"
                  >
                    {messages.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-[#d9cfbe] bg-[#f5efe4] px-4 py-3 text-sm leading-6 text-[#8a7d6d]">
                        Start the discussion here while you code together.
                      </div>
                    ) : null}

                    {messages.map((message) => {
                      const isCurrentUser = message.senderId === currentUserId;

                      return (
                        <div
                          key={message.id}
                          className={`max-w-[90%] rounded-[20px] px-3.5 py-2.5 text-[12px] leading-5 ${
                            isCurrentUser
                              ? "ml-auto bg-[#2f3a32] text-[#f7f3ea]"
                              : "bg-[#ebe2d3] text-[#2c2826]"
                          }`}
                        >
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
                            {isCurrentUser ? currentUserName : message.senderName}
                          </div>
                          <p>{message.content}</p>
                        </div>
                      );
                    })}
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    className="flex shrink-0 gap-2.5 border-t border-[#e7dece] px-4 py-3"
                  >
                    <input
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      placeholder="Type a message"
                      className="flex-1 rounded-full border border-[#d9cfbe] bg-white px-4 py-2.5 text-sm text-[#231f20] outline-none placeholder:text-[#9d9180] focus:border-[#a67c52]"
                    />
                    <button
                      type="submit"
                      className="flex-none rounded-full bg-[#2f3a32] px-4 py-2.5 text-sm font-semibold text-[#f7f3ea] transition hover:bg-[#243027]"
                    >
                      Send
                    </button>
                  </form>
                </section>

                <section className="overflow-hidden rounded-[28px] border border-[#d9cfbe] bg-[#1d1f22]">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        Video
                      </p>
                    </div>
                    <div className="text-xs font-medium text-slate-400">
                      {isRemoteConnected ? "Connected" : "Waiting"}
                    </div>
                  </div>

                  <div className="relative h-[180px] p-3">
                    <div className="relative h-full overflow-hidden rounded-[20px] bg-black">
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover"
                      />
                      {!isRemoteConnected ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-3 text-center text-xs text-slate-300">
                          Waiting for {otherParticipantName.toLowerCase()}
                        </div>
                      ) : null}
                      <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        {otherParticipantName}
                      </div>
                    </div>

                    <div className="absolute bottom-5 right-5 h-[72px] w-[92px] overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover [transform:scaleX(-1)]"
                      />
                      <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        You
                      </div>
                      {!isMediaReady || !isCameraEnabled ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-3 text-center text-xs text-slate-300">
                          {!isMediaReady ? "Camera unavailable" : "Camera off"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-2.5 rounded-[28px] border border-[#d9cfbe] bg-[#f5f1e8] px-4 py-2.5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <button
            type="button"
            onClick={handleToggleMic}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              isMicEnabled
                ? "bg-[#2f3a32] text-[#f7f3ea] hover:bg-[#243027]"
                : "bg-[#8f3b32] text-[#f8ece8] hover:bg-[#783128]"
            }`}
          >
            {isMicEnabled ? "Mute mic" : "Unmute mic"}
          </button>
          <button
            type="button"
            onClick={handleToggleCamera}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              isCameraEnabled
                ? "bg-[#2f3a32] text-[#f7f3ea] hover:bg-[#243027]"
                : "bg-[#8f3b32] text-[#f8ece8] hover:bg-[#783128]"
            }`}
          >
            {isCameraEnabled ? "Turn off camera" : "Turn on camera"}
          </button>
          <div className="rounded-full border border-[#d9cfbe] bg-white px-4 py-2.5 text-sm text-[#6f6253]">
            Code: <span className="font-semibold text-[#231f20]">{session?.invite_code}</span>
          </div>
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="rounded-full border border-[#d9cfbe] bg-white px-4 py-2.5 text-sm font-semibold text-[#231f20] transition hover:bg-[#f3ebdd]"
          >
            {copyState}
          </button>
          {isMentor ? (
            <button
              type="button"
              onClick={handleEndSession}
              disabled={isEndingSession}
              className="rounded-full bg-[#8f3b32] px-4 py-2.5 text-sm font-semibold text-[#f8ece8] transition hover:bg-[#783128] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isEndingSession ? "Ending..." : "End session"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeaveSession}
              disabled={isLeavingSession}
              className="rounded-full border border-[#d9cfbe] bg-white px-4 py-2.5 text-sm font-semibold text-[#231f20] transition hover:bg-[#f3ebdd] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLeavingSession ? "Leaving..." : "Leave session"}
            </button>
          )}
        </footer>
        <audio ref={remoteAudioRef} autoPlay className="hidden" />
      </div>
    </main>
  );
}
