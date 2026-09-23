"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { createPublicClient, http, type PublicClient } from "viem";
import { verifyFromChain, type VerifierReport } from "@relay/verifier";
import { NetworkBanner } from "@/components/network-banner";
import { RelayOnlyProviders } from "../../../providers";
import { ChainTime } from "@/components/chain-time";
import { TxLink } from "@/components/hash";
import { LifecycleTag } from "@/components/state";
import { Button, cx, Empty, Highlight, Notice, Row, Section, Tag } from "@/components/ui";
import { formatDate, shortAddr, shortHash } from "@/lib/format";
import { parseId } from "@/lib/hooks";
import { useRelay } from "@/lib/relay";

function Verdict({ r }: { r: VerifierReport }) {
  const ok = r.verdict === "VALID";
  return (
    <div className={cx("neo rounded-2xl p-5", ok ? "bg-green" : "bg-red")}>
      <p className="neo-label text-xs">Verifier verdict · {r.label}</p>
      <p className="mt-1 text-4xl font-black">{ok ? "Valid history ✓" : "Invalid history ✗"}</p>
      <p className="mt-1 text-sm font-bold text-ink/80">
        {ok ? "Every event obeys the lifecycle rules, and the replay matches the contract's own view." : `${r.violations.length} violation${r.violations.length === 1 ? "" : "s"} found.`}
      </p>
      {!ok && (
        <ul className="mt-2 list-disc pl-5 text-sm font-medium">
          {r.violations.map((v) => <li key={v}>{v}</li>)}
        </ul>
      )}
    </div>
  );
}

