import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatPage from "./pages/ChatPage";
import FilesPage from "./pages/FilesPage";
import type { Conversation, Message, UploadedFile } from "./types";
import "./App.css";

const API = "http://localhost:8000";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentPage, setCurrentPage] = useState<"chat" | "files">("chat");

  useEffect(() => {
    fetchConversations();
    fetchFileHistory();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch(`${API}/api/conversations`);
      if (res.ok) setConversations(await res.json());
    } catch {
      console.error("Failed to fetch conversations");
    }
  }

  async function fetchFileHistory() {
    try {
      const res = await fetch(`${API}/api/files`);
      if (res.ok) setUploadedFiles(await res.json());
    } catch {
      console.error("Failed to fetch files");
    }
  }

  function handleNewChat() {
    setActiveId(null);
  }

  async function handleSelectConversation(id: string) {
    setActiveId(id);
    // Load messages the first time a conversation is selected
    const existing = conversations.find((c) => c.id === id);
    if (existing && existing.messages.length === 0) {
      try {
        const res = await fetch(`${API}/api/conversations/${id}`);
        if (res.ok) {
          const full: Conversation = await res.json();
          setConversations((prev) => prev.map((c) => (c.id === id ? full : c)));
        }
      } catch {
        console.error("Failed to load conversation messages");
      }
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`${API}/api/conversations/${id}`, { method: "DELETE" });
    } catch {
      console.error("Failed to delete conversation");
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function handleFilesUpload(files: UploadedFile[]) {
    setUploadedFiles((prev) => [...prev, ...files]);
  }

  function handleRemoveFile(id: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
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
        const res = await fetch(`${API}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 60) }),
        });
        if (!res.ok) return;
        const conv: Conversation = await res.json();
        convId = conv.id;
        setConversations((prev) => [{ ...conv, messages: [userMsg] }, ...prev]);
        setActiveId(convId);
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
      const res = await fetch(`${API}/api/chat`, {
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
      }
    } catch {
      console.error("Chat request failed");
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        uploadedFiles={uploadedFiles}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onFilesUpload={handleFilesUpload}
        onRemoveFile={handleRemoveFile}
      />
      {currentPage === "chat" ? (
        <ChatPage
          conversations={conversations}
          activeId={activeId}
          uploadedFilesCount={uploadedFiles.length}
          onSend={handleSend}
          onNewChat={handleNewChat}
          isTyping={isTyping}
        />
      ) : (
        <FilesPage
          files={uploadedFiles}
          onFilesUpload={handleFilesUpload}
          onRemoveFile={handleRemoveFile}
        />
      )}
    </div>
  );
}
