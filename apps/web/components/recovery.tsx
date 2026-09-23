"use client";
import { buildRecoveryKit } from "@relay/sdk";
import { circleScope, getCircleKeys, getEncryptionJwk } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { Button } from "./ui";

/** Downloads the recovery kit: the encryption key and the Circle keys this browser holds. */
export function RecoveryKitButton({ account, onSaved, label = "Download recovery kit" }: { account: `0x${string}`; onSaved?: () => void; label?: string }) {
  const { deployment } = useRelay();
  const save = async () => {
    const jwk = getEncryptionJwk(account);
    if (!jwk) return;
    const circleKeys = deployment ? getCircleKeys(circleScope(deployment.chainId, deployment.contract.address)) : {};
    const kit = await buildRecoveryKit({ account, privateJwk: jwk, circleKeys });
    const url = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relay-recovery-${account.slice(2, 8).toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onSaved?.();
  };
  return (
    <Button fill="yellow" onClick={save}>
      {label}
    </Button>
  );
}
