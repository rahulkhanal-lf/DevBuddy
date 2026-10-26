import { Navigate, useOutletContext } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import FilesPage from "./pages/FilesPage";
import type { AppOutletContext } from "./types";

export function ChatRoute() {
  const ctx = useOutletContext<AppOutletContext>();
  // Unknown conversation id in the URL (deleted, or a bad link): start a new chat instead
  if (ctx.conversationsLoaded && ctx.activeId && !ctx.conversations.some((c) => c.id === ctx.activeId)) {
    return <Navigate to="/chat" replace />;
  }
  return (
    <ChatPage
      conversations={ctx.conversations}
      activeId={ctx.activeId}
      uploadedFilesCount={ctx.uploadedFiles.length}
      onSend={ctx.onSend}
      onNewChat={ctx.onNewChat}
      isTyping={ctx.isTyping}
    />
  );
}

export function FilesRoute() {
  const ctx = useOutletContext<AppOutletContext>();
  return <FilesPage files={ctx.uploadedFiles} onFilesUpload={ctx.onFilesUpload} onRemoveFile={ctx.onRemoveFile} />;
}
