export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  error?: boolean; // local-only failure notice, never persisted
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
}

export interface UploadedFile {
  id: string;
  original_name: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
}

// State the App layout shares with its routed pages
export interface AppOutletContext {
  conversations: Conversation[];
  conversationsLoaded: boolean;
  activeId: string | null;
  uploadedFiles: UploadedFile[];
  isTyping: boolean;
  onSend: (content: string) => void;
  onNewChat: () => void;
  onFilesUpload: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
}

export interface KnowledgeText {
  id: string;
  title: string;
  content: string;
  created_at: string;
}
