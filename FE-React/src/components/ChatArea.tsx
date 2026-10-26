import { useEffect, useRef } from "react";
import { Bot, CircleAlert, MessageSquare, User } from "lucide-react";
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
        <div className="chat-empty-icon">
          <MessageSquare size={20} />
        </div>
        <h2 className="chat-empty-title">Start a conversation</h2>
        <p className="chat-empty-sub">
          Ask about your knowledge base, a piece of code, or anything you're working on.
        </p>
        <div className="chat-suggestions">
          {[
            "Summarize my knowledge base",
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
        <div key={msg.id} className={`message-row ${msg.role}${msg.error ? " error" : ""}`}>
          <div className="message-avatar">
            {msg.error ? <CircleAlert size={15} /> : msg.role === "assistant" ? <Bot size={15} /> : <User size={15} />}
          </div>
          <div className="message-body">
            <div className="message-bubble">{msg.content}</div>
            <span className="message-time">{formatTime(msg.created_at)}</span>
          </div>
        </div>
      ))}

      {isTyping && (
        <div className="message-row assistant">
          <div className="message-avatar">
            <Bot size={15} />
          </div>
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