function VerifyView() {
  const id = parseId(useParams().capsuleId as string);
  const sp = useSearchParams();
  const { deployment, store, loading } = useRelay();
  const rpc = sp.get("rpc") ?? deployment?.rpcUrl ?? null;
  const registry = (sp.get("registry") ?? deployment?.contract.address ?? null) as `0x${string}` | null;
  const from = BigInt(sp.get("from") ?? deployment?.contract.deploymentBlock ?? 0);
  const independent = Boolean(sp.get("rpc") || sp.get("registry"));
  const client = useMemo(() => (rpc ? (createPublicClient({ transport: http(rpc, { batch: { batchSize: 32, wait: 16 } }) }) as PublicClient) : null), [rpc]);

  const report = useQuery({
    queryKey: ["verify", rpc, registry, id?.toString()],
    enabled: Boolean(client && registry && id),
    queryFn: () =>
      verifyFromChain({
        circleId: id!,
        client: client!,
        rpcUrl: rpc!,
        registry: registry!,
        deploymentBlock: from,
        deployment: independent ? null : deployment,
        storage: independent ? null : store,
        ...(deployment && !independent ? { label: deployment.label } : {}),
      }),
    retry: false,
  });

  if (!id) return <Empty emoji="🧭" title="That isn't a capsule id" />;
  if (loading) return <p className="mt-10 text-sm font-bold">Loading network configuration…</p>;
  if (!rpc || !registry) {
    return (
      <Notice tone="warn" title="Nothing to verify on this network yet">
        There is no deployment record here. You can still run the verifier against any registry: add <code className="font-mono">?rpc=…&amp;registry=0x…&amp;from=block</code> to this URL, or use the CLI.
      </Notice>
    );
  }
  const r = report.data;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relay-verify-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <Section title="Source">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="neo-flat rounded-lg bg-panel p-2"><dt className="neo-label text-xs text-ink/70">RPC</dt><dd className="font-mono font-bold break-all">{rpc}</dd></div>
          <div className="neo-flat rounded-lg bg-panel p-2"><dt className="neo-label text-xs text-ink/70">Registry</dt><dd className="font-mono font-bold break-all">{registry}</dd></div>
          {r && (
            <>
              <div className="neo-flat rounded-lg bg-panel p-2"><dt className="neo-label text-xs text-ink/70">Chain · block observed</dt><dd className="font-mono font-bold">{r.source.chainId} · {r.source.observedAtBlock}</dd></div>
              <div className={cx("neo-flat rounded-lg p-2", r.source.bytecodeMatches ? "bg-green" : "bg-red")}>
                <dt className="neo-label text-xs text-ink/70">Bytecode vs audited build</dt>
                <dd className="font-mono font-bold">{r.source.bytecodeMatches ? "matches" : "DOES NOT MATCH"} · {r.source.runtimeSha256?.slice(0, 16)}…</dd>
              </div>
            </>
          )}
        </dl>
        <p className="mt-2 text-xs font-bold text-ink/70">
          {independent ? "Independent mode: using only the RPC and registry from the URL. No Relay configuration is used." : "Using this site's deployment record for the RPC and relayer labels. Append ?rpc=…&registry=… to use your own."}
        </p>
      </Section>

      {report.isLoading && <p className="text-sm font-bold">Replaying events from the chain…</p>}
      {report.isError && <Notice tone="error" title="The verifier couldn't finish">{String(report.error)}</Notice>}

      {r && (
        <>
          <Verdict r={r} />
          {r.rule && (
            <Section title="The original rule">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <Row>Contributions closed <ChainTime unix={r.rule.sealAt} className="block" /></Row>
                <Row fill="yellow">Release no earlier than <ChainTime unix={r.rule.releaseAt} className="block" /></Row>
                <Row>{r.rule.minContributions} contributions · {r.rule.unanimousConsent ? "unanimous consent" : "contributors consent"} · capacity {r.rule.capacity}</Row>
                <Row>{r.rule.receiptThreshold}-of-{r.rule.relayers.length} receipts · expiry {r.rule.expiresAt ? formatDate(r.rule.expiresAt) : "none"}</Row>
              </div>
              <p className="mt-2 font-mono text-xs font-bold break-all text-ink/60">
                rule hash {r.rule.policyHash} · recomputed {r.rule.policyHashValid ? "✓ matches" : "✗ MISMATCH"} · {r.rule.lockedByNonCreatorConsent ? "locked by member consent" : "never locked"}
              </p>
            </Section>
          )}

          <Section title="Evaluation">
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {r.evaluation.lifecycle && <LifecycleTag state={r.evaluation.lifecycle} />}
                {r.evaluation.delivery?.kind === "RELEASE_UNAVAILABLE" && <Tag fill="orange">RELEASE UNAVAILABLE · {r.evaluation.delivery.missing} missing</Tag>}
              </div>
              {r.evaluation.eligibility ? (
                <Row fill={r.evaluation.eligibility.ruleSatisfied ? "green" : "red"}>
                  Eligibility recorded at {formatDate(r.evaluation.eligibility.at)} (chain time {r.evaluation.eligibility.at}) — release date {r.evaluation.eligibility.at >= r.evaluation.eligibility.releaseAt ? "had passed ✓" : "had NOT passed ✗"};{" "}
                  {r.evaluation.eligibility.contributions}/{r.evaluation.eligibility.minContributions} contributions; {r.evaluation.eligibility.consents}/{r.evaluation.eligibility.members} consents.
                  <b> Rule satisfied: {r.evaluation.eligibility.ruleSatisfied ? "yes" : "NO"}.</b>
                </Row>
              ) : (
                <p className="font-bold text-ink/70">No release has been recorded.</p>
              )}
              <p className="font-bold">Cross-check with contract views: {r.crossCheck.performed ? (r.crossCheck.matches ? "matches ✓" : "DIFFERS ✗") : "not performed"}</p>
              <p className="font-medium text-ink/80">Admin authority: {r.adminAuthority}</p>
            </div>
          </Section>

          <Section title={`Event sequence · ${r.events.length}`}>
            <ol className="grid grid-cols-1 gap-2">
              {r.events.map((e) => (
                <li key={`${e.transactionHash}-${e.logIndex}`}>
                  <Row fill={e.accepted ? "panel" : "red"} className="grid gap-1 text-xs sm:flex sm:items-center sm:justify-between">
                    <span className="font-bold">{e.accepted ? "✓" : "✗"} {e.summary}{e.violation ? ` — ${e.violation}` : ""}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink/70">#{e.blockNumber} · {formatDate(e.timestamp)}</span>
                      {e.explorerUrl ? <a href={e.explorerUrl} target="_blank" rel="noreferrer" className="hash-link">{shortHash(e.transactionHash)} ↗</a> : <TxLink hash={e.transactionHash} />}
                    </span>
                  </Row>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Release relayers">
            <ul className="grid grid-cols-1 gap-2">
              {r.relayers.map((rl) => (
                <li key={rl.address}>
                  <Row className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold">{shortAddr(rl.address)}</span>
                      <span className="font-bold">{rl.label}</span>
                      <Tag fill={rl.independence === "INDEPENDENT" ? "green" : rl.independence === "LOCAL FIXTURE" ? "lime" : "orange"}>{rl.independence}</Tag>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Tag fill={rl.receiptDigest ? "green" : "panel"}>{rl.receiptDigest ? `receipt ${shortHash(rl.receiptDigest)}` : "no receipt"}</Tag>
                      {rl.delivery && <Tag fill={rl.delivery.signatureValid ? "green" : "red"}>{rl.delivery.signatureValid ? `signed delivery · ${rl.delivery.coverage}` : `delivery unverified${rl.delivery.error ? `: ${rl.delivery.error.slice(0, 40)}` : ""}`}</Tag>}
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Evidence limitations" fill="purple">
            <ul className="grid gap-2 text-sm font-medium">
              {r.limitations.map((l) => <li key={l} className="neo-sm rounded-xl bg-panel px-3 py-2">{l}</li>)}
            </ul>
          </Section>

          <Section title="Reproduce it yourself">
            <p className="text-sm font-medium text-ink/80">The same code runs from a terminal. It never contacts Relay&apos;s servers:</p>
            <pre tabIndex={0} aria-label="Verifier command" className="neo-flat mt-2 overflow-x-auto rounded-xl bg-ink p-3 text-xs font-bold text-panel">
              {`pnpm --filter @relay/verifier exec tsx src/cli.ts \\\n  --rpc ${rpc} \\\n  --registry ${registry} --from-block ${from} --circle ${id}`}
            </pre>
            <Button className="mt-3" onClick={download}>Download report JSON</Button>
          </Section>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  const id = useParams().capsuleId as string;
  return (
    <RelayOnlyProviders>
      <div className="mt-3">
        <NetworkBanner />
      </div>
      <div className="mt-12 grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl">
          Verify capsule <Highlight fill="green">#{id}</Highlight>
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-medium text-ink/80">
          Read-only. This page replays the capsule&apos;s events from the chain in your browser, checks each one against the protocol&apos;s rules, and tells you whether any recorded release was
          eligible under the original rule.
        </p>
      </div>
      <Suspense>
        <VerifyView />
      </Suspense>
      </div>
    </RelayOnlyProviders>
  );
}
