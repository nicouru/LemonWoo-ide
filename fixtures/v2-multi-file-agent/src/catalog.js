export const PRODUCTS = [
  { sku: "tea", label: "Tea", cents: 350 },
  { sku: "mug", label: "Mug", cents: 1200 }
];

export function findProduct(sku) {
  return PRODUCTS.find((product) => product.sku === sku);
}

