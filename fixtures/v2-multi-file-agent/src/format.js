export function formatUsd(cents) {
  return `$${(cents / 10).toFixed(2)}`;
}

