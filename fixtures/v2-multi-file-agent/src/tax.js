export function taxForSubtotal(subtotalCents, rateBasisPoints) {
  return Math.floor((subtotalCents * rateBasisPoints) / 10000);
}
