(() => {
  'use strict';
  if (window.__returnManualWorkflow) return;
  window.__returnManualWorkflow = true;
  const options = [['','자동 표시 사용'],['scheduled','방문 예정'],['moving','이동 중'],['arrived','현장 도착'],['hold','보류'],['revisit','재방문 필요'],['contact','연락 필요']];
  const labels = new Map(options);
  const box = document.getElementById('pkList');
  if (!box) return;
  const style = document.createElement('style');
  style.textContent = `
  #pkList .return-manual-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #2d3b50;margin-top:0}
  #pkList .return-manual-row>span{font-size:11px;color:#a3b2c8}
  #pkList .return-manual-row button{min-height:44px;padding:8px 12px;background:#293b60;color:#d7e3ff;border:1px solid #526a97;border-radius:9px;font-size:12px;font-weight:700}
  #pkList .return-manual-row button:disabled{background:#22372e;color:#a4c6b2;border-color:#3e5b4c;cursor:default}
  #returnWorkflowDialog{width:min(430px,calc(100% - 28px));padding:24px;background:#152238;color:#edf2ff;border:1px solid #445874;border-radius:20px;box-shadow:0 20px 70px #0009}
  #returnWorkflowDialog::backdrop{background:#020617b8;backdrop-filter:blur(3px)}
  #returnWorkflowDialog h2{font-size:20px;font-weight:800;margin-bottom:8px}
  #returnWorkflowDialog p{font-size:12px;line-height:1.7;color:#b5c2d7;overflow-wrap:anywhere}
  #returnWorkflowDialog label{display:block;font-size:12px;margin:16px 0 6px}
  #returnWorkflowDialog select,#returnWorkflowDialog textarea{width:100%;padding:11px;border:1px solid #4a5f80;border-radius:10px;background:#0f1b2d;color:#fff;font-size:16px}
  #returnWorkflowDialog textarea{min-height:76px;resize:vertical}
  #returnWorkflowDialog .rw-actions{display:flex;gap:8px;margin-top:20px}
  #returnWorkflowDialog button{flex:1;min-height:44px;border-radius:10px;font-weight:700;background:#2d3f58;color:#e1e8f5}
  #returnWorkflowDialog button[type=submit]{background:#5b7be6;color:white}
  #returnWorkflowDialog #rwError{color:#f7b2c1;min-height:1.5em;margin-top:8px}
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.id = 'returnWorkflowDialog'; dialog.setAttribute('aria-labelledby','rwTitle');
  dialog.innerHTML = '<form id="rwForm"><h2 id="rwTitle">업무 상태 변경</h2><p id="rwSchool"></p><p>선택한 상태는 업무 진행 메모입니다. 수량·완료 여부·웍스 완료 상태는 바꾸지 않습니다.</p><label for="rwSelect">진행 상태</label><select id="rwSelect" autofocus></select><label for="rwNote">사유·메모 (선택)</label><textarea id="rwNote" maxlength="300" placeholder="예: 원 부재로 다음 방문 때 회수"></textarea><p id="rwError" role="alert"></p><div class="rw-actions"><button id="rwCancel" type="button">취소</button><button type="submit">상태 저장</button></div></form>';
  document.body.append(dialog);
  const select = dialog.querySelector('#rwSelect');
  for (const [value,label] of options) { const option = document.createElement('option'); option.value=value; option.textContent=label; select.append(option); }
  let activeId = null, focusBack = null;
  const signatures = new WeakMap();
  function taskById(id) { return typeof PICKUPS === 'undefined' ? null : PICKUPS.find(p => String(p.id) === String(id)); }
  function isReturn(p) { try { return pkGroupOf(p) !== 'extra'; } catch (_) { return true; } }
  function update() {
    box.querySelectorAll('[data-pk-card]').forEach(card => {
      const p = taskById(card.getAttribute('data-pk-card')); if (!p || !isReturn(p)) return;
      const workflow = p.manualWorkflow || {};
      const valid = labels.has(workflow.status) && workflow.status;
      const signature = JSON.stringify([p.done,valid || '',workflow.note || '']);
      if (signatures.get(card) === signature && card.querySelector('.return-manual-row')) return;
      signatures.set(card,signature);
      let row = card.querySelector('.return-manual-row');
      if (!row) { row=document.createElement('div');row.className='return-manual-row';row.innerHTML='<span>진행 상태</span><button type="button" data-return-workflow></button>';const header=card.querySelector('.pk-ui-statusrow');if(header)header.after(row);else card.prepend(row); }
      const button=row.querySelector('button'); button.dataset.returnWorkflow=String(p.id);
      button.textContent=p.done ? '처리 완료' : (valid ? labels.get(workflow.status) : '상태 선택') + ' · 변경';
      button.disabled=!!p.done;
      button.title=p.done ? '완료를 취소한 뒤 진행 상태를 변경할 수 있습니다.' : workflow.note || '진행 상태 선택';
      row.firstElementChild.textContent=valid && !p.done ? '진행 상태 · 직접 지정' : '진행 상태';
    });
  }
  box.addEventListener('click',e => {
    const button=e.target.closest('[data-return-workflow]');if(!button || button.disabled)return;
    const p=taskById(button.dataset.returnWorkflow);if(!p || p.done)return;
    activeId=String(p.id);focusBack=button;
    dialog.querySelector('#rwSchool').textContent=p.school || '회수·반품 업무';
    select.value=labels.has(p.manualWorkflow?.status)?p.manualWorkflow.status:'';
    dialog.querySelector('#rwNote').value=p.manualWorkflow?.note || '';
    dialog.querySelector('#rwError').textContent='';dialog.showModal();
  });
  dialog.querySelector('#rwCancel').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{if(focusBack?.isConnected)focusBack.focus();});
  dialog.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault(); const p=taskById(activeId);
    if(!p || p.done){dialog.querySelector('#rwError').textContent='업무가 삭제되었거나 완료 상태로 바뀌었습니다. 닫은 뒤 다시 확인하세요.';return;}
    const previous=p.manualWorkflow;
    if(select.value)p.manualWorkflow={status:select.value,note:dialog.querySelector('#rwNote').value.trim(),updatedAt:new Date().toISOString()};
    else delete p.manualWorkflow;
    try {
      const raw=JSON.stringify(PICKUPS);
      localStorage.setItem(PICKUPS_KEY,raw);
      if(localStorage.getItem(PICKUPS_KEY)!==raw)throw new Error('verify');
    } catch (_) {
      if(previous===undefined)delete p.manualWorkflow;else p.manualWorkflow=previous;
      dialog.querySelector('#rwError').textContent='기기에 저장하지 못했습니다. 저장 공간·권한을 확인하고 다시 시도하세요.';return;
    }
    if(typeof scheduleSync==='function')scheduleSync();
    dialog.close(); update();
    if(typeof showToast==='function')showToast('진행 상태를 기기에 저장했습니다. 서버 동기화는 별도로 진행됩니다.');
  });
  new MutationObserver(update).observe(box,{childList:true});
  setInterval(()=>{if(document.visibilityState!=='hidden')update();},1500);
  update();
})();
