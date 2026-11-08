// Replace older local demo records once per fixture revision; preserve later test edits.
const fixtureRole = window.__CB_PROFILE__?.role || document.body.dataset.role;
const fixtureOriginalCases = typeof cases === 'undefined' ? [] : JSON.parse(JSON.stringify(cases));
function syncFixtureCases() {
  if (fixtureRole === 'community' && typeof cases !== 'undefined') cases.splice(0,cases.length,...(state.fixture ? CareBridgeData.fixtureCases() : fixtureOriginalCases));
}
function fixtureIntro() {
  return `<section class="card" style="margin:12px 0"><h3>AI 总结测试资料</h3><p class="dialogtext">已预置完整虚构资料 · 2026-11-05 20:00 快照，含照护档案、近三天记录、医嘱及跟进。后续操作会保存；重新生成将直接覆盖本机测试记录。</p><div class="dialogactions"><button class="secondary" onclick="loadSummaryFixture()">重新生成完整资料</button><button class="secondary" onclick="showFixtureRecords()">查看测试数据</button></div></section>`;
}
function confirmFixtureLoad() {
  loadSummaryFixture();
}
function loadSummaryFixture() {
  if (agentBusy) return;
  try {
    const fixture = CareBridgeData.buildFixture(fixtureRole);
    localStorage.setItem(key,JSON.stringify(fixture));
    localStorage.removeItem(key+'-before-summary-test');
    if (typeof reminderTimers !== 'undefined') Object.values(reminderTimers).forEach(clearTimeout);
    state = fixture;
    agentRetry='';agentError='';
    syncFixtureCases();closeModal();tab='home';render();
    toast('虚构测试资料已加载，可以让智能体总结');
  } catch { toast('未能保存测试资料，请检查浏览器存储空间'); }
}
function showFixtureRecords() {
  const context=CareBridgeData.buildContext(fixtureRole,state,typeof cases === 'undefined'?[]:cases);
  show('当前虚构测试数据',`<p class="dialogtext">这是本次发送给 AI 查询工具的业务快照，不包含登录手机号、图片或预期答案。</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">${esc(JSON.stringify(context,null,2))}</pre>`);
}
function fixtureCareOverview() {
  const context=CareBridgeData.buildContext(fixtureRole,state);
  const s=context.summaryStats;
  return `<section class="card"><h3>测试照护快照</h3><p class="dialogtext">2026-11-05 20:00 · 当前浏览器虚构数据</p><p>${s.confirmed} / ${s.tasks} 项本人确认 · ${s.measurementTypes} 类测量 · ${s.mealsRecorded} 餐记录 · ${s.assistance} 项求助</p><p class="dialogtext">已有体重读数不代表体重任务已确认；康复待协助不代表已经完成。</p></section>`;
}
function fixtureTaskList() {
  return `<section class="card">${state.tasks.map(t=>`<div class="taskrow"><span class="time">${esc(t.time)}</span><div class="taskcopy"><strong>${esc(t.name)}</strong><small>${esc(t.detail)}</small></div><span class="state">${t.done?'本人已确认':'待确认'}</span></div>`).join('')}</section>`;
}
function fixtureReport() {
  return fixtureCareOverview()+`<section class="card"><h3>测量与饮食</h3>${Object.entries(state.readings).map(([k,r])=>`<p>${{bp:'血压',glucose:'血糖',weight:'体重'}[k]}：${esc(r.value)} ${esc(r.unit)} · ${esc(r.scene)}</p>`).join('')}<p>三餐：${Object.keys(state.meals).map(esc).join('、')}已有本机记录</p><p>求助：康复执行需要协助，真实通知未接入</p></section>`+fixtureTaskList();
}
const fixtureOldFamilyHome = familyHome;
familyHome=function(){return fixtureRole==='family'&&state.fixture ? compactAgent()+fixtureCareOverview()+'<div class="quickquestions" id="questions"></div>' : fixtureOldFamilyHome();};
const fixtureOldTasks = tasks;
tasks=function(){return fixtureRole==='family'&&state.fixture ? fixtureCareOverview()+fixtureTaskList()+'<button class="primary wide" onclick="schedule()">根据医嘱调整日程</button>' : fixtureOldTasks();};
const fixtureOldReports = reports;
reports=function(){return fixtureRole==='family'&&state.fixture ? fixtureReport() : fixtureOldReports();};
const fixtureOldPublish = publish;
publish=function(){
  if(fixtureRole==='family'&&state.fixture){
    const time=document.getElementById('scheduleTime')?.value;
    const rehab=state.tasks.find(t=>t.kind==='rehab');
    if(time&&rehab)rehab.time=time;
  }
  fixtureOldPublish();
};
const fixtureOldCommunityHome = communityHome;
communityHome=function(){
  if(fixtureRole!=='community'||!state.fixture)return fixtureOldCommunityHome();
  const s=CareBridgeData.buildContext(fixtureRole,state,cases).summaryStats;
  return compactAgent()+`<section class="card"><h3>社区虚构测试快照</h3><p>3 位测试老人 · ${s.cases} 条事项</p><p>${s.claimed} 条已接手 · ${s.resolved} 条已核实完成 · ${s.inProgress} 条继续跟进 · ${s.unclaimed} 条待接手</p><button class="secondary" onclick="switchTab('alerts')">查看预警待办</button></section><div class="quickquestions" id="questions"></div>`;
};
const fixtureOldCaseCard = caseCard;
caseCard=function(c){
  const html=fixtureOldCaseCard(c);
  if(fixtureRole!=='community'||!state.fixture)return html;
  const row=CareBridgeData.buildContext(fixtureRole,state,[c]).cases[0];
  return html.replace('我已接手',row.status==='resolved'?'已核实完成':'我已接手')+`<p class="dialogtext">${esc(row.result||'尚无跟进记录')}</p>`;
};
const fixtureOldOverview = overview;
overview=function(){if(fixtureRole==='community'&&state.fixture)showFixtureRecords();else fixtureOldOverview();};
const fixtureOldElders = elders;
elders=function(){return fixtureRole==='community'&&state.fixture?fixtureOldElders().replace('<strong>24</strong>','<strong>3</strong>'):fixtureOldElders();};
const fixtureOldOrders = orders;
orders=function(){return fixtureRole==='family'&&state.fixture?`<section class="card"><h3>虚构演示医嘱 v2</h3><p class="dialogtext">当前版本 · 仅本机演示，未跨端投递</p><p>${esc(state.sentOrders[0].drug)} · ${esc(state.sentOrders[0].dose)} · ${esc(state.sentOrders[0].frequency)}</p><p>历史 v1 已被替代；新草稿必须经过医生核对。</p><button class="primary" onclick="schedule()">生成日程草稿</button></section>`:fixtureOldOrders();};
const fixtureOldRender=render;
render=function(){fixtureOldRender();if(tab==='home'||tab==='profile')document.getElementById('content').insertAdjacentHTML(tab==='home'?'beforeend':'afterbegin',fixtureIntro());};
if(state.fixture?.fixtureId!==CareBridgeData.fixtureId){
  state=CareBridgeData.buildFixture(fixtureRole);
  if(typeof reminderTimers!=='undefined')Object.values(reminderTimers).forEach(clearTimeout);
  try{localStorage.setItem(key,JSON.stringify(state));localStorage.removeItem(key+'-before-summary-test');}catch{}
}
syncFixtureCases();render();
