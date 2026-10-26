import { useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bot, BrainCircuit, FileText, House, MessageSquare, Moon, Network, Paperclip, Plus, Sun, X, type LucideIcon } from "lucide-react";
import { useTheme } from "../theme";
import type { Conversation, UploadedFile } from "../types";
import "./Sidebar.css";

const NAV_ITEMS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: "/", icon: House, label: "Home" },
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/knowledge", icon: BrainCircuit, label: "Knowledge" },
  { to: "/maps", icon: Network, label: "Mind maps" },
];

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  uploadedFiles: UploadedFile[];
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onFilesUpload: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Sidebar({
  conversations,
  activeId,
  uploadedFiles,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onFilesUpload,
  onRemoveFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const onChatPage = useLocation().pathname.startsWith("/chat");
  const navClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;
  const { theme, toggleTheme } = useTheme();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    await uploadFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
  }

  async function uploadFiles(files: File[]) {
    setIsUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("http://localhost:8000/api/files/upload", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const uploadedFile: UploadedFile = await response.json();
          onFilesUpload([uploadedFile]);
        }
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveFile(fileId: string) {
    try {
      const response = await fetch(`http://localhost:8000/api/files/${fileId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        onRemoveFile(fileId);
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link to="/" className="sidebar-brand">
          <span className="sidebar-logo"><Bot size={18} strokeWidth={2.2} /></span>
          <span className="sidebar-title">MindFlow AI</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navClass}>
              <item.icon className="nav-icon" size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {onChatPage && (
          <button className="new-chat-btn" onClick={onNewChat}>
            <Plus className="new-chat-icon" size={16} />
            New Chat
          </button>
        )}
      </div>

      {!onChatPage && <div className="sidebar-spacer" />}
      {onChatPage && (
        <>

      <div className="sidebar-section-label">Conversations</div>
      <nav className="conversation-list">
        {conversations.length === 0 && (
          <p className="empty-hint">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conv-item ${c.id === activeId ? "active" : ""}`}
            onClick={() => onSelectConversation(c.id)}
          >
            <MessageSquare className="conv-icon" size={15} />
            <span className="conv-title">{c.title}</span>
            <button
              className="conv-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(c.id);
              }}
              title="Delete"
              aria-label="Delete conversation"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-section-label">Documents</div>
      <div
        className={`upload-zone ${isUploading ? "uploading" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <Paperclip className="upload-icon" size={18} />
        <span className="upload-text">
          {isUploading ? "Uploading..." : "Drop files or click to upload"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>

      {uploadedFiles.length > 0 && (
        <ul className="file-list">
          {uploadedFiles.map((f) => (
            <li key={f.id} className="file-item">
              <FileText className="file-icon" size={15} />
              <span className="file-info">
                <span className="file-name">{f.original_name}</span>
                <span className="file-size">{formatSize(f.file_size)}</span>
              </span>
              <button
                className="file-remove"
                onClick={() => handleRemoveFile(f.id)}
                title="Remove"
                aria-label="Remove file"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
        </>
      )}

      <div className="sidebar-footer">
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun className="nav-icon" size={18} /> : <Moon className="nav-icon" size={18} />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
    </aside>
  );
}
