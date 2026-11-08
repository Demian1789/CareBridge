const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {buildFixture,fixtureCases,buildContext} = require('../care-data.js');

test('four role fixtures expose complete, distinct summarization inputs', () => {
  for(const role of ['doctor','family','elder']) {
    const context=buildContext(role,buildFixture(role));
    assert.deepEqual(context.summaryStats,{tasks:8,confirmed:6,unconfirmed:2,measurementTypes:3,mealsRecorded:3,assistance:1});
    assert.equal(context.tasks.find(t=>t.id===7).done,false);
    assert.equal(context.readings.weight.value,'62.5');
    assert.ok(context.tasks[0].name); // Care labels must not be dropped as personal names.
    assert.equal(context.snapshot.source,'fictional_test_data');
  }
  const doctor=buildContext('doctor',buildFixture('doctor'));
  assert.equal(doctor.history.length,2);
  assert.equal(doctor.profile.allergies,'测试资料未提供，不能推断无过敏');
  const source=require('../demo-order.json');
  for(const field of ['version','status','drug','dose','frequency','route'])assert.equal(doctor.orders[0][field],source[field]);
  assert.equal(doctor.orders.length,2);
  assert.equal(doctor.orders[0].status,'current');
  assert.deepEqual(doctor.draft.missingFields,['dose','route']);
  assert.equal(doctor.feedback[0].status,'pending');
  const community=buildContext('community',buildFixture('community'),fixtureCases());
  assert.deepEqual(community.summaryStats,{cases:3,claimed:2,resolved:1,inProgress:1,unclaimed:1});
  assert.equal(community.tasks,undefined);
  assert.equal(buildContext('elder',buildFixture('elder')).orders,undefined);
});

test('summaries use live mutations rather than a prewritten answer', () => {
  const state=buildFixture('elder');
  state.tasks.find(t=>t.id===7).done=true;
  delete state.readings.glucose;
  const context=buildContext('elder',state);
  assert.equal(context.summaryStats.confirmed,7);
  assert.equal(context.summaryStats.measurementTypes,2);
  const cases=fixtureCases(), community=buildFixture('community');
  community.claimed.push(3);community.result3='已联系，实际已执行';
  assert.equal(buildContext('community',community,cases).summaryStats.resolved,2);
});

test('context excludes profiles, phones, photo blobs and unrelated business fields', () => {
  const state=buildFixture('family');
  state.profile={phone:'PRIVATE_PHONE'};
  state.readings.bp.phone='PRIVATE_PHONE';
  state.meals.早餐.photo='data:image/png;base64,SECRET_IMAGE';
  state.expectedAnswer='ANSWER_MUST_NOT_BE_SENT';
  state.sentOrders[0].recipients=[{accountId:'PRIVATE_PHONE',label:'测试家属',readAt:null}];
  const serialized=JSON.stringify(buildContext('family',state));
  assert.doesNotMatch(serialized,/PRIVATE_PHONE|SECRET_IMAGE|ANSWER_MUST_NOT_BE_SENT/);
  assert.equal(JSON.parse(serialized).meals.早餐.hasPhoto,true);
  assert.ok(JSON.parse(serialized).orders[0].drug);
});

function uiHarness() {
  const storage=new Map();
  const originalState={messages:[{role:'user',text:'original conversation'}],tasks:[{id:99,done:false}]};
  const context={
    window:{__CB_PROFILE__:{role:'elder'}},document:{body:{dataset:{role:'elder'}},getElementById:()=>({insertAdjacentHTML(){}})},
    key:'test-account',state:structuredClone(originalState),tab:'home',agentBusy:false,agentRetry:'',agentError:'',cases:fixtureCases(),
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    CareBridgeData:require('../care-data.js'),show(){},closeModal(){},toast(){},render(){},esc:String,clearTimeout,
  };
  for(const name of ['familyHome','tasks','reports','publish','communityHome','caseCard','overview','elders','orders'])context[name]=()=>'';
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('demo-data.js','utf8'),context);
  return {context,storage,originalState};
}

test('new fixture revision replaces existing records without a backup and resets explicitly', () => {
  const h=uiHarness();
  assert.equal(h.context.state.fixture.fixtureId,'carebridge-summary-v2');
  assert.equal(h.context.state.tasks.length,8);
  assert.equal(h.context.state.messages.length,0);
  h.context.state.tasks.find(t=>t.id===7).done=true;
  h.context.render();
  assert.equal(h.context.state.tasks.filter(t=>t.done).length,7);
  h.context.loadSummaryFixture();
  assert.equal(h.context.state.tasks.filter(t=>t.done).length,6);
  assert.equal(h.storage.has('test-account-before-summary-test'),false);
});
