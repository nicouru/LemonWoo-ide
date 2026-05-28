import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoice } from "../src/invoice.js";

test("buildInvoice calculates cents, tax, and formatted totals", () => {
  const invoice = buildInvoice(
    [
      { sku: "tea", quantity: 2 },
      { sku: "mug", quantity: 1 }
    ],
    750
  );

  assert.deepEqual(
    invoice.lines.map((line) => ({
      sku: line.sku,
      lineTotalCents: line.lineTotalCents,
      lineTotal: line.lineTotal
    })),
    [
      { sku: "tea", lineTotalCents: 700, lineTotal: "$7.00" },
      { sku: "mug", lineTotalCents: 1200, lineTotal: "$12.00" }
    ]
  );
  assert.equal(invoice.subtotalCents, 1900);
  assert.equal(invoice.taxCents, 143);
  assert.equal(invoice.totalCents, 2043);
  assert.equal(invoice.subtotal, "$19.00");
  assert.equal(invoice.tax, "$1.43");
  assert.equal(invoice.total, "$20.43");
});

