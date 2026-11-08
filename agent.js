// Shared by standalone ports and the unified srcdoc iframe.
let agentBusy = false;
let agentRetry = '';
let agentError = '';
const agentConfig = fetch('/api/config').then(r => r.json());
// Clean existing assistant bubbles as well; leave the user's own text untouched.
let agentHistoryChanged=false;
state.messages.forEach(message=>{
  if(message.role==='assistant'){
    const text=CareBridgeChatText.assistantText(message.text);
    if(text!==message.text){message.text=text;agentHistoryChanged=true;}
  }
});
if(agentHistoryChanged)save();
const agentOriginalConversation = conversationView;
conversationView = function () {
  return agentOriginalConversation() + `<p role="status" style="padding:12px;color:#4964da">${agentBusy ? '正在整理，请稍候…' : '医疗智能体'}</p>${agentError ? '<p role="alert">' + esc(agentError) + '</p>' : ''}${agentRetry ? '<button class="secondary" onclick="ask(agentRetry)">重试上一次问题</button>' : ''}`;
};
ask = async function (q) {
  q = String(q || '').trim();
  if (!q || agentBusy) return;
  if (q.length > 8000) return toast('问题过长，请控制在 8000 字以内');
  const retry = q === agentRetry;
  agentRetry = '';
  agentError = '';
  agentBusy = true;
  if (!retry) state.messages.push({role:'user', text:q, time:new Date().toISOString(), agent:true});
  const input = document.querySelector('#message');
  if (input) input.value = '';
  tab = 'home'; render(); scrollChat();
  try {
    const config = await agentConfig;
    const role = window.__CB_PROFILE__?.role || document.body.dataset.role;
    // Explicit business fields preserve task/drug names while excluding login profiles and image blobs.
    const context = CareBridgeData.buildContext(role,state,typeof cases === 'undefined' ? [] : cases);
    const messages = state.messages.filter(m => m.agent && !m.error).slice(-30).map(m => ({role:m.role, content:m.text}));
    const response = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json','X-CareBridge-Token':config.token}, body:JSON.stringify({role,messages,context}), signal:AbortSignal.timeout(180000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '模型请求失败');
    state.messages.push({role:'assistant', text:CareBridgeChatText.assistantText(result.reply), tools:result.tools, time:new Date().toISOString(), agent:true});
  } catch (error) {
    agentRetry = q;
    agentError = error.name === 'TimeoutError' ? '请求超时，请重试' : error.message || '网络异常，请重试';
    toast(error.name === 'TimeoutError' ? '请求超时，请重试' : error.message || '网络异常，请重试');
  } finally {
    agentBusy = false; save(); render(); scrollChat();
  }
};
render();
