export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

export interface UploadedFile {
  id: string;
  original_name: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
}
