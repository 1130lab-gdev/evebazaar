// EVE's static universe names every wormhole (J-space) system exactly "J"
// + 6 digits -- a hard, universal invariant of the game data, not a
// heuristic. Confirmed against map-api's live data: zero of the ~14k
// stargates touch a system matching this pattern, i.e. wormhole space has
// no static jump-graph connectivity at all.
const WORMHOLE_NAME = /^J\d{6}$/;

export function isWormholeSystem(name: string): boolean {
  return WORMHOLE_NAME.test(name);
}
