"use client";
import type { ReactNode } from "react";
import type { TxState } from "@/lib/tx";
import { TxLink } from "./hash";
import { Button, Notice } from "./ui";

/** PRD §9.3: pending is never final; success shows the reference, confirmed state and next action; failure gives a retry. */
export function TxStatus({ state, next, onRetry, confirmedState }: { state: TxState; next?: ReactNode; onRetry?: () => void; confirmedState?: ReactNode }) {
  switch (state.kind) {
    case "idle":
      return null;
    case "preparing":
      return (
        <Notice tone="warn" title={`${state.label}…`}>
          <span aria-live="polite">{state.stage ?? "Preparing"}. Nothing is final until the chain confirms it.</span>
        </Notice>
      );
    case "pending":
      return (
        <Notice tone="warn" title={`${state.label}: waiting for confirmation`}>
          <span aria-live="polite">
            Sent as <TxLink hash={state.hash} />. Not final until it is mined.
          </span>
        </Notice>
      );
    case "success":
      return (
        <Notice tone="ok" title={`${state.label}: confirmed`} action={next}>
          Confirmed in block {state.blockNumber.toString()} · <TxLink hash={state.hash} />
          {confirmedState && <div className="mt-1">{confirmedState}</div>}
        </Notice>
      );
    case "failure":
      return (
        <Notice
          tone="error"
          title={`Couldn't ${state.label.charAt(0).toLowerCase()}${state.label.slice(1)}`}
          action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}
        >
          {state.reason}
          {state.hash && (
            <>
              {" "}
              · <TxLink hash={state.hash} />
            </>
          )}
        </Notice>
      );
  }
}
