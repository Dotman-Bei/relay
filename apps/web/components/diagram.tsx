/** The mechanism, drawn in the system's grammar: hard shadows in SVG are a second, offset rect (frontend.md §6). */
function DBox({ x, y, w, h, fill, title, sub }: { x: number; y: number; w: number; h: number; fill: string; title: string; sub: string }) {
  return (
    <g>
      <rect x={x + 6} y={y + 6} width={w} height={h} rx="12" fill="#111" />
      <rect x={x} y={y} width={w} height={h} rx="12" fill={fill} stroke="#111" strokeWidth="3" />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontWeight="900" fontSize="15" fill="#111">{title}</text>
      <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontWeight="600" fontSize="11" fill="#111" opacity="0.75">{sub}</text>
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth="3" markerEnd="url(#arrow)" />
      {label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize="11" fontWeight="800" fill="#111">{label}</text>
      )}
    </g>
  );
}

export function MechanismDiagram() {
  return (
    <svg
      viewBox="0 0 860 360"
      role="img"
      aria-label="Each member's device encrypts their contribution and splits its key into shares for the relayers. The ciphertext goes to content-addressed storage; only its hash goes to the CapsuleRegistry contract on BOT Chain, together with the member's consent. When the contract finds the date and consent rule true, it records release eligibility. Relayers then re-encrypt their key shares to each consenting member and record receipts. With enough receipts, members decrypt. The independent verifier replays the chain events."
      className="h-auto w-full"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#111" />
        </marker>
      </defs>
      <DBox x={20} y={30} w={200} h={70} fill="#ffd93d" title="Member device" sub="encrypts · splits key" />
      <DBox x={330} y={30} w={200} h={70} fill="#ffffff" title="Storage" sub="ciphertext by sha256" />
      <DBox x={330} y={150} w={200} h={80} fill="#b799ff" title="CapsuleRegistry" sub="consent · hashes · the rule" />
      <DBox x={640} y={150} w={200} h={80} fill="#ff9f43" title="Relayers (k of n)" sub="act only after eligibility" />
      <DBox x={20} y={270} w={200} h={70} fill="#4ade80" title="Members open it" sub="k shares → key → plaintext" />
      <DBox x={640} y={270} w={200} h={70} fill="#d3f26a" title="Verifier" sub="replays every event" />
      <Arrow x1={226} y1={62} x2={322} y2={62} label="ciphertext" />
      <Arrow x1={140} y1={106} x2={322} y2={176} label="consent + hash" />
      <Arrow x1={536} y1={190} x2={632} y2={190} label="eligible?" />
      <Arrow x1={700} y1={236} x2={226} y2={300} label="key shares, re-encrypted to members" />
      <Arrow x1={530} y1={236} x2={640} y2={292} />
    </svg>
  );
}
