const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');

function line(overrides) {
  return Object.assign({
    id: 1,
    name: 'Sample item',
    sku: 'SAMPLE-1',
    hsn: '1006',
    price: 100,
    qty: 1
  }, overrides);
}

function order(items, coupon) {
  const totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 1001,
    date: '01/01/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the same HSN slab and total as the billed order', () => {
  const item = line({ hsn: '1006', price: 640 });
  const currentOrder = order([item]);
  const ledger = pricing.computeTotals(currentOrder.items, currentOrder.coupon);
  const printed = invoice.computeInvoiceFigures(currentOrder);

  assert.equal(ledger.tax, 32);
  assert.equal(ledger.total, 672);
  assert.equal(printed.tax, ledger.tax);
  assert.equal(printed.total, ledger.total);
  assert.equal(printed.rows[0].gstPercent, 5);

  const html = invoice.render(currentOrder);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice applies the capped percentage discount and matches the ledger', () => {
  const item = line({ hsn: 'UNKNOWN', gstRate: 18, price: 3000 });
  const currentOrder = order([item], 'SAVE10');
  const ledger = pricing.computeTotals(currentOrder.items, currentOrder.coupon);
  const printed = invoice.computeInvoiceFigures(currentOrder);

  assert.equal(ledger.discount, 150);
  assert.equal(ledger.tax, 513);
  assert.equal(ledger.total, 3363);
  assert.equal(printed.discount, ledger.discount);
  assert.equal(printed.tax, ledger.tax);
  assert.equal(printed.total, ledger.total);
  assert.equal(printed.rows[0].discount, 150);
  assert.equal(printed.rows[0].taxable, 2850);
  assert.equal(printed.rows[0].lineTax, 513);
  assert.match(invoice.render(currentOrder), /<th class="r">Taxable</th>/);
});

test('invoice taxes the flat-coupon discounted amount like the ledger', () => {
  const item = line({ hsn: 'UNKNOWN', gstRate: 18, price: 1000 });
  const currentOrder = order([item], 'FLAT50');
  const ledger = pricing.computeTotals(currentOrder.items, currentOrder.coupon);
  const printed = invoice.computeInvoiceFigures(currentOrder);

  assert.equal(ledger.discount, 50);
  assert.equal(ledger.tax, 171);
  assert.equal(ledger.cgst, 85.5);
  assert.equal(ledger.sgst, 85.5);
  assert.equal(ledger.total, 1121);
  assert.equal(printed.tax, ledger.tax);
  assert.equal(printed.cgst, ledger.cgst);
  assert.equal(printed.sgst, ledger.sgst);
  assert.equal(printed.total, ledger.total);
  assert.equal(printed.rows[0].discount, 50);
  assert.equal(printed.rows[0].taxable, 950);
  assert.equal(printed.rows[0].lineTax, 171);
});

test('invoice line GST sums to the same rounded summary as the ledger', () => {
  const items = [
    line({ id: 1, hsn: 'UNKNOWN', gstRate: 18, price: 0.03 }),
    line({ id: 2, hsn: 'UNKNOWN', gstRate: 18, price: 0.03 })
  ];
  const currentOrder = order(items);
  const ledger = pricing.computeTotals(currentOrder.items, currentOrder.coupon);
  const printed = invoice.computeInvoiceFigures(currentOrder);

  assert.deepEqual(printed.rows.map((row) => row.lineTax), [0.01, 0.01]);
  assert.equal(printed.rows.reduce((sum, row) => sum + row.lineTax, 0), 0.02);
  assert.equal(printed.tax, ledger.tax);
  assert.equal(printed.total, ledger.total);
});
