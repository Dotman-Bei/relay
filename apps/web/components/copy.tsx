"use client";
import { useState } from "react";
import { Button } from "./ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      fill={done ? "green" : "panel"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </Button>
  );
}

export function InviteLinkList({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-2">
      {links.map((l, i) => (
        <li key={l} className="neo-sm flex items-center gap-2 rounded-xl bg-panel p-2">
          <span className="neo-flat grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-yellow text-sm font-black">{i + 1}</span>
          <input readOnly aria-label={`Invitation link ${i + 1}`} value={l} className="neo-input min-w-0 flex-1 rounded-lg px-2 py-1 font-mono text-[11px]" />
          <CopyButton text={l} />
        </li>
      ))}
    </ul>
  );
}
