import { useState, useRef } from "react";
import { ArrowUp } from "lucide-react";
import "./ChatInput.css";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  return (
    <div className="input-wrapper">
      <div className="input-bar">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Message MindFlow AI…"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          className={`send-btn ${!value.trim() || disabled ? "disabled" : ""}`}
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          aria-label="Send"
        >
          <ArrowUp size={17} strokeWidth={2.2} />
        </button>
      </div>
      <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
