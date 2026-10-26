function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nameColor(name: string): string {
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
    "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

interface Props {
  name: string;
  size?: number;
  title?: string;
  style?: React.CSSProperties;
}

export default function UserAvatar({ name, size = 32, title, style }: Props) {
  const bg = nameColor(name);
  const initials = nameInitials(name);
  const fontSize = Math.max(10, size * 0.38);

  return (
    <div
      title={title ?? name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: "none",
        border: "2px solid var(--surface, #fff)",
        ...style,
      }}
    >
      {initials}
    </div>
  );
}
