import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import { ChatRoute, FilesRoute } from "./routes";
import HomePage from "./pages/HomePage";
import MapsPage from "./pages/MapsPage";
import MapEditorPage from "./pages/MapEditorPage";

// A data router is required for useBlocker, which guards unsaved map edits
export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "chat", element: <ChatRoute /> },
      { path: "chat/:conversationId", element: <ChatRoute /> },
      { path: "knowledge", element: <FilesRoute /> },
      { path: "maps", element: <MapsPage /> },
      { path: "maps/new", element: <MapEditorPage /> },
      { path: "maps/:mapId", element: <MapEditorPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
