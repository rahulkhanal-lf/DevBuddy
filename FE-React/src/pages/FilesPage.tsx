import { useRef, useState } from "react";
import type { UploadedFile } from "../types";
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

export default function FilesPage({
  files,
  onFilesUpload,
  onRemoveFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles(filesToUpload: File[]) {
    setIsUploading(true);
    try {
      for (const file of filesToUpload) {
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    uploadFiles(selectedFiles);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    uploadFiles(droppedFiles);
  }

  return (
    <div className="files-page">
      <div className="files-container">
        <h1>📄 File History</h1>

        <div
          className={`drop-zone ${isUploading ? "uploading" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <div className="drop-content">
            <span className="drop-icon">⬆️</span>
            <h3>{isUploading ? "Uploading..." : "Upload Files"}</h3>
            <p>Drag and drop files here or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </div>

        {files.length === 0 ? (
          <div className="empty-state">
            <p>No files uploaded yet</p>
          </div>
        ) : (
          <div className="files-list">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className="filename">
                      <span className="file-icon">📎</span>
                      {file.original_name}
                    </td>
                    <td>{formatSize(file.file_size)}</td>
                    <td className="file-type">{file.file_type}</td>
                    <td className="date">{formatDate(file.uploaded_at)}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleRemoveFile(file.id)}
                        title="Delete file"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
