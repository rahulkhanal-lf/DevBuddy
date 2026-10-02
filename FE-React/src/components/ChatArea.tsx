import { useEffect, useRef } from "react";
import type { Message } from "../types";
import "./ChatArea.css";

interface Props {
  messages: Message[];
  isTyping: boolean;
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatArea({ messages, isTyping }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-icon">🤖</div>
        <h2 className="chat-empty-title">How can I help you today?</h2>
        <p className="chat-empty-sub">
          Upload documents from the sidebar and start chatting.
        </p>
        <div className="chat-suggestions">
          {[
            "Summarize my uploaded document",
            "Explain this code snippet",
            "Help me debug an issue",
            "Write unit tests for this function",
          ].map((s) => (
            <button key={s} className="suggestion-chip">
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      {messages.map((msg) => (
        <div key={msg.id} className={`message-row ${msg.role}`}>
          <div className="message-avatar">
            {msg.role === "assistant" ? "🤖" : "👤"}
          </div>
          <div className="message-body">
            <div className="message-bubble">{msg.content}</div>
            <span className="message-time">{formatTime(msg.created_at)}</span>
          </div>
        </div>
      ))}

      {isTyping && (
        <div className="message-row assistant">
          <div className="message-avatar">🤖</div>
          <div className="message-body">
            <div className="message-bubble typing-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
