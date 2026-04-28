import type { ReactElement, ReactNode } from "react";

type MessageProps = {
  kind: "error" | "success" | "info";
  children: ReactNode;
};

export default function Message({ kind, children }: MessageProps): ReactElement {
  return (
    <div className={`message ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
