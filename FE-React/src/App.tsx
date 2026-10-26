import { useState, useEffect, useRef } from "react";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ThemeContext, useThemeState } from "./theme";
import { authFetch } from "./lib/authFetch";
import type { AppOutletContext, Conversation, Message, UploadedFile } from "./types";
import "./App.css";

const API = "http://localhost:8000";

export default function App() {
  const navigate = useNavigate();
  const themeState = useThemeState();
  const chatMatch = useMatch("/chat/:conversationId");
  const activeId = chatMatch?.params.conversationId ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const requestedMessages = useRef(new Set<string>());

  useEffect(() => {
    fetchConversations();
    fetchFileHistory();
  }, []);

  // Load messages the first time a conversation is opened (by click or by URL)
  useEffect(() => {
    if (!activeId || requestedMessages.current.has(activeId)) return;
    const existing = conversations.find((c) => c.id === activeId);
    if (!existing || existing.messages.length > 0) return;
    requestedMessages.current.add(activeId);
    loadMessages(activeId);
  }, [activeId, conversations]);

  async function fetchConversations() {
    try {
      const res = await authFetch("/api/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      console.error("Failed to fetch conversations");
    } finally {
      setConversationsLoaded(true);
    }
  }

  async function fetchFileHistory() {
    try {
      const res = await authFetch("/api/files");
      if (res.ok) setUploadedFiles(await res.json());
    } catch {
      console.error("Failed to fetch files");
    }
  }

  async function loadMessages(id: string) {
    try {
      const res = await authFetch(`/api/conversations/${id}`);
      if (res.ok) {
        const full: Conversation = await res.json();
        setConversations((prev) => prev.map((c) => (c.id === id ? full : c)));
      }
    } catch {
      console.error("Failed to load conversation messages");
    }
  }

  function handleNewChat() {
    navigate("/chat");
  }

  function handleSelectConversation(id: string) {
    navigate(`/chat/${id}`);
  }

  async function handleDeleteConversation(id: string) {
    try {
      await authFetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch {
      console.error("Failed to delete conversation");
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) navigate("/chat");
  }

  function handleFilesUpload(files: UploadedFile[]) {
    setUploadedFiles((prev) => [...prev, ...files]);
  }

  function handleRemoveFile(id: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // Shown in the thread only (not saved), so the user knows the reply failed
  function showChatError(convId: string, text: string) {
    const errorMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      created_at: new Date().toISOString(),
      error: true,
    };
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, errorMsg] } : c))
    );
  }

  async function handleSend(content: string) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    let convId = activeId;

    if (!convId) {
      // Create a new conversation on the server
      try {
        const res = await authFetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 60) }),
        });
        if (!res.ok) return;
        const conv: Conversation = await res.json();
        convId = conv.id;
        requestedMessages.current.add(conv.id);
        setConversations((prev) => [{ ...conv, messages: [userMsg] }, ...prev]);
        navigate(`/chat/${conv.id}`);
      } catch {
        console.error("Failed to create conversation");
        return;
      }
    } else {
      // Optimistically add user message to existing conversation
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );
    }

    setIsTyping(true);

    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, message: content }),
      });

      if (res.ok) {
        const { message, message_id } = await res.json();
        const assistantMsg: Message = {
          id: message_id,
          role: "assistant",
          content: message,
          created_at: new Date().toISOString(),
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: [...c.messages, assistantMsg] }
              : c
          )
        );
      } else {
        let detail = `The server returned an error (${res.status}).`;
        try {
          const body = await res.json();
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // Non-JSON error body; keep the generic message
        }
        showChatError(convId, detail);
      }
    } catch {
      showChatError(convId, "Can't reach the server. Check that the backend is running.");
    } finally {
      setIsTyping(false);
    }
  }

  const outletContext: AppOutletContext = {
    conversations,
    conversationsLoaded,
    activeId,
    uploadedFiles,
    isTyping,
    onSend: handleSend,
    onNewChat: handleNewChat,
    onFilesUpload: handleFilesUpload,
    onRemoveFile: handleRemoveFile,
  };

  return (
    <ThemeContext.Provider value={themeState}>
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        uploadedFiles={uploadedFiles}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onFilesUpload={handleFilesUpload}
        onRemoveFile={handleRemoveFile}
      />
      <Outlet context={outletContext} />
    </div>
    </ThemeContext.Provider>
  );
}
