// Live demo workflow: selected family inbox -> daily tasks -> patient confirmation.
(function () {
  const profile=window.__CB_PROFILE__||{};
  const role=profile.role||document.body.dataset.role;
  if(!['doctor','family','elder'].includes(role))return;
  if(window.__CB_WORKFLOW_LOADED__)return;
  window.__CB_WORKFLOW_LOADED__=true;
  const phone=profile.phone||{doctor:'13800000001',family:'13800000003',elder:'13800000002'}[role];
  const accountId=role+':'+phone;
  const initialSubject=['13800000012','13800000013'].includes(phone)?'DEMO-P002':'DEMO-P001';
  let subjectId=state.sharedSubjectId||initialSubject;
  let latest=null,error='',inflight=null,sending=false,publishing=false,reading=false,pendingOrder=null;
  const completing=new Set(),clone=value=>JSON.parse(JSON.stringify(value));
  function panel(){
    const count=latest?.tasks.length||0,done=latest?.tasks.filter(t=>t.done).length||0;
    const title={doctor:'医嘱与执行情况',family:'家人的医嘱与每日任务',elder:'家属安排的每日任务'}[role];
    return `<section class="card" style="margin:12px 0"><h3>${title}</h3>${role==='doctor'&&latest?`<label class="label">当前患者<select onchange="chooseSharedSubject(this.value)">${latest.subjects.map(s=>`<option value="${esc(s.id)}" ${s.id===subjectId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`:`<p class="dialogtext">${esc(latest?.subject.name||'当前患者')}</p>`}<p role="status">${error?esc(error):latest?`今日已下发 ${count} 项任务，${done} 项本人已确认`:'正在更新医嘱和任务…'}</p>${role==='family'?`<div class="dialogactions"><button class="secondary" onclick="switchTab('orders')">查看收到的医嘱</button>${latest?.order?'<button class="primary" onclick="openMedicationPlan()">根据医嘱下发用药任务</button>':''}<button class="secondary" onclick="openCareTask()">添加每日生活任务</button></div>`:''}<button class="textbtn" onclick="refreshSharedTasks()">刷新医嘱与任务</button><p class="dialogtext">页面联网打开时自动更新；任务确认后会回传给家属。</p></section>`;
  }
  function orderCards(){
    const list=latest?.orders||[];
    if(!list.length)return '<section class="card"><p>暂未收到发给此账号的医嘱。</p></section>';
    return list.map(o=>`<section class="card"><div class="casehead"><h3>第 ${o.version} 版医嘱</h3><span class="state">${o.status==='current'?'当前有效':'已被新版替代'}</span></div><p>${esc(o.drug)} · ${esc(o.dose)}<br>${esc(o.frequency)} · ${esc(o.route)} · ${esc(o.duration||o.durationDays+' 天')}</p>${o.care?`<p class="dialogtext">${esc(o.care)}</p>`:''}<p class="dialogtext">${esc(o.doctorLabel||'医生')} · ${new Date(o.time).toLocaleString('zh-CN')}</p>${role==='doctor'?o.recipients.map(r=>`<p class="dialogtext">发给${esc(r.label)} · ${r.readAt?'已查看':'待查看'}</p>`).join(''):''}<details><summary>查看医嘱原文</summary><p class="dialogtext">${esc(o.source||'')}</p></details>${role==='family'&&o.status==='current'?'<button class="primary" onclick="openMedicationPlan()">根据这份医嘱下发用药任务</button>':''}</section>`).join('');
  }
  async function post(path,body){
    const config=await agentConfig;
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CareBridge-Token':config.token,'X-CareBridge-Account':accountId},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'操作没有完成，请重试');return result;
  }
  function merge(value){
    if(state.careProfile?.subjectId!==subjectId)Object.assign(state,{tasks:[],readings:{},meals:{},help:{},dailyHistory:[],timeline:[],careProfile:{subjectId,age:value.subject.age,allergies:'尚未录入'},medicationServerManaged:false});
    state.sharedSubjectId=subjectId;state.careProfile.subjectId=subjectId;
    if(role==='doctor'||role==='family')state.sentOrders=clone(value.orders);
    state.medicationServerManaged=!!(state.medicationServerManaged||value.managedMedications||value.orders.some(o=>o.version>2));
    const oldById=new Map((state.tasks||[]).map(t=>[t.id,t]));
    const remote=value.tasks.map(t=>{const previous=oldById.get(t.id);return !t.done&&previous?.due?{...t,later:previous.later,due:previous.due}:t;});
    state.tasks=[...(state.tasks||[]).filter(t=>!t.remoteId&&(!state.medicationServerManaged||t.kind!=='med')),...remote].sort((a,b)=>a.time.localeCompare(b.time));
    state.sharedTasksSnapshot={subjectId,serverDate:value.serverDate,source:'shared_demo_server',note:'医嘱收件与每日任务已从服务器更新；其他本机测试记录仍按原日期保留'};save();
  }
  function sync(){
    if(inflight)return inflight;
    const requestedSubject=subjectId;
    inflight=(async()=>{
      try{
        const response=await fetch(`/api/tasks?subjectId=${encodeURIComponent(subjectId)}&role=${role}`,{headers:{'X-CareBridge-Account':accountId},cache:'no-store',signal:AbortSignal.timeout(15000)});
        const value=await response.json();if(!response.ok)throw new Error(value.error||'更新失败');if(requestedSubject!==subjectId)return;
        const changed=JSON.stringify(latest)!==JSON.stringify(value)||!!error;
        latest=value;error='';merge(value);if(changed)render();if(role==='family'&&tab==='orders')void markRead();
      }catch(e){const message='暂时无法更新：'+(e.message||'请检查网络');if(error!==message){error=message;render();}}
      finally{inflight=null;}
    })();return inflight;
  }
  async function markRead(){
    if(reading||role!=='family'||!latest)return;
    const ids=latest.orders.filter(o=>o.recipients.some(r=>r.accountId===accountId&&!r.readAt)).map(o=>o.id);if(!ids.length)return;
    reading=true;try{await post('/api/orders/read',{subjectId,orderIds:ids});}catch{}finally{reading=false;}
  }
  window.refreshSharedTasks=sync;
  window.chooseSharedSubject=async function(value){
    if(role!=='doctor'||!latest?.subjects.some(s=>s.id===value)||value===subjectId)return;if(inflight)await inflight;
    subjectId=value;latest=null;pendingOrder=null;
    Object.assign(state,{sharedSubjectId:value,docStage:'idle',draft:{},transcript:'',extractedSource:'',sentOrders:[]});closeModal();tab='home';render();await sync();
  };
  const oldRender=render;
  render=function(){oldRender();if(['home','tasks','orders','profile'].includes(tab))document.getElementById('content').insertAdjacentHTML('afterbegin',panel());};
  const oldSwitch=switchTab;
  switchTab=function(value){oldSwitch(value);if(value==='orders'&&role==='family')void markRead();};
  const oldOrders=orders;orders=function(){return role==='family'?orderCards():oldOrders();};
  if(typeof ordersPage==='function'){const old=ordersPage;ordersPage=function(){return role==='doctor'?orderCards():old();};}
  if(typeof patientRow==='function'&&role==='doctor'){
    patientRow=function(){const p=latest?.subject;return `<div class="personbar"><span class="avatar">${esc(p?.name?.[0]||'患')}</span><div><strong>${esc(p?.name||'当前患者')}</strong><small>${p?`${p.age} 岁 · 当前就诊患者`:'正在读取关联患者'}</small></div><button class="secondary" onclick="patientPicker()">核对患者</button></div>`;};
    patientPicker=function(){if(latest)show('核对当前患者',`<p>${esc(latest.subject.name)} · ${latest.subject.age} 岁</p><p class="dialogtext">关联家属：${latest.recipients.map(r=>esc(r.label)).join('、')}</p><button class="primary" onclick="closeModal()">确认当前患者</button>`);};
    if(typeof patientsPage==='function')patientsPage=function(){return `<h2>患者与照护关系</h2>${(latest?.subjects||[]).map(p=>`<button class="card wide" onclick="chooseSharedSubject('${p.id}')">${esc(p.name)} · ${p.age} 岁</button>`).join('')}`;};
    const old=doctorHome;doctorHome=function(){return old().replace('医嘱演示已发送至林女士家长端',state.lastOrderRecipient?'医嘱已发送给'+esc(state.lastOrderRecipient):'医嘱已保存并发送');};
    function parsedNumber(text,pattern){const m=text?.match(pattern);if(!m)return '';return {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10}[m[1]]||(/^\d+$/.test(m[1])?Number(m[1]):'');}
    confirmOrder=async function(){
      if(state.transcript!==state.extractedSource)return toast('原文已修改，请重新整理并核对草稿');
      if(['drug','dose','frequency','duration','route'].some(k=>!state.draft?.[k]?.trim()))return toast('请先补齐药名、剂量、频次、疗程和给药方式');
      await sync();if(!latest||error)return toast(error||'请先读取患者和家属信息');
      pendingOrder={subjectId,expectedVersion:latest.currentVersion,requestId:crypto.randomUUID(),draft:clone(state.draft),source:state.transcript};const d=pendingOrder.draft;
      show('确认医嘱并发送',`<p><b>${esc(latest.subject.name)}</b><br>${esc(d.drug)} · ${esc(d.dose)}<br>${esc(d.frequency)} · ${esc(d.route)} · ${esc(d.duration)}</p><label class="label">发送给哪位家属<select id="orderRecipient">${latest.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.label)} · ${esc(r.relation)} · ${esc(r.id.split(':')[1])}</option>`).join('')}</select></label><p class="dialogtext">请再次核对每日规律用药的次数和天数，供家属编排任务；不会由系统补全医疗要求。</p><label class="label">每日次数<input id="orderDailyCount" type="number" min="1" max="4" value="${parsedNumber(d.frequency,/(?:每日|每天|一日)\s*([0-9一二两三四]+)\s*次/)}"></label><label class="label">疗程天数<input id="orderDurationDays" type="number" min="1" max="30" value="${parsedNumber(d.duration,/([0-9一二两三四五六七八九十]+)\s*天/)}"></label><p id="orderSendError" role="alert"></p><div class="dialogactions"><button class="secondary" onclick="closeModal()">返回核对</button><button class="primary" id="orderSendButton" onclick="sendOrder()">确认并发送给所选家属</button></div>`);
    };
    sendOrder=async function(){
      if(sending||!pendingOrder)return;
      if(pendingOrder.subjectId!==subjectId||pendingOrder.source!==state.transcript||JSON.stringify(pendingOrder.draft)!==JSON.stringify(state.draft))return toast('草稿已变化，请重新核对');
      sending=true;document.getElementById('orderSendButton').disabled=true;
      try{
        const result=await post('/api/orders/send',{role,subjectId,recipientId:document.getElementById('orderRecipient').value,expectedVersion:pendingOrder.expectedVersion,requestId:pendingOrder.requestId,order:{...pendingOrder.draft,source:pendingOrder.source,dailyCount:Number(document.getElementById('orderDailyCount').value),durationDays:Number(document.getElementById('orderDurationDays').value)}});
        state.docStage='sent';state.lastOrderRecipient=result.recipientLabel;pendingOrder=null;save();closeModal();await sync();switchTab('orders');toast('医嘱已发送给'+result.recipientLabel);
      }catch(e){const node=document.getElementById('orderSendError');if(node)node.textContent=e.message;}
      finally{sending=false;const button=document.getElementById('orderSendButton');if(button)button.disabled=false;}
    };
  }
  window.openMedicationPlan=async function(){
    if(role!=='family')return;await sync();if(!latest||error)return toast(error||'请先恢复连接');
    const o=latest.order;if(!o)return toast('请先等待医生向此账号发送有效医嘱');
    const defaults={1:['08:00'],2:['08:00','12:30'],3:['08:00','12:30','18:30'],4:['08:00','12:30','18:30','21:00']};
    const times=latest.plans.find(p=>p.orderId===o.id)?.times||defaults[o.dailyCount];
    show('根据医嘱下发每日任务',`<p>${esc(latest.subject.name)} · 第 ${o.version} 版医嘱</p><p>${esc(o.drug)} · ${esc(o.dose)}<br>${esc(o.frequency)} · ${esc(o.route)} · ${o.durationDays} 天</p><p class="dialogtext">只设置提醒时间，药品、剂量和频次保持医生确认的要求。</p>${times.map((t,i)=>`<label class="label">第 ${i+1} 次提醒<input id="medTime${i}" type="time" value="${esc(t)}"></label>`).join('')}<p id="medPublishError" role="alert"></p><div class="dialogactions"><button class="secondary" onclick="closeModal()">取消</button><button id="medPublishButton" class="primary" onclick="submitMedicationPlan()">确认下发到患者端</button></div>`);
  };
  window.submitMedicationPlan=async function(){
    if(role!=='family'||publishing||!latest?.order)return;publishing=true;document.getElementById('medPublishButton').disabled=true;
    try{const o=latest.order;const times=Array.from({length:o.dailyCount},(_,i)=>document.getElementById('medTime'+i).value);const result=await post('/api/tasks/publish',{role,subjectId,orderId:o.id,orderVersion:o.version,times});closeModal();await sync();toast(result.created?'每日任务已下发，患者端会自动更新':'任务已下发，没有重复创建');}
    catch(e){const node=document.getElementById('medPublishError');if(node)node.textContent=e.message;}
    finally{publishing=false;const button=document.getElementById('medPublishButton');if(button)button.disabled=false;}
  };
  window.openCareTask=function(){
    if(role!=='family'||!latest||error)return toast('请先恢复连接');
    show('添加每日生活任务',`<p class="dialogtext">可安排饮食记录、测量或日常生活事项。用药任务请从医生医嘱生成。</p><label class="label">任务名称<input id="careTitle" maxlength="80" placeholder="例如：记录晚餐情况"></label><label class="label">说明<textarea id="careDetail" rows="2" maxlength="500"></textarea></label><label class="label">每日时间<input id="careTime" type="time" value="18:30"></label><label class="label">持续天数<input id="careDays" type="number" min="1" max="30" value="7"></label><p id="careTaskError" role="alert"></p><div class="dialogactions"><button class="secondary" onclick="closeModal()">取消</button><button id="careTaskButton" class="primary" onclick="submitCareTask()">下发到患者端</button></div>`);
  };
  window.submitCareTask=async function(){
    if(publishing||role!=='family')return;publishing=true;document.getElementById('careTaskButton').disabled=true;
    try{await post('/api/tasks/publish',{role,subjectId,kind:'care',title:document.getElementById('careTitle').value,detail:document.getElementById('careDetail').value,days:Number(document.getElementById('careDays').value),times:[document.getElementById('careTime').value]});closeModal();await sync();toast('每日生活任务已下发');}
    catch(e){const node=document.getElementById('careTaskError');if(node)node.textContent=e.message;}
    finally{publishing=false;const node=document.getElementById('careTaskButton');if(node)node.disabled=false;}
  };
  if(typeof completeElder==='function'){
    const old=completeElder;
    completeElder=async function(id){
      const task=state.tasks?.find(t=>t.id===id);if(!task?.remoteId)return old(id);if(completing.has(id))return;completing.add(id);
      try{await post('/api/tasks/complete',{role,subjectId,taskId:task.remoteId});if(typeof reminderTimers!=='undefined')clearTimeout(reminderTimers[id]);closeModal();await sync();toast('完成状态已保存，家属端会更新');}
      catch(e){toast(e.message||'确认失败，请重试');}finally{completing.delete(id);}
    };
  }
  const oldLoad=loadSummaryFixture;loadSummaryFixture=function(){oldLoad();state.sharedSubjectId=subjectId;latest=null;void sync();};
  const oldAsk=ask;ask=async function(q){await sync();return oldAsk(q);};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
  const poll=setInterval(()=>{if(!document.hidden)void sync();},3000);window.addEventListener('pagehide',()=>clearInterval(poll));
  render();void sync();
})();
