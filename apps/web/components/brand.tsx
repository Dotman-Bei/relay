import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2" aria-label="Relay home">
      <span className="neo-flat grid h-9 w-9 place-items-center rounded-lg bg-yellow text-lg font-black">R</span>
      <span className="text-xl font-black tracking-tight">Relay</span>
    </Link>
  );
}
