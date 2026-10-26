import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { errorMessage, generateMap, isAbortError } from "./api";
import { prepareDraft } from "./draft";
import type { Draft, GenerateRequest } from "./types";

// Slightly longer than the server's own timeout and retry budget
const CLIENT_TIMEOUT_MS = 270_000;

interface Props {
  onClose: () => void;
  onGenerated: (draft: Draft) => void;
}

const EXAMPLE =
  "I want to become a better full-stack developer. Create a learning roadmap covering frontend, " +
  "backend, databases, system design, and cloud infrastructure. Organize it into a practical hierarchy.";

export default function GenerateDialog({ onClose, onGenerated }: Props) {
  const [form, setForm] = useState<GenerateRequest>({
    topic: "",
    purpose: "",
    depth: 3,
    branches: 5,
    constraints: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight request if the dialog unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  function update<K extends keyof GenerateRequest>(key: K, value: GenerateRequest[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const topic = form.topic.trim();
    if (topic.length < 3) {
      setError("Describe your idea or topic in at least 3 characters.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);

    setLoading(true);
    setError("");
    try {
      const raw = await generateMap({ ...form, topic }, controller.signal);
      onGenerated(prepareDraft(raw));
    } catch (err) {
      if (isAbortError(err)) {
        setError(timedOut ? "Generation took too long and was stopped. Try a smaller depth or fewer branches." : "");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <div
      className="mm-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <form
        className="mm-modal"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !loading) onClose();
        }}
      >
        <h2 className="mm-modal-title"><Sparkles size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />Generate with AI</h2>
        <p className="mm-modal-sub">
          The result opens as an unsaved preview. Nothing is saved, and no existing map is changed, until you accept it.
        </p>

        <label className="mm-field">
          <span>Idea or topic *</span>
          <textarea
            rows={4}
            maxLength={1000}
            value={form.topic}
            placeholder={EXAMPLE}
            disabled={loading}
            autoFocus
            onChange={(e) => update("topic", e.target.value)}
          />
        </label>

        <label className="mm-field">
          <span>Purpose of the map</span>
          <input
            maxLength={300}
            value={form.purpose}
            placeholder="e.g. Learning roadmap, project plan, study notes"
            disabled={loading}
            onChange={(e) => update("purpose", e.target.value)}
          />
        </label>

        <div className="mm-field-row">
          <label className="mm-field">
            <span>Depth</span>
            <select value={form.depth} disabled={loading} onChange={(e) => update("depth", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {d} level{d > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="mm-field">
            <span>Branches per node (approx.)</span>
            <select value={form.branches} disabled={loading} onChange={(e) => update("branches", Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mm-field">
          <span>Constraints (optional)</span>
          <input
            maxLength={500}
            value={form.constraints}
            placeholder="e.g. Focus on free resources, keep it beginner friendly"
            disabled={loading}
            onChange={(e) => update("constraints", e.target.value)}
          />
        </label>

        {error && (
          <div className="mm-banner error" role="alert">
            {error}
          </div>
        )}

        <div className="mm-modal-actions">
          {loading ? (
            <>
              <span className="mm-spinner-text">
                <span className="mm-spinner" /> Generating… this can take up to a minute
              </span>
              <button type="button" className="mm-btn" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="mm-btn" onClick={onClose}>
                Close
              </button>
              <button type="submit" className="mm-btn primary">
                {error ? "Retry" : "Generate"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
