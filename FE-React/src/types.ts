export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

export interface KnowledgeText {
  id: string;
  title: string;
  content: string;
  created_at: string;
}
