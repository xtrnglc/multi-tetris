import { useState } from 'react';
import type { GameMode, PlayerId, RoomStateMessage, SlotInfo } from '@mt/engine';
import { session } from '../net/sessionInstance';
import { ControlsList } from './ControlsList';
import { MODE_DESCRIPTIONS, MODE_LABELS } from './labels';
import { Panel } from './Panel';

const MODES: readonly GameMode[] = ['marathon', 'sprint'];

export function LobbyScreen({ room }: { room: RoomStateMessage }) {
  const me = room.players[room.you];
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/r/${room.code}`;

  return (
    <Panel>
      <div className="lobby">
        <p className="dim">ROOM CODE</p>
        <div className="room-code" data-testid="room-code">
          {room.code}
        </div>
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copied!' : 'Copy link'}
        </button>
        <div className="slots">
          {([0, 1] as const).map((p) => (
            <Slot key={p} player={p} info={room.players[p]} you={room.you} />
          ))}
        </div>
        <div className="mode-toggle" role="group" aria-label="Game mode">
          {MODES.map((mode) => (
            <button
              key={mode}
              className={`btn ${room.mode === mode ? 'selected' : ''}`}
              aria-pressed={room.mode === mode}
              onClick={() => {
                if (room.mode !== mode) session.setMode(mode);
              }}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="dim mode-desc">{MODE_DESCRIPTIONS[room.mode]}</p>
        <button className="btn primary" onClick={() => session.setReady(!me?.ready)}>
          {me?.ready ? 'Cancel ready' : 'Ready'}
        </button>
        <button className="btn" onClick={() => session.leave()}>
          Leave
        </button>
        <ControlsList />
      </div>
    </Panel>
  );
}

function Slot({ player, info, you }: { player: PlayerId; info: SlotInfo | null; you: PlayerId }) {
  const label = info === null ? 'Waiting…' : player === you ? 'You' : 'Partner';
  return (
    <div className={`slot p${player + 1} ${info ? '' : 'empty'}`} data-testid={`slot-${player}`}>
      PLAYER {player + 1}
      <br />
      {label}
      {info?.ready && <span className="ready-badge">READY</span>}
    </div>
  );
}
