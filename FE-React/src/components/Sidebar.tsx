import { useRef, useState } from "react";
import type { Conversation, UploadedFile } from "../types";
import "./Sidebar.css";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  uploadedFiles: UploadedFile[];
  currentPage: "chat" | "files";
  onPageChange: (page: "chat" | "files") => void;
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
  currentPage,
  onPageChange,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onFilesUpload,
  onRemoveFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

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
        <div className="sidebar-brand">
          <span className="sidebar-logo">🤖</span>
          <span className="sidebar-title">DevBuddy</span>
        </div>

        <div className="page-tabs">
          <button
            className={`page-tab ${currentPage === "chat" ? "active" : ""}`}
            onClick={() => onPageChange("chat")}
          >
            💬 Chat
          </button>
          <button
            className={`page-tab ${currentPage === "files" ? "active" : ""}`}
            onClick={() => onPageChange("files")}
          >
            📄 Files
          </button>
        </div>

        {currentPage === "chat" && (
          <button className="new-chat-btn" onClick={onNewChat}>
            <span className="new-chat-icon">+</span>
            New Chat
          </button>
        )}
      </div>

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
            <span className="conv-icon">💬</span>
            <span className="conv-title">{c.title}</span>
            <button
              className="conv-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(c.id);
              }}
              title="Delete"
            >
              ×
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
        <span className="upload-icon">📎</span>
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
              <span className="file-icon">📄</span>
              <span className="file-info">
                <span className="file-name">{f.original_name}</span>
                <span className="file-size">{formatSize(f.file_size)}</span>
              </span>
              <button
                className="file-remove"
                onClick={() => handleRemoveFile(f.id)}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
