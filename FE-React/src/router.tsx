import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import { ChatRoute, FilesRoute } from "./routes";
import HomePage from "./pages/HomePage";
import MapsPage from "./pages/MapsPage";
import MapEditorPage from "./pages/MapEditorPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RequireAuth from "./auth/RequireAuth";

// A data router is required for useBlocker, which guards unsaved map edits
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <RequireAuth><HomePage /></RequireAuth> },
      {
        path: "chat",
        element: <RequireAuth><ChatRoute /></RequireAuth>,
      },
      {
        path: "chat/:conversationId",
        element: <RequireAuth><ChatRoute /></RequireAuth>,
      },
      {
        path: "knowledge",
        element: <RequireAuth><FilesRoute /></RequireAuth>,
      },
      {
        path: "maps",
        element: <RequireAuth><MapsPage /></RequireAuth>,
      },
      {
        path: "maps/new",
        element: <RequireAuth><MapEditorPage /></RequireAuth>,
      },
      {
        path: "maps/:mapId",
        element: <RequireAuth><MapEditorPage /></RequireAuth>,
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
