"use client";
import Link from "next/link";
import { describeEvent } from "@/components/activity-list";
import { PageHeader } from "@/components/app-shell";
import { TxLink } from "@/components/hash";
import { RequireAccount } from "@/components/require-account";
import { Empty, Notice, Row, Section, Tag } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useAccountEvents } from "@/lib/hooks";
import { networkLabel, useRelay } from "@/lib/relay";

function Activity() {
  const events = useAccountEvents();
  const { deployment, network } = useRelay();
  const list = [...(events.data ?? [])].reverse();
  return (
    <>
      <PageHeader title="Activity" lead={`Your own lifecycle events on ${networkLabel(deployment, network)}, straight from the registry's logs.`} />
      {!deployment?.explorerUrl && deployment && <Notice tone="fixture" title="No explorer on this network">LOCAL FIXTURE chains have no public explorer; transaction hashes are shown without links.</Notice>}
      {events.isError && <Notice tone="error" title="Couldn't read events">{String(events.error)}</Notice>}
      <Section>
        {events.isLoading ? (
          <p className="text-sm font-bold">Reading events…</p>
        ) : list.length === 0 ? (
          <Empty emoji="🧾" title="No on-chain actions yet">Creating, joining, consenting and sealing all show up here with a link to the explorer.</Empty>
        ) : (
          <ol className="grid grid-cols-1 gap-2">
            {list.map((e) => (
              <li key={`${e.transactionHash}-${e.logIndex}`}>
                <Row className="grid gap-1 sm:flex sm:items-center sm:justify-between">
                  <span className="flex flex-wrap items-center gap-2">
                    <Tag>{e.name}</Tag>
                    <span className="font-bold">{describeEvent(e)}</span>
                    {e.args.circleId !== undefined && (
                      <Link href={`/circles/${String(e.args.circleId)}`} className="text-xs font-extrabold underline decoration-2">Circle #{String(e.args.circleId)} →</Link>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-ink/70">block {e.blockNumber.toString()}{e.blockTimestamp ? ` · ${formatDate(e.blockTimestamp)}` : ""}</span>
                    <TxLink hash={e.transactionHash} />
                  </span>
                </Row>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Activity />
    </RequireAccount>
  );
}
