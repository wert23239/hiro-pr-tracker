const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildStacks } = require('../stacks');
const pr = (number, head, base, extra = {}) => ({number, head, base, ...extra});
test('orders branching stacks base first', () => {
 const groups = buildStacks([pr(3,'c','b'),pr(4,'d','a'),pr(2,'b','a'),pr(1,'a','dev'),pr(5,'e','dev')]);
 assert.deepEqual(groups[0].members.map(x=>[x.pr.number,x.depth]), [[1,0],[4,1],[2,1],[3,2]]);
 assert.equal(groups.length,2);
});
test('shared targets and cross-fork branch names are not stacks',()=>{
 assert.equal(buildStacks([pr(1,'a','dev'),pr(2,'b','dev')]).length,2);
 assert.equal(buildStacks([pr(1,'a','dev',{headRepo:'fork/repo'}),pr(2,'b','a',{baseRepo:'upstream/repo'})]).length,2);
});
test('cycles and ambiguous branches preserve all cards exactly once',()=>{
 for(const prs of [[pr(1,'a','b'),pr(2,'b','a')],[pr(1,'a','dev'),pr(2,'a','dev'),pr(3,'c','a')]]) {
 assert.deepEqual(buildStacks(prs).flatMap(g=>g.members.map(m=>m.pr.number)).sort(),prs.map(p=>p.number).sort());
 }
});

test('synthetic data and binary fetch are explicitly not stacked', () => {
 const groups = buildStacks([pr(4038,'feature/eng-2348-binary-fetch','feature/sythentic-data'),pr(4028,'feature/sythentic-data','dev')]);
 assert.equal(groups.length,1);
 assert.equal(groups[0].notStacked,true);
 assert.deepEqual(groups[0].members.map(m=>m.pr.number),[4028,4038]);
 assert.equal(buildStacks([pr(2,'b','a'),pr(1,'a','dev')])[0].notStacked,false);
});
