// Reproducible fictional records and role-specific context, shared by UI and tests.
(function (root) {
  const fixtureId='carebridge-summary-v2';
  const snapshot = {fixtureId, date:'2026-11-05', asOf:'2026-11-05T20:00:00+08:00', source:'fictional_test_data', note:'固定虚构测试快照；下发任务的状态另由服务器同步'};
  const at = time => `2026-11-05T${time}:00+08:00`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const roles = {doctor:'医生', family:'家属', elder:'老人', community:'社区照护者'};
  function buildFixture(role) {
    if (!roles[role]) throw new Error('不支持的测试角色');
    const tasks = [
      {id:1,time:'08:00',name:'早餐后服药',kind:'med',done:true,detail:'虚构药品 A，按演示医嘱 v2',confirmedAt:at('08:05')},
      {id:2,time:'09:00',name:'测量血压',kind:'bp',done:true,detail:'按设备读数记录',confirmedAt:at('09:05')},
      {id:3,time:'07:15',name:'测量血糖',kind:'glucose',done:true,detail:'早餐前空腹记录测量场景',confirmedAt:at('07:20')},
      {id:4,time:'12:00',name:'午餐情况记录',kind:'meal',done:true,detail:'本人反馈已吃午餐',confirmedAt:at('12:10')},
      {id:5,time:'12:30',name:'午餐后服药',kind:'med',done:true,detail:'虚构药品 A，按演示医嘱 v2',confirmedAt:at('12:35')},
      {id:6,time:'14:00',name:'康复锻炼',kind:'rehab',done:false,detail:'本人表示需要协助，尚未确认完成'},
      {id:7,time:'18:00',name:'测量体重',kind:'weight',done:false,detail:'已有体重读数，但任务尚未本人确认'},
      {id:8,time:'18:30',name:'晚餐情况记录',kind:'meal',done:true,detail:'本人反馈已吃晚餐',confirmedAt:at('18:40')},
    ];
    const raw = '演示原文：虚构药品 A，每次一片，每日两次，早、午餐后口服，疗程七天。康复按原计划执行，执行困难时联系照护者核实。';
    const currentOrder = {version:2,status:'current',drug:'虚构药品 A',dose:'每次 1 片',frequency:'每日 2 次，早、午餐后',duration:'7 天',route:'口服',care:'康复按原计划执行，困难时联系照护者核实',time:at('07:30'),source:raw,deliveryStatus:'local_demo_only'};
    const previousOrder = {...currentOrder,version:1,status:'superseded',frequency:'每日 1 次，早餐后',time:'2026-11-04T16:00:00+08:00',source:'历史演示原文：虚构药品 A，每次一片，每日一次，早餐后口服，疗程七天。'};
    const transcript = '测试草稿：虚构药品 C，每日一次，疗程三天。原文未提供每次剂量和给药方式。';
    const state = {
      fixture: {...snapshot,role}, messages:[], claimed:[], published:true, follow:true, read:false,
      careProfile:{subjectId:'DEMO-P001',age:72,communication:'偏好上海话，可用简短中文解释',livingArrangement:'与家属共同生活（虚构）',careNeeds:['日常任务提醒','康复活动需要协助'],allergies:'测试资料未提供，不能推断无过敏',consentStatus:'demo_only_not_verified'},
      dailyHistory:[
        {date:'2026-11-03',tasksTotal:8,confirmedTasks:6,readings:{bp:{value:'130 / 82',unit:'mmHg'},glucose:{value:'6.8',unit:'mmol/L',scene:'空腹'},weight:{value:'63.0',unit:'kg'}},mealsRecorded:2,note:'晚餐缺记录，不能认定未进餐'},
        {date:'2026-11-04',tasksTotal:8,confirmedTasks:7,readings:{bp:{value:'132 / 80',unit:'mmHg'},glucose:{value:'6.5',unit:'mmol/L',scene:'空腹'},weight:{value:'62.8',unit:'kg'}},mealsRecorded:3,note:'一项康复任务未本人确认'},
      ],
      timeline:[{time:at('07:30'),event:'医生确认虚构医嘱 v2，历史 v1 被替代',delivery:'local_demo_only'},{time:at('14:05'),event:'康复执行困难，创建本机协助记录',delivery:'not_connected'},{time:at('19:00'),event:'保存体重读数，任务尚未本人确认',delivery:'local_demo_only'}],
      tasks:tasks.sort((a,b)=>a.time.localeCompare(b.time)), readings:{
        bp:{value:'128 / 78',unit:'mmHg',scene:'静坐后',time:at('09:05'),source:'虚构手动记录'},
        glucose:{value:'6.2',unit:'mmol/L',scene:'空腹',time:at('07:20'),source:'虚构手动记录'},
        weight:{value:'62.5',unit:'kg',scene:'晚间',time:at('19:00'),source:'虚构手动记录'},
      },
      meals:{早餐:{feedback:'本人反馈已吃',time:at('08:00')},午餐:{feedback:'本人反馈已吃',time:at('12:10')},晚餐:{feedback:'本人反馈已吃',time:at('18:40')}},
      help:{6:{status:'pending',time:at('14:05'),reason:'康复执行需要协助',notificationStatus:'not_connected'}}, drugPhotos:{},
      sentOrders:[currentOrder,previousOrder], docStage:'draft', transcript, extractedSource:transcript,
      draft:{drug:'虚构药品 C',dose:'',frequency:'每日 1 次',duration:'3 天',route:'',care:'未提供其他要求'},
      feedbackQuestion:'家属询问：康复训练执行有困难，是否需要进一步明确安排？', replied:false,reply:'',time:'14:00',
    };
    if (role === 'community') {
      state.claimed = [1,2];
      state.result1 = '已联系，需要康复协助，继续跟进';
      state.result2 = '已联系，实际已执行';
    }
    return state;
  }
  function fixtureCases() {
    return [
      {id:1,name:'林秀英',age:72,place:'梧桐苑 · 测试档案',time:'14:05',task:'康复需要协助',desc:'虚构测试：老人主动求助，尚未确认完成，需继续跟进。',label:'主动求助',kind:'blue'},
      {id:2,name:'陈建国',age:76,place:'梧桐苑 · 测试档案',time:'09:30',task:'血糖检测待核实',desc:'虚构测试：曾缺少本人确认，工作人员已联系核实实际执行。',label:'执行待核实',kind:'warn'},
      {id:3,name:'周桂兰',age:69,place:'银杏里 · 测试档案',time:'08:40',task:'早餐记录待补充',desc:'虚构测试：尚未联系、未接手，没有照片不代表没有进餐。',label:'餐食待核实',kind:'warn'},
    ];
  }
  function pick(value, fields) {
    if (!value || typeof value !== 'object') return null;
    return Object.fromEntries(fields.filter(k => value[k] !== undefined).map(k => [k,value[k]]));
  }
  function caseContext(state, cases) {
    return cases.map(c => {
      const claimed = (state.claimed || []).includes(c.id);
      const result = state['result'+c.id] || null;
      return {id:c.id,subjectId:'DEMO-P00'+c.id,task:c.task,time:c.time,description:c.desc,claimed,result,
        status: !claimed ? 'unclaimed' : result === '已联系，实际已执行' ? 'resolved' : 'in_progress'};
    });
  }
  function buildContext(role, state, cases = []) {
    const context = {snapshot: state.fixture ? clone(state.fixture) : {source:'browser_demo_unverified',note:'浏览器原型数据，不代表跨端同步'}};
    context.profile=pick(state.careProfile,['subjectId','age','communication','livingArrangement','careNeeds','allergies','consentStatus']);
    context.history=Array.isArray(state.dailyHistory)?state.dailyHistory.map(h=>({subjectId:'DEMO-P001',...pick(h,['date','tasksTotal','confirmedTasks','readings','mealsRecorded','note'])})):null;
    context.timeline=Array.isArray(state.timeline)?state.timeline.map(e=>pick(e,['time','event','delivery'])):null;
    if (role === 'community') {
      context.cases = caseContext(state,cases);
      context.roster=cases.map(c=>({subjectId:'DEMO-P00'+c.id,age:c.age,label:c.name+'（虚构）',area:c.place}));
      context.summaryStats = {cases:context.cases.length,claimed:context.cases.filter(c=>c.claimed).length,resolved:context.cases.filter(c=>c.status==='resolved').length,inProgress:context.cases.filter(c=>c.status==='in_progress').length,unclaimed:context.cases.filter(c=>c.status==='unclaimed').length};
      return context;
    }
    context.sharedTasks=pick(state.sharedTasksSnapshot,['subjectId','serverDate','source','note']);
    context.tasks = Array.isArray(state.tasks) ? state.tasks.map(t=>pick(t,['id','time','date','name','detail','kind','done','confirmedAt','source','sourceOrderVersion'])) : null;
    context.readings = state.readings ? Object.fromEntries(['bp','glucose','weight'].filter(k=>state.readings[k]).map(k=>[k,pick(state.readings[k],['value','unit','scene','time','source'])])) : null;
    context.meals = state.meals ? Object.fromEntries(['早餐','午餐','晚餐'].filter(k=>state.meals[k]).map(k=>[k,{...pick(state.meals[k],['feedback','time']),hasPhoto:!!state.meals[k].photo}])) : null;
    context.assistance = state.help ? Object.entries(state.help).map(([taskId,h])=>({taskId,...pick(h,['status','time','reason','notificationStatus'])})) : null;
    context.summaryStats = {tasks:context.tasks?.length ?? null,confirmed:context.tasks?.filter(t=>t.done).length ?? null,unconfirmed:context.tasks?.filter(t=>!t.done).length ?? null,measurementTypes:context.readings ? Object.keys(context.readings).length : null,mealsRecorded:context.meals ? Object.keys(context.meals).length : null,assistance:context.assistance?.length ?? null};
    if (role === 'doctor' || role === 'family') {
      context.orders = Array.isArray(state.sentOrders) ? state.sentOrders.map((o,i)=>({...pick(o,['drug','dose','frequency','duration','route','care','source','time','status','id','dailyCount','durationDays']),recipients:Array.isArray(o.recipients)?o.recipients.map(r=>pick(r,['label','deliveredAt','readAt'])):[],version:o.version ?? state.sentOrders.length-i,deliveryStatus:o.deliveryStatus||'local_demo_only'})) : null;
    }
    if (role === 'doctor') {
      context.draft = state.docStage === 'draft' ? {...pick(state.draft,['drug','dose','frequency','duration','route','care']),source:state.transcript,missingFields:['drug','dose','frequency','duration','route'].filter(k=>!state.draft?.[k]?.trim())} : null;
      context.feedback = state.feedbackQuestion ? [{question:state.feedbackQuestion,status:state.replied?'demo_replied':'pending',reply:state.replied ? state.reply : null,deliveryStatus:'local_demo_only'}] : null;
    }
    return context;
  }
  root.CareBridgeData = {buildFixture,fixtureCases,buildContext,roles,fixtureId};
  if (typeof module !== 'undefined') module.exports = root.CareBridgeData;
})(typeof window !== 'undefined' ? window : globalThis);
