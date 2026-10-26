import { Paperclip } from "lucide-react";
import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import type { Conversation } from "../types";

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
            <Paperclip size={12} /> {uploadedFilesCount} file{uploadedFilesCount > 1 ? "s" : ""}
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
