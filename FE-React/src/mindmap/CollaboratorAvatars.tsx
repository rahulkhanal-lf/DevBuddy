import UserAvatar from "../components/UserAvatar";
import type { PeerUser } from "./useCollaboration";

interface Props {
  peers: PeerUser[];
  maxVisible?: number;
}

export default function CollaboratorAvatars({ peers, maxVisible = 5 }: Props) {
  if (peers.length === 0) return null;

  const visible = peers.slice(0, maxVisible);
  const overflow = peers.length - maxVisible;

  return (
    <div className="collab-avatars">
      {visible.map((p) => (
        <UserAvatar key={p.id} name={p.name} size={28} title={`${p.name} (${p.email})`} style={{ marginLeft: -8, border: "2px solid var(--surface)" }} />
      ))}
      {overflow > 0 && (
        <div className="collab-overflow" title={`${overflow} more`}>+{overflow}</div>
      )}
    </div>
  );
}
