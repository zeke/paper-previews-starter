export const ORDERING_VERSION = 1;

export function creationTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value < 100_000_000_000 ? value * 1000 : value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function groupIdentity(board) {
  const pair = board.name.match(/^(.*?)\s*[·|]\s*(public|admin)\s*$/i);
  if (!pair) return { key: `board:${board.id}`, role: 0 };
  // Keep common A/B public/admin naming pairs together without hardcoding labels.
  const name = pair[1]
    .replace(/^([a-z]*\d+)[ab](?=\s*[·|:-])/i, "$1")
    .trim()
    .toLowerCase();
  return {
    key: `${board.fileId}\0${board.pageId}\0${name}`,
    role: pair[2].toLowerCase() === "public" ? 0 : 1,
  };
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function orderDesigns(boards) {
  const groups = new Map();
  for (const board of boards) {
    const { key, role } = groupIdentity(board);
    if (!groups.has(key)) groups.set(key, { key, members: [] });
    groups.get(key).members.push({ board, role });
  }
  // Use one common basis to keep mixed-metadata comparisons transitive.
  const actual =
    boards.length > 0 &&
    boards.every((board) => Number.isFinite(board.sourceCreatedAt));
  const rank = (board) =>
    actual ? board.sourceCreatedAt : board.createdSequence;
  const rows = [...groups.values()].map((group) => ({
    ...group,
    newest: Math.max(...group.members.map(({ board }) => rank(board))),
    sequence: Math.max(
      ...group.members.map(({ board }) => board.createdSequence),
    ),
  }));
  rows.sort(
    (a, b) =>
      b.newest - a.newest ||
      b.sequence - a.sequence ||
      compareText(a.key, b.key),
  );
  for (const group of rows)
    group.members.sort(
      (a, b) =>
        a.role - b.role ||
        a.board.createdSequence - b.board.createdSequence ||
        compareText(a.board.id, b.board.id),
    );
  return {
    basis: actual ? "creation-metadata" : "first-discovery-sequence",
    boards: rows.flatMap((group) => group.members.map(({ board }) => board)),
  };
}
