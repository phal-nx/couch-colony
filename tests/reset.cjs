const test = require('node:test');
const assert = require('node:assert/strict');
const Reset = require('../app/reset');
function storage(values) {
  return {get length() { return Object.keys(values).length; }, key: i => Object.keys(values)[i], getItem: k => values[k] ?? null, setItem: (k,v) => { values[k]=v; }, removeItem: k => { delete values[k]; }};
}
test('only the explicit release reset token removes colony saves, backups and UI history', () => {
  const values = {phil_roach_colony_v2:'old',phil_roach_colony_v2_backup:'backup',phil_roach_colony_v1:'legacy',phil_roach_colony_v2_corrupt_1:'damaged',phil_roach_colony_ui_milestones_v1:'seen',other:'keep'};
  const s=storage(values), before={...values};
  for (const token of [undefined,true,'','wrong']) { assert.equal(Reset.apply(s,token),false); assert.deepEqual(values,before); }
  assert.equal(Reset.apply(s,Reset.token),true);
  assert.deepEqual(values,{other:'keep',phil_roach_colony_reset_token:Reset.token});
  values.phil_roach_colony_v2='new colony';
  assert.equal(Reset.apply(s,Reset.token),false);
  assert.equal(values.phil_roach_colony_v2,'new colony');
});
test('a failed reset does not record completion or silently continue', () => {
  const values={phil_roach_colony_v2:'old'},s=storage(values);
  s.removeItem=()=>{throw new Error('storage unavailable');};
  assert.throws(()=>Reset.apply(s,Reset.token),/fresh start could not be completed/);
  assert.equal(values.phil_roach_colony_v2,'old');
  assert.equal(s.getItem('phil_roach_colony_reset_token'),null);
});
