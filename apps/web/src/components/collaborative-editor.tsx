"use client";

import Editor from "@monaco-editor/react";
import { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import { WebsocketProvider } from "y-websocket";
import { useEffect, useRef } from "react";
import * as Y from "yjs";

const COLLAB_SERVER_URL =
  process.env.NEXT_PUBLIC_COLLAB_SERVER_URL ?? "ws://localhost:1234";

type CollaborativeEditorProps = {
  roomId: string;
  initialCode: string;
  language: string;
  userName: string;
  userColor: string;
  onStatusChange?: (status: string) => void;
};

export default function CollaborativeEditor({
  roomId,
  initialCode,
  language,
  userName,
  userColor,
  onStatusChange
}: CollaborativeEditorProps) {
  const editorRef = useRef<any>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const textRef = useRef<Y.Text | null>(null);
  const localUserRef = useRef({
    name: userName || "Participant",
    color: userColor
  });

  useEffect(() => {
    localUserRef.current = {
      name: userName || "Participant",
      color: userColor
    };

    providerRef.current?.awareness.setLocalStateField("user", localUserRef.current);
  }, [userColor, userName]);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      COLLAB_SERVER_URL,
      `session-${roomId}`,
      doc,
      {
        connect: true
      }
    );
    const text = doc.getText("monaco");

    if (text.length === 0 && initialCode) {
      text.insert(0, initialCode);
    }

    provider.awareness.setLocalStateField("user", localUserRef.current);

    const updateAwarenessStyles = () => {
      const nextCss: string[] = [];

      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID) {
          return;
        }

        const remoteUser = state.user as
          | { name?: string; color?: string }
          | undefined;
        const cursorColor = remoteUser?.color || "#b88746";
        const cursorName = (remoteUser?.name || "Collaborator")
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');

        nextCss.push(`
          .yRemoteSelection-${clientId} {
            background-color: ${cursorColor}22 !important;
            border-left-color: ${cursorColor}bb !important;
          }

          .yRemoteSelectionHead-${clientId} {
            border-left-color: ${cursorColor} !important;
          }

          .yRemoteSelectionHead-${clientId}::after {
            content: "${cursorName}";
            background: ${cursorColor};
            color: #ffffff;
            border-radius: 999px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
            position: absolute;
            top: -26px;
            left: -2px;
            opacity: 0.96;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
            pointer-events: auto;
          }

          .yRemoteSelectionHead-${clientId}:hover::after {
            opacity: 1;
            transform: translateY(-1px);
          }
        `);
      });

      if (!styleElementRef.current) {
        const styleElement = document.createElement("style");
        styleElement.setAttribute("data-collab-cursors", roomId);
        document.head.appendChild(styleElement);
        styleElementRef.current = styleElement;
      }

      styleElementRef.current.textContent = nextCss.join("\n");
    };

    provider.awareness.on("update", updateAwarenessStyles);
    provider.on("status", (event: { status: string }) => {
      onStatusChange?.(
        event.status === "connected" ? "CRDT live" : "Reconnecting CRDT"
      );
    });
    provider.on("sync", () => {
      onStatusChange?.("CRDT live");
    });

    updateAwarenessStyles();

    docRef.current = doc;
    providerRef.current = provider;
    awarenessRef.current = provider.awareness;
    textRef.current = text;

    if (editorRef.current?.getModel()) {
      bindingRef.current = new MonacoBinding(
        text,
        editorRef.current.getModel(),
        new Set([editorRef.current]),
        provider.awareness
      );
    }

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      provider.awareness.off("update", updateAwarenessStyles);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      styleElementRef.current?.remove();
      styleElementRef.current = null;
      providerRef.current = null;
      awarenessRef.current = null;
      textRef.current = null;
      docRef.current = null;
    };
  }, [initialCode, onStatusChange, roomId]);

  function handleMount(editor: any) {
    editorRef.current = editor;

    if (
      bindingRef.current ||
      !textRef.current ||
      !awarenessRef.current
    ) {
      return;
    }

    bindingRef.current = new MonacoBinding(
      textRef.current,
      editor.getModel(),
      new Set([editor]),
      awarenessRef.current
    );
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      defaultValue={initialCode}
      onMount={handleMount}
      options={{
        fontSize: 15,
        fontLigatures: true,
        minimap: { enabled: false },
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: {
          top: 20
        }
      }}
    />
  );
}
