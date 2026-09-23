import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <span aria-hidden className="text-6xl">🧭</span>
        <div className="neo rounded-2xl bg-yellow p-6">
          <h1 className="text-2xl font-black tracking-tight">That page isn&apos;t here.</h1>
          <p className="mt-2 text-sm font-medium text-ink/80">Maybe the link was cut short. Invitation links are long — check it came through whole.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <LinkButton href="/">Home</LinkButton>
            <LinkButton href="/app" fill="blue">Dashboard →</LinkButton>
          </div>
        </div>
      </div>
    </main>
  );
}
