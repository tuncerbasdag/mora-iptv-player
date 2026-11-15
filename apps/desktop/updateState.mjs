/**
 * Update state machine (pure, testable). `updater.mjs` feeds it electron-updater events; the result is sent to
 * the Settings → Update page. Statuses:
 * disabled | idle | checking | available | downloading | ready | up-to-date | error
 */

/** @typedef {'auto' | 'manual' | 'disabled'} UpdatePolicy */

export function initialState({ currentVersion, policy }) {
  return { status: policy === 'disabled' ? 'disabled' : 'idle', currentVersion, policy };
}

const base = (s) => ({ currentVersion: s.currentVersion, policy: s.policy });
const inFlight = (s) => s.status === 'downloading' || s.status === 'ready';

/**
 * Events: checking | available{version} | not-available | download-started | progress{percent} |
 * downloaded{version} | error{message, silent}. A silent error (a background check that failed, e.g. offline)
 * returns to idle instead of showing an error.
 */
export function reduceUpdate(state, event) {
  if (state.status === 'disabled') return state;
  switch (event.type) {
    case 'checking':
      return inFlight(state) ? state : { ...base(state), status: 'checking' };
    case 'available':
      return inFlight(state) ? state : { ...base(state), status: 'available', version: event.version };
    case 'not-available':
      return state.status === 'checking' ? { ...base(state), status: 'up-to-date' } : state;
    case 'download-started':
      return state.status === 'available' ? { ...state, status: 'downloading', percent: 0 } : state;
    case 'progress':
      return state.status === 'downloading' ? { ...state, percent: Math.max(0, Math.min(100, Math.round(event.percent))) } : state;
    case 'downloaded':
      return { ...base(state), status: 'ready', version: event.version ?? state.version };
    case 'error':
      if (event.silent && state.status === 'checking') return { ...base(state), status: 'idle' };
      return { ...base(state), status: 'error', message: event.message };
    default:
      return state;
  }
}
