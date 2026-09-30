import { Fragment } from 'react';

const CONTROLS: [string, string][] = [
  ['← →', 'Move'],
  ['↓', 'Soft drop'],
  ['Space', 'Hard drop'],
  ['↑ / X', 'Rotate clockwise'],
  ['Z', 'Rotate counter-clockwise'],
  ['C / Shift', 'Hold'],
  ['/', 'Show controls'],
];

export function ControlsList() {
  return (
    <dl className="controls-list">
      {CONTROLS.map(([key, action]) => (
        <Fragment key={key}>
          <dt>
            <kbd>{key}</kbd>
          </dt>
          <dd>{action}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
