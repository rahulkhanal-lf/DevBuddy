import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Send, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authFetch } from "../lib/authFetch";
import type { MapSummary } from "./types";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  onClose: () => void;
  map?: MapSummary; // When set, scope AI to this map only
}

export default function MapsChatPanel({ onClose, map }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await authFetch("/api/maps/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, map_id: map?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "The AI returned an error.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
      }
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mcp-panel">
      <div className="mcp-header">
        <span className="mcp-title">
          <MessageSquare size={15} />
          {map ? `Ask AI about "${map.title}"` : "Ask AI about your maps"}
        </span>
        <button className="mcp-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      <div className="mcp-messages">
        {messages.length === 0 && !loading && (
          <div className="mcp-empty">
            {map ? (
              <>
                <p>Ask anything about this map.</p>
                <ul>
                  <li>Summarise this map</li>
                  <li>What are the main topics?</li>
                  <li>List all nodes in this map</li>
                </ul>
              </>
            ) : (
              <>
                <p>Ask anything about your mind maps.</p>
                <ul>
                  <li>Summarise all my maps</li>
                  <li>What topics am I studying?</li>
                  <li>Which map covers neural networks?</li>
                </ul>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`mcp-msg ${m.role}`}>
            <span className="mcp-avatar">
              {m.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
            </span>
            <div className="mcp-text mcp-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            </div>
          </div>
        ))}

        {loading && (
          <div className="mcp-msg assistant">
            <span className="mcp-avatar"><Bot size={14} /></span>
            <p className="mcp-text mcp-typing">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </p>
          </div>
        )}

        {error && <p className="mcp-error">{error}</p>}

        <div ref={bottomRef} />
      </div>

      <div className="mcp-footer">
        <textarea
          ref={inputRef}
          className="mcp-input"
          rows={2}
          placeholder="Ask about your maps…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button className="mcp-send" onClick={send} disabled={!input.trim() || loading} aria-label="Send">
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
