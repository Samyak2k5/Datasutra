import Button from "./Button";

export default function RequestError({ message, onRetry }) {
  if (!message) return null;
  return <div role="alert" className="ds-card" style={{ padding: 16, marginBottom: 20, color: "var(--color-danger-text)" }}>
    <p>{message}</p>
    {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
  </div>;
}
