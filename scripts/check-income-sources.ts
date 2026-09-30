// Sanity check for the "Show income sources" Sankey option.
// Run: npx tsx scripts/check-income-sources.ts
import assert from 'node:assert/strict';
import { buildSankeyData } from '../src/transforms/sankey';
import type { Transaction } from '../src/types/transaction';

let seq = 0;
const tx = (
  amount: number,
  subcategory: string | null,
  category: string | null,
  type: string | null,
): Transaction => ({
  id: String(++seq),
  amount,
  subcategory,
  category,
  type,
} as unknown as Transaction);

const txs: Transaction[] = [
  tx(50000, 'salary', 'Salary', 'INCOME'),
  tx(3000, 'transfer_in', 'OtherIncome', 'INCOME'),
  tx(2000, 'transfer_in', 'OtherIncome', 'INCOME'),
  tx(500, 'refund', 'OtherIncome', 'INCOME'),
  tx(300, null, 'OtherIncome', 'INCOME'),
  tx(200, null, null, null),
  // positive tx with an expense subcategory — must not collide with the groceries node
  tx(150, 'groceries', 'Food', 'MUST'),
  tx(-15000, 'rent', 'Living', 'MUST'),
  tx(-4000, 'groceries', 'Food', 'MUST'),
  tx(-2500, 'restaurant', 'Food', 'WANT'),
];

const totalIncome = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

// Flag off: Income is leftmost
{
  const data = buildSankeyData(txs, { showCat3: true });
  assert.equal(data.links.filter(l => l.target === 'Income').length, 0, 'no links into Income when off');
  assert.equal(data.incomeSources, undefined);
  assert.ok(data.links.some(l => l.source === 'Income' && l.target === 'MUST'));
}

// Flag on
for (const showCat3 of [false, true]) {
  const off = buildSankeyData(txs, { showCat3 });
  const on = buildSankeyData(txs, { showCat3, showIncomeSources: true });
  const incoming = on.links.filter(l => l.target === 'Income');
  const byName = Object.fromEntries(incoming.map(l => [l.source, l.value]));

  assert.equal(byName.salary, 50000);
  assert.equal(byName.transfer_in, 5000);
  assert.equal(byName.refund, 500);
  assert.equal(byName.OtherIncome, 300, 'falls back to category');
  assert.equal(byName.uncategorized, 200, 'falls back to uncategorized');
  const groceriesName = showCat3 ? 'groceries (income)' : 'groceries';
  assert.equal(byName[groceriesName], 150, `disambiguates only on real collision (${groceriesName})`);

  const sum = incoming.reduce((s, l) => s + l.value, 0);
  assert.equal(sum, totalIncome, 'source → Income links sum to total income');

  assert.deepEqual(on.incomeSources?.salary, { subcategory: 'salary' });
  assert.deepEqual(on.incomeSources?.OtherIncome, { category: 'OtherIncome' });
  assert.deepEqual(on.incomeSources?.uncategorized, {});

  // Everything downstream of Income is unchanged
  const nonIncoming = on.links.filter(l => l.target !== 'Income');
  assert.deepEqual(nonIncoming, off.links);

  // No cycles: every source-node name is unique across the graph
  const names = on.nodes.map(n => n.name);
  assert.equal(new Set(names).size, names.length);
}

console.log('check-income-sources: all assertions passed');
