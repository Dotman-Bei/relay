"use client";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <span aria-hidden className="text-6xl">🫙</span>
        <div className="neo rounded-2xl bg-pink p-6">
          <h1 className="text-2xl font-black tracking-tight">Something slipped.</h1>
          <p className="mt-2 text-sm font-medium text-ink/80">Your capsules are fine — they live on-chain and in storage, not in this screen. This page just tripped.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <LinkButton href="/app" fill="blue">Dashboard →</LinkButton>
          </div>
        </div>
      </div>
    </main>
  );
}
