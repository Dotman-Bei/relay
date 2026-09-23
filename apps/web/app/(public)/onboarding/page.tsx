"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatEther } from "viem";
import { RecoveryKitButton } from "@/components/recovery";
import { Button, cx, Highlight, LinkButton, Notice, Tag } from "@/components/ui";
import { shortAddr } from "@/lib/format";
import { acknowledgeRecovery, ensureEncryptionKey, getEncryptionJwk, recoveryAcknowledged } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { FIXTURE_KEYS, useWallet } from "@/lib/wallet";
import { privateKeyToAccount } from "viem/accounts";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="neo-sm rounded-2xl bg-panel p-5">
      <div className="flex items-center gap-3">
        <span className={cx("neo-flat grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg font-black", done ? "bg-green" : "bg-yellow")}>{done ? "✓" : n}</span>
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const { deployment, network, client } = useRelay();
  const w = useWallet();
  const [fp, setFp] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [checked, setChecked] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [faucet, setFaucet] = useState<string | null>(null);

  useEffect(() => {
    if (!w.address) return;
    setAck(recoveryAcknowledged(w.address));
    if (getEncryptionJwk(w.address)) ensureEncryptionKey(w.address).then((k) => setFp(k.fingerprint));
    else setFp(null);
  }, [w.address]);

  useEffect(() => {
    if (!w.address || !client) return;
    client.getBalance({ address: w.address }).then(setBalance).catch(() => setBalance(null));
  }, [w.address, client]);

  useEffect(() => {
    fetch("/relay/testnet.probe.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setFaucet((p as { documented?: { faucetUrl?: string } } | null)?.documented?.faucetUrl ?? null))
      .catch(() => setFaucet(null));
  }, []);

  const wrongChain = w.kind === "injected" && deployment && w.walletChainId !== null && w.walletChainId !== deployment.chainId;

  return (
    <div className="mt-12 grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl">
          Before you <Highlight fill="yellow">seal</Highlight> anything
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-medium text-ink/80">
          Three steps. Relay keeps no account on a server: your signing key and your encryption key both live with you, and that is also why only you can lose them.
        </p>
      </div>

      <Step n={1} title="Choose how you sign" done={Boolean(w.address)}>
        {w.address ? (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-sm font-bold">
              Signed in as <span className="font-mono">{shortAddr(w.address)}</span> with{" "}
              {w.kind === "injected" ? "your browser wallet" : w.kind === "fixture" ? "a LOCAL FIXTURE development account" : "a browser session key"}.
              {balance !== null && deployment && (
                <span className="font-medium text-ink/70"> Balance {Number(formatEther(balance)).toFixed(4)} {deployment.nativeSymbol}.</span>
              )}
            </p>
            {wrongChain && (
              <Notice tone="warn" title={`Your wallet is on chain ${w.walletChainId}`} action={<Button size="sm" fill="blue" onClick={w.switchNetwork}>Switch to {deployment?.label}</Button>}>
                Relay reads and writes {deployment?.label} (chain {deployment?.chainId}).
              </Notice>
            )}
            {balance === 0n && network !== "local" && (
              <Notice tone="info" title="You need a little test BOT for gas">
                Consenting and contributing are transactions. {faucet ? <>Claim test tokens at <a className="underline decoration-2" href={faucet} target="_blank" rel="noreferrer">the official BOT Chain faucet ↗</a>.</> : "Use the official BOT Chain testnet faucet."}
              </Notice>
            )}
            <button type="button" onClick={w.disconnect} className="w-fit text-xs font-extrabold underline decoration-2 underline-offset-2">Use a different account</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={w.connectInjected} className="neo-btn flex flex-col items-start gap-1 rounded-xl bg-blue p-4 text-left">
              <span className="text-lg font-black">🦊 Browser wallet</span>
              <span className="text-sm font-medium text-ink/80">{w.hasInjected ? "MetaMask, Rabby, BO Wallet or any injected wallet." : "No wallet detected in this browser."}</span>
            </button>
            <button type="button" onClick={w.chooseSessionKey} className="neo-btn flex flex-col items-start gap-1 rounded-xl bg-panel p-4 text-left">
              <span className="text-lg font-black">🧪 Browser session key</span>
              <span className="text-sm font-medium text-ink/80">A key kept in this browser. For testnet trials only — anyone using this browser profile can use it.</span>
            </button>
            <div aria-disabled="true" className="neo-flat flex flex-col items-start gap-1 rounded-xl bg-bg p-4">
              <span className="flex items-center gap-2 text-lg font-black">🔐 Passkey <Tag fill="pink">Unavailable</Tag></span>
              <span className="text-sm font-medium text-ink/80">
                BOT Chain testnet documents ERC-4337 with an ECDSA account factory, but no passkey-capable account. We won&apos;t fake one.
              </span>
            </div>
            {network === "local" && (
              <div className="neo-sm flex flex-col gap-2 rounded-xl bg-lime p-4">
                <span className="text-lg font-black">🧰 LOCAL FIXTURE accounts</span>
                <span className="text-sm font-medium text-ink/80">Anvil&apos;s public dev keys. Only work on this machine&apos;s chain.</span>
                <div className="flex flex-wrap gap-2">
                  {FIXTURE_KEYS.map((k, i) => (
                    <Button key={k} size="sm" onClick={() => w.chooseFixture(i)}>
                      #{i + 1} {shortAddr(privateKeyToAccount(k).address)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {w.error && <div className="sm:col-span-2"><Notice tone="error" title="Couldn't connect">{w.error}</Notice></div>}
          </div>
        )}
      </Step>

      <Step n={2} title="Create your encryption key" done={Boolean(fp)}>
        <div className="grid gap-3 text-sm font-medium text-ink/80">
          <p>
            This key is how relayers hand you your share of a reveal. It is generated here, in this browser. When you consent to a Circle, only its <b className="text-ink">fingerprint</b> goes on-chain; the
            public half goes to storage; the private half never leaves this device.
          </p>
          {fp ? (
            <p className="neo-flat w-fit rounded-lg bg-green px-3 py-2 font-mono text-xs font-bold text-ink">fingerprint {fp.slice(0, 18)}…{fp.slice(-6)}</p>
          ) : (
            <Button fill="blue" className="w-fit" disabled={!w.address} onClick={async () => setFp((await ensureEncryptionKey(w.address!)).fingerprint)}>
              {w.address ? "Create my encryption key" : "Choose how you sign first"}
            </Button>
          )}
        </div>
      </Step>

      <Step n={3} title="Save your recovery kit" done={ack}>
        <div className="grid gap-3 text-sm font-medium text-ink/80">
          <p>
            Relay can&apos;t recover this key for you. The kit is a file with your encryption key and the keys of Circles you&apos;ve joined. Keep it somewhere safe and private: whoever holds it can open your
            share of every reveal.
          </p>
          {w.address && fp ? (
            <>
              <RecoveryKitButton account={w.address} onSaved={() => setChecked(true)} />
              <label className="flex items-start gap-2 font-bold text-ink">
                <input type="checkbox" className="mt-1 accent-black" checked={checked || ack} onChange={(e) => setChecked(e.target.checked)} />
                I saved it. I understand nobody else can restore it.
              </label>
              <Button
                fill="yellow"
                size="lg"
                className="w-fit"
                disabled={!(checked || ack)}
                onClick={() => {
                  acknowledgeRecovery(w.address!);
                  setAck(true);
                  // Invitation links carry their secret in the #fragment; a full navigation keeps it intact.
                  if (next.includes("#")) window.location.assign(next);
                  else router.push(next);
                }}
              >
                {checked || ack ? "Continue →" : "Save the kit to continue"}
              </Button>
            </>
          ) : (
            <p className="font-bold">Finish steps 1 and 2 first.</p>
          )}
        </div>
      </Step>

      <p className="text-sm font-bold text-ink/70">
        Just looking? <LinkButton href="/how-it-works" size="sm">How it works →</LinkButton>
      </p>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
