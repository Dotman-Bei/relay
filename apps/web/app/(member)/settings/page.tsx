"use client";
import { useEffect, useState } from "react";
import { keyFingerprint, parseRecoveryKit, publicKeyFromJwk } from "@relay/sdk";
import { PageHeader } from "@/components/app-shell";
import { AddrLink } from "@/components/hash";
import { RecoveryKitButton } from "@/components/recovery";
import { RequireAccount } from "@/components/require-account";
import { Button, Notice, Row, Section, Tag } from "@/components/ui";
import { circleTitle, useMetadata, useMyCircles, type MyCircle } from "@/lib/hooks";
import { circleScope, getEncryptionJwk, setCircleKeys, setEncryptionJwk } from "@/lib/keys";
import { networkLabel, useRelay } from "@/lib/relay";
import { setStewardConsent, stewardOptedIn } from "@/lib/steward";
import { useWallet } from "@/lib/wallet";

const NOTIFY = "relay:notify:v1";

function StewardRow({ m }: { m: MyCircle }) {
  const { deployment } = useRelay();
  const { walletClient, address } = useWallet();
  const meta = useMetadata(m.circle);
  const [on, setOn] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (deployment && address) stewardOptedIn(deployment, m.circle.circleId.toString(), address).then(setOn).catch(() => setOn(null));
  }, [deployment, address, m.circle.circleId]);
  return (
    <Row className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-bold">{circleTitle(meta.data, m.circle.circleId)}</span>
      <span className="flex items-center gap-2">
        {err && <span className="text-xs font-bold">{err}</span>}
        <Tag fill={on ? "green" : "panel"}>{on === null ? "Unknown" : on ? "On" : "Off"}</Tag>
        <Button
          size="sm"
          disabled={on === null || !walletClient}
          onClick={async () => {
            try {
              await setStewardConsent(deployment!, walletClient!, m.circle.circleId.toString(), on ? "OPT_OUT" : "OPT_IN");
              setOn(!on);
            } catch (e) {
              setErr((e as Error).message.slice(0, 60));
            }
          }}
        >
          {on ? "Turn off" : "Turn on"}
        </Button>
      </span>
    </Row>
  );
}

