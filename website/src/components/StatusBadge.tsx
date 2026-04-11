interface StatusBadgeProps {
  active: boolean;
}

export function StatusBadge({ active }: StatusBadgeProps) {
  const style: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    background: active ? "rgba(0,200,83,0.15)" : "rgba(119,119,170,0.15)",
    color: active ? "#00C853" : "#7777AA",
  };

  return <span style={style}>{active ? "Активна" : "Не активна"}</span>;
}
