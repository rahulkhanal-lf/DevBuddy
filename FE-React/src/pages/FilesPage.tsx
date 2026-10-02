import { useRef, useState, useEffect } from "react";
import type { UploadedFile, KnowledgeText } from "../types";
import "./FilesPage.css";

interface Props {
  files: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FilesPage({ files, onFilesUpload, onRemoveFile }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [knowledgeList, setKnowledgeList] = useState<KnowledgeText[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchKnowledge();
  }, []);

  async function fetchKnowledge() {
    try {
      const res = await fetch("http://localhost:8000/api/knowledge");
      if (res.ok) setKnowledgeList(await res.json());
    } catch (e) {
      console.error("Failed to fetch knowledge:", e);
    }
  }

  async function handleSaveKnowledge() {
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (res.ok) {
        const saved: KnowledgeText = await res.json();
        setKnowledgeList((prev) => [saved, ...prev]);
        setTitle("");
        setContent("");
      }
    } catch (e) {
      console.error("Failed to save knowledge:", e);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteKnowledge(id: string) {
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${id}`, { method: "DELETE" });
      if (res.ok) setKnowledgeList((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      console.error("Failed to delete knowledge:", e);
    }
  }

  async function uploadFiles(filesToUpload: File[]) {
    setUploadError("");
    setIsUploading(true);
    try {
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("http://localhost:8000/api/files/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          onFilesUpload([await res.json()]);
        } else {
          const err = await res.json();
          setUploadError(err.detail ?? "Upload failed");
        }
      }
    } catch (e) {
      setUploadError("Upload failed — is the backend running?");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveFile(fileId: string) {
    try {
      const res = await fetch(`http://localhost:8000/api/files/${fileId}`, { method: "DELETE" });
      if (res.ok) onRemoveFile(fileId);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  return (
    <div className="files-page">
      <div className="files-container">

        {/* ── PDF Upload ───────────────────────────────── */}
        <div className="section-header">
          <h2>📄 PDF Knowledge</h2>
          <span className="section-sub">Only PDF files are accepted</span>
        </div>

        <div
          className={`drop-zone ${isUploading ? "uploading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); uploadFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <span className="drop-icon">⬆️</span>
          <p className="drop-label">{isUploading ? "Uploading..." : "Drop PDF or click to browse"}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            hidden
            onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            disabled={isUploading}
          />
        </div>

        {uploadError && <p className="error-msg">⚠️ {uploadError}</p>}

        {files.length === 0 ? (
          <p className="empty-state">No PDFs uploaded yet</p>
        ) : (
          <table className="knowledge-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td className="filename"><span>📎</span>{file.original_name}</td>
                  <td>{formatSize(file.file_size)}</td>
                  <td className="date">{formatDate(file.uploaded_at)}</td>
                  <td>
                    <button className="delete-btn" onClick={() => handleRemoveFile(file.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="divider" />

        {/* ── Knowledge Text ───────────────────────────── */}
        <div className="section-header">
          <h2>📝 Text Knowledge</h2>
          <span className="section-sub">Add knowledge as plain text</span>
        </div>

        <div className="knowledge-form">
          <input
            className="knowledge-title-input"
            type="text"
            placeholder="Title  (e.g. Company FAQ, Product Guide...)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="knowledge-content-input"
            placeholder="Paste or type your knowledge text here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
          />
          <button
            className={`save-btn ${(!title.trim() || !content.trim() || isSaving) ? "disabled" : ""}`}
            onClick={handleSaveKnowledge}
            disabled={!title.trim() || !content.trim() || isSaving}
          >
            {isSaving ? "Saving..." : "Save Knowledge"}
          </button>
        </div>

        {knowledgeList.length === 0 ? (
          <p className="empty-state">No knowledge text saved yet</p>
        ) : (
          <div className="knowledge-cards">
            {knowledgeList.map((k) => (
              <div key={k.id} className="knowledge-card">
                <div className="knowledge-card-header">
                  <span className="knowledge-card-title">📝 {k.title}</span>
                  <span className="knowledge-card-date">{formatDate(k.created_at)}</span>
                  <button className="delete-btn" onClick={() => handleDeleteKnowledge(k.id)}>🗑️</button>
                </div>
                <p className="knowledge-card-content">{k.content}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
