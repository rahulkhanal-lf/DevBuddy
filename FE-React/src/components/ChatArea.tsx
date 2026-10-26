import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, CircleAlert, MessageSquare, Network, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";
import { generateMapFromText, isAbortError, errorMessage } from "../mindmap/api";
import type { Draft } from "../mindmap/types";
import "./ChatArea.css";

interface Props {
  messages: Message[];
  isTyping: boolean;
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AssistantMessage({ msg }: { msg: Message }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function createMap() {
    if (loading) return;
    setErr("");
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const draft = await generateMapFromText(msg.content, ctrl.signal);
      const d: Draft = { title: draft.title, graph: { nodes: draft.nodes, edges: draft.edges } };
      navigate("/maps/new", { state: { draft: d } });
    } catch (e) {
      if (!isAbortError(e)) setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`message-row assistant${msg.error ? " error" : ""}`}>
      <div className="message-avatar">
        {msg.error ? <CircleAlert size={15} /> : <Bot size={15} />}
      </div>
      <div className="message-body">
        <div className="message-bubble message-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
        <div className="message-actions">
          <span className="message-time">{formatTime(msg.created_at)}</span>
          {!msg.error && (
            <button
              className={`msg-map-btn${loading ? " loading" : ""}`}
              onClick={createMap}
              disabled={loading}
              title="Generate a mind map from this response"
            >
              {loading ? <span className="msg-spinner" /> : <Network size={12} />}
              {loading ? "Generating…" : "Create Mind Map"}
            </button>
          )}
        </div>
        {err && <p className="msg-map-err">{err}</p>}
      </div>
    </div>
  );
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
      {messages.map((msg) =>
        msg.role === "assistant" ? (
          <AssistantMessage key={msg.id} msg={msg} />
        ) : (
          <div key={msg.id} className="message-row user">
            <div className="message-avatar">
              <User size={15} />
            </div>
            <div className="message-body">
              <div className="message-bubble">{msg.content}</div>
              <span className="message-time">{formatTime(msg.created_at)}</span>
            </div>
          </div>
        )
      )}

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
