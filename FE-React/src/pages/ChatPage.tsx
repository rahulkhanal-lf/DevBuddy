import { useState, useEffect } from "react";
import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import type { Conversation, Message } from "../types";

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

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  uploadedFilesCount: number;
  onSend: (message: string) => void;
  onNewChat: () => void;
  isTyping: boolean;
}

export default function ChatPage({
  conversations,
  activeId,
  uploadedFilesCount,
  onSend,
  onNewChat,
  isTyping,
}: Props) {
  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="main">
      <header className="chat-header">
        <span className="chat-header-title">
          {activeConversation ? activeConversation.title : "New Conversation"}
        </span>
        {uploadedFilesCount > 0 && (
          <span className="chat-header-badge">
            📎 {uploadedFilesCount} file{uploadedFilesCount > 1 ? "s" : ""}
          </span>
        )}
      </header>
      <ChatArea
        messages={activeConversation?.messages ?? []}
        isTyping={isTyping}
      />
      <ChatInput onSend={onSend} disabled={isTyping} />
    </div>
  );
}
