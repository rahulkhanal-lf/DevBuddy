import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { BrainCircuit, MessageSquare, Network } from "lucide-react";
import { listMaps } from "../mindmap/api";
import { useAuth } from "../auth/AuthContext";
import type { MapSummary } from "../mindmap/types";
import type { AppOutletContext } from "../types";
import "./HomePage.css";

const SECTIONS = [
  {
    to: "/chat",
    Icon: MessageSquare,
    title: "Chat",
    text: "Ask questions and get answers grounded in your knowledge base.",
  },
  {
    to: "/knowledge",
    Icon: BrainCircuit,
    title: "Knowledge",
    text: "Upload PDFs and notes so the assistant can use them.",
  },
  {
    to: "/maps",
    Icon: Network,
    title: "Mind maps",
    text: "Organize ideas visually, or let AI draft a map from a prompt.",
  },
];

const RECENT_LIMIT = 5;

function todayLabel() {
  return new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function HomePage() {
  const { conversations, conversationsLoaded } = useOutletContext<AppOutletContext>();
  const { user } = useAuth();
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [mapsError, setMapsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listMaps()
      .then((result) => !cancelled && setMaps(result))
      .catch(() => !cancelled && setMapsError(true));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="main home">
      <div className="home-inner">
        <header>
          <p className="home-date">{todayLabel()}</p>
          <h1 className="home-title">Good to have you back.</h1>
        </header>

        <nav className="home-sections" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Link key={s.to} to={s.to} className="home-card">
              <span className="home-card-icon">
                <s.Icon size={16} />
              </span>
              <span className="home-card-body">
                <span className="home-card-title">{s.title}</span>
                <span className="home-card-text">{s.text}</span>
              </span>
            </Link>
          ))}
        </nav>

        <div className="home-recent">
          <section className="home-panel">
            <div className="home-panel-head">
              <h2>Recent conversations</h2>
              <Link to="/chat">New chat</Link>
            </div>
            {!conversationsLoaded ? (
              <p className="home-muted">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="home-muted">No conversations yet.</p>
            ) : (
              <ul>
                {conversations.slice(0, RECENT_LIMIT).map((c) => (
                  <li key={c.id}>
                    <Link to={`/chat/${c.id}`}>
                      <MessageSquare size={14} />
                      <span>{c.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="home-panel">
            <div className="home-panel-head">
              <h2>Recent mind maps</h2>
              <Link to="/maps">All maps</Link>
            </div>
            {mapsError ? (
              <p className="home-muted">Couldn't load maps. Is the backend running?</p>
            ) : maps === null ? (
              <p className="home-muted">Loading…</p>
            ) : maps.length === 0 ? (
              <p className="home-muted">No maps yet.</p>
            ) : (
              <ul>
                {maps.slice(0, RECENT_LIMIT).map((m) => (
                  <li key={m.id}>
                    <Link to={`/maps/${m.id}`}>
                      <Network size={14} />
                      <span>{m.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
