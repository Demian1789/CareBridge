const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assistantText}=require('../chat-text.js');

test('old tool trace and snapshot preamble are hidden without losing the medical text',()=>{
  const old='工具执行：查询照护数据：orders；查询照护数据：draft\n\n以下整理基于当前浏览器演示快照（快照时间 2026-11-05 20:00，虚构测试数据，未验证）。\n\n**当前有效医嘱**\n每次 1 片，每日 2 次。';
  assert.equal(assistantText(old),'当前有效医嘱\n每次 1 片，每日 2 次。');
});
test('plain facts, negation, units, temperatures and literal arithmetic remain intact',()=>{
  const text='尚未确认，不等于未执行。体温 36.5°C，变化 -0.2°C。2 * 3 = 6。';
  assert.equal(assistantText(text),text);
});
test('ordinary date and uncertainty information is not removed',()=>{
  const text='截至昨天还有一项待确认。过敏史尚未记录。';
  assert.equal(assistantText(text),text);
  assert.equal(assistantText('## 待核对\n__给药方式__未填写'),'待核对\n给药方式未填写');
  assert.equal(assistantText('当前医嘱（快照时间 2026-11-05 20:00）\n每次 1 片'),'当前医嘱\n每次 1 片');
});
