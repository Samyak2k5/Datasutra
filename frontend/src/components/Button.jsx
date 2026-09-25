import React from "react";
import { Loader2 } from "lucide-react";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  className = "",
  onClick,
  type = "button",
  ...props
}) {
  const variantClass = `ds-btn-${variant}`;
  const sizeClass = size === "sm" ? "ds-btn-sm" : size === "lg" ? "ds-btn-lg" : "";

  return (
    <button
      type={type}
      className={`ds-btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="spinner" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === "left" && <Icon size={16} />}
          {children}
          {Icon && iconPosition === "right" && <Icon size={16} />}
        </>
      )}
    </button>
  );
}
