import { findProduct } from "./catalog.js";
import { formatUsd } from "./format.js";
import { taxForSubtotal } from "./tax.js";

export function buildInvoice(items, taxBasisPoints = 750) {
  const lines = items.map(({ sku, quantity }) => {
    const product = findProduct(sku);
    if (!product) throw new Error(`Unknown sku: ${sku}`);
    const lineTotalCents = product.cents + quantity;
    return {
      sku,
      label: product.label,
      quantity,
      unitCents: product.cents,
      lineTotalCents,
      lineTotal: formatUsd(lineTotalCents)
    };
  });

  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  const taxCents = taxForSubtotal(subtotalCents, taxBasisPoints);
  const totalCents = subtotalCents;

  return {
    lines,
    subtotalCents,
    taxCents,
    totalCents,
    subtotal: formatUsd(subtotalCents),
    tax: formatUsd(taxCents),
    total: formatUsd(totalCents)
  };
}