function Settings() {
  const { deployment, network, status } = useRelay();
  const w = useWallet();
  const circles = useMyCircles();
  const [fp, setFp] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [notify, setNotify] = useState({ beforeClose: true, eligible: true });

  useEffect(() => {
    if (!w.address) return;
    const jwk = getEncryptionJwk(w.address);
    if (jwk) keyFingerprint(publicKeyFromJwk(jwk)).then(setFp);
    else setFp(null);
  }, [w.address, importMsg]);
  useEffect(() => {
    try {
      setNotify({ beforeClose: true, eligible: true, ...JSON.parse(localStorage.getItem(NOTIFY) ?? "{}") });
    } catch {
      /* defaults */
    }
  }, []);
  const saveNotify = (n: typeof notify) => {
    setNotify(n);
    try {
      localStorage.setItem(NOTIFY, JSON.stringify(n));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader title="Settings" lead="Everything here lives in this browser, except Memory Steward choices, which you sign and send to the steward." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="🔑 Signing">
          <div className="grid gap-2 text-sm">
            <p className="font-bold">
              <AddrLink address={w.address!} label={w.address!} />
            </p>
            <p className="font-medium text-ink/80">{w.kind === "injected" ? "Browser wallet" : w.kind === "fixture" ? "LOCAL FIXTURE development account" : "Browser session key (testnet trials only)"}</p>
            {w.kind === "injected" && deployment && w.walletChainId !== deployment.chainId && <Button fill="blue" onClick={w.switchNetwork}>Switch wallet to {deployment.label}</Button>}
            {w.kind === "session" && (
              <div className="grid grid-cols-1 gap-2">
                <Button onClick={() => setShowKey((s) => !s)}>{showKey ? "Hide session key" : "Reveal session key to back it up"}</Button>
                {showKey && <p className="neo-flat rounded-lg bg-yellow p-2 font-mono text-[11px] font-bold break-all">{w.exportSessionKey()}</p>}
              </div>
            )}
            <Button onClick={w.disconnect}>Disconnect</Button>
          </div>
        </Section>

        <Section title="🗝️ Encryption key and recovery">
          <div className="grid gap-3 text-sm">
            {fp ? <p className="neo-flat w-fit rounded-lg bg-green px-2 py-1 font-mono text-xs font-bold">fingerprint {fp.slice(0, 18)}…</p> : <Notice tone="warn" title="No encryption key in this browser">Import your recovery kit, or create a key during your next consent.</Notice>}
            {fp && w.address && <RecoveryKitButton account={w.address} />}
            <label className="neo-btn w-fit cursor-pointer rounded-lg bg-panel px-4 py-2 text-sm">
              Import recovery kit…
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f || !w.address || !deployment) return;
                  try {
                    const { kit, privateJwk, circleKeys } = await parseRecoveryKit(await f.text());
                    if (kit.account && kit.account.toLowerCase() !== w.address.toLowerCase()) throw new Error(`This kit belongs to ${kit.account}`);
                    setEncryptionJwk(w.address, privateJwk);
                    setCircleKeys(circleScope(deployment.chainId, deployment.contract.address), circleKeys);
                    window.dispatchEvent(new Event("relay:keys-changed"));
                    setImportMsg({ ok: true, text: `Restored your key and ${Object.keys(circleKeys).length} Circle key(s).` });
                  } catch (err) {
                    setImportMsg({ ok: false, text: (err as Error).message });
                  }
                }}
              />
            </label>
            {importMsg && <Notice tone={importMsg.ok ? "ok" : "error"} title={importMsg.ok ? "Recovery kit imported" : "Couldn't import that kit"}>{importMsg.text}</Notice>}
          </div>
        </Section>

        <Section title="🔔 Notifications">
          <div className="grid gap-2 text-sm">
            <p className="font-medium text-ink/80">Relay stores no email or phone number. Reminders appear on your dashboard in this browser.</p>
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="accent-black" checked={notify.beforeClose} onChange={(e) => saveNotify({ ...notify, beforeClose: e.target.checked })} />
              Remind me before contributions close
            </label>
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="accent-black" checked={notify.eligible} onChange={(e) => saveNotify({ ...notify, eligible: e.target.checked })} />
              Show when a capsule becomes release-eligible
            </label>
          </div>
        </Section>

        <Section title="🤖 Memory Steward consent">
          <div className="grid gap-2 text-sm">
            <p className="font-medium text-ink/80">Off unless you turn it on, per Circle. Turning it off stops future actions and never touches the Circle&apos;s rule.</p>
            {!deployment?.steward.url ? (
              <p className="font-bold text-ink/70">No steward on this network.</p>
            ) : (circles.data ?? []).length === 0 ? (
              <p className="font-bold text-ink/70">Join a Circle first.</p>
            ) : (
              (circles.data ?? []).map((m) => <StewardRow key={m.circle.circleId.toString()} m={m} />)
            )}
          </div>
        </Section>

        <Section title="🌐 Network" className="md:col-span-2">
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            {[
              ["Network", networkLabel(deployment, network)],
              ["Status", status?.kind ?? "checking…"],
              ["Chain ID", deployment?.chainId ?? "—"],
              ["Registry", deployment?.contract.address ?? "—"],
              ["Runtime sha256", deployment?.contract.runtimeSha256 ?? "—"],
              ["Source verified", deployment?.contract.verifiedSource ?? "—"],
              ["Release quorum", deployment ? `${deployment.quorum.defaultThreshold}-of-${deployment.quorum.relayers.length} · ${deployment.quorum.independence}` : "—"],
              ["Storage", deployment ? `${deployment.storage.url} · ${deployment.storage.label}` : "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="neo-flat rounded-lg bg-panel p-2">
                <dt className="neo-label text-[10px] text-ink/70">{k}</dt>
                <dd className="font-mono font-bold break-all">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Settings />
    </RequireAccount>
  );
}
