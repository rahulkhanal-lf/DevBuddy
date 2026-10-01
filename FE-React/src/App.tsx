import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatPage from "./pages/ChatPage";
import FilesPage from "./pages/FilesPage";
import type { Conversation, Message, UploadedFile } from "./types";
import "./App.css";

const MOCK_REPLIES = [
  "That's a great question! Let me think through that for you.",
  "Based on the documents you've uploaded, here's what I found...",
  "I can help with that. Here's a detailed explanation:",
  "Sure! Here's a breakdown of what you're asking about.",
  "Interesting! From what I can see, the answer involves a few key concepts.",
];

function mockReply() {
  return MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
}

function createConversation(firstMessage: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title: firstMessage.slice(0, 40) + (firstMessage.length > 40 ? "…" : ""),
    messages: [],
    createdAt: new Date(),
  };
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentPage, setCurrentPage] = useState<"chat" | "files">("chat");

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    fetchFileHistory();
  }, []);

  async function fetchFileHistory() {
    try {
      const response = await fetch("http://localhost:8000/api/files");
      if (response.ok) {
        const files: UploadedFile[] = await response.json();
        setUploadedFiles(files);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  }

  function handleNewChat() {
    setActiveId(null);
  }

  function handleSelectConversation(id: string) {
    setActiveId(id);
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function handleFilesUpload(files: UploadedFile[]) {
    setUploadedFiles((prev) => [...prev, ...files]);
  }

  function handleRemoveFile(id: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleSend(content: string) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    let targetId = activeId;

    if (!targetId) {
      const newConv = createConversation(content);
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(newConv.id);
      targetId = newConv.id;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );
    }

    setIsTyping(true);
    setTimeout(() => {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: mockReply(),
        timestamp: new Date(),
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? { ...c, messages: [...c.messages, assistantMsg] }
            : c
        )
      );
      setIsTyping(false);
    }, 1200 + Math.random() * 800);
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
