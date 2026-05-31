import { useEffect, useMemo, useState } from "react";
import {
  MeshNameInput,
  createClockSync,
  useEventLog,
  useFairRng,
  useMeshSlot,
  useNamedPeer,
  usePhase,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Answer = { round: number; peerId: string; text: string; ts: number };

const LETTERS = "ABCDEFGHIJKLMNOPRSTW".split("");
const CATEGORIES = [
  "Movie",
  "Animal",
  "Food",
  "City",
  "Sport",
  "Famous Person",
  "Verb",
  "Color",
  "Book",
  "Tool",
  "Job",
  "Plant",
  "Game",
];
const SLOT_MS = 30_000;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="namegame-screen">
        <h1>name game</h1>
        <p className="namegame-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf } = useNamedPeer(config, room);
  const fairRng = useFairRng(room, "namegame-salts");
  const phase = usePhase<"lobby" | "round" | "reveal">(room, "phase", "lobby");
  const answers = useEventLog<Answer>(room, "answers");
  const clock = useMemo(() => (room ? createClockSync(room.provider) : null), [room]);
  useEffect(() => () => clock?.destroy(), [clock]);
  const slot = useMeshSlot(clock, SLOT_MS);

  const phaseMap = room.doc.getMap<number>("phase");
  const roundN = (phaseMap.get("round") as number | undefined) ?? 0;
  const baselineSlot = (phaseMap.get("baselineSlot") as number | undefined) ?? 0;

  const [draft, setDraft] = useState("");
  const trimmedName = name.trim();

  const letter =
    fairRng.seed != null ? fairRng.shuffle(LETTERS)[roundN % LETTERS.length]! : LETTERS[0]!;
  const category =
    fairRng.seed != null
      ? fairRng.shuffle(CATEGORIES)[roundN % CATEGORIES.length]!
      : CATEGORIES[0]!;

  // Auto-advance to reveal when slot expires.
  useEffect(() => {
    if (phase.phase !== "round") return;
    if (slot.slotId > baselineSlot + roundN) {
      phase.transition("reveal", { from: "round" });
    }
  }, [slot.slotId, phase, baselineSlot, roundN]);

  const currentAnswers = answers.events.filter((a) => a.round === roundN);
  const validAnswers = currentAnswers.filter((a) => a.text.trim().toUpperCase().startsWith(letter));
  const winner = validAnswers[0];

  const start = () => {
    room.doc.transact(() => {
      phaseMap.set("baselineSlot", slot.slotId);
      phaseMap.set("round", 0);
    });
    phase.transition("round", { from: "lobby" });
  };

  const nextRound = () => {
    room.doc.transact(() => {
      phaseMap.set("round", roundN + 1);
    });
    phase.transition("round", { from: "reveal" });
  };

  // Any peer may close the round early once answers are in, instead of
  // waiting out the 30s slot timer. The transition writes to the Yjs doc,
  // so every peer flips to "reveal" and agrees on the winner.
  const reveal = () => {
    phase.transition("reveal", { from: "round" });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || !trimmedName || phase.phase !== "round") return;
    answers.push({ round: roundN, peerId: room.peerId, text, ts: Date.now() });
    setDraft("");
  };

  const canSubmit = phase.phase === "round" && !!trimmedName;
  const pct = Math.round(slot.progress * 100);

  return (
    <div className="namegame-screen">
      <header className="namegame-header">
        <h1>name game</h1>
        <p className="namegame-status">
          {room.peerCount + 1} player{room.peerCount === 0 ? "" : "s"} · phase {phase.phase}
        </p>
      </header>

      <MeshNameInput
        className="namegame-name"
        placeholder="your name"
        value={name}
        onChange={setName}
        maxLength={24}
      />

      <div className="namegame-prompt">
        round {roundN} · letter {letter} · category {category}
      </div>

      <div className="namegame-progress" aria-hidden="true">
        <div
          className="namegame-progress-bar"
          style={{ opacity: phase.phase === "round" ? 1 : 0.3, width: `${pct}%` }}
        />
      </div>

      <form
        className="namegame-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="namegame-input"
          placeholder="your answer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSubmit}
          maxLength={64}
        />
        <button
          type="submit"
          className="namegame-submit"
          aria-label="submit"
          disabled={!canSubmit || !draft.trim()}
        >
          submit
        </button>
      </form>

      {phase.phase === "lobby" && (
        <button type="button" className="namegame-start" onClick={start} disabled={!trimmedName}>
          start
        </button>
      )}

      {phase.phase === "round" && (
        <button type="button" className="namegame-reveal" onClick={reveal}>
          reveal winner
        </button>
      )}

      {phase.phase === "reveal" && winner && (
        <div className="namegame-winner">
          winner: <strong>{nameOf(winner.peerId) ?? winner.peerId.slice(0, 6)}</strong> —{" "}
          {winner.text}
        </div>
      )}

      {phase.phase === "reveal" && !winner && (
        <div className="namegame-winner">no valid answer this round</div>
      )}

      {phase.phase === "reveal" && (
        <button type="button" className="namegame-next" onClick={nextRound}>
          next round
        </button>
      )}

      <ul className="namegame-answers">
        {currentAnswers.map((a, i) => {
          const ok = a.text.trim().toUpperCase().startsWith(letter);
          return (
            <li key={`${a.peerId}-${a.ts}-${i}`} className={ok ? "is-valid" : ""}>
              <span className="namegame-author">{nameOf(a.peerId) ?? a.peerId.slice(0, 6)}</span>
              <span className="namegame-text">{a.text}</span>
              {ok && <span aria-label="valid">✅</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
