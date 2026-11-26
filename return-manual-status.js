(() => {
  'use strict';
  if (window.__returnManualWorkflow) return;
  window.__returnManualWorkflow = true;
  const options = [['','자동 표시'],['scheduled','방문 예정'],['moving','이동 중'],['arrived','현장 도착'],['hold','보류'],['revisit','재방문 필요'],['contact','연락 필요']];
  const labels = new Map(options);
  const box = document.getElementById('pkList');
  if (!box) return;
  const style = document.createElement('style');
  style.textContent = `
  #pkList .return-manual-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #2d3b50}
  #pkList .return-manual-row>span{font-size:11px;color:#a3b2c8;margin-right:auto}
  #pkList .return-manual-row button{min-height:44px;padding:8px 12px;background:#293b60;color:#d7e3ff;border:1px solid #526a97;border-radius:9px;font-size:12px}
  #pkList .return-manual-row button:disabled{opacity:.5}
  #returnWorkflowDialog{width:min(480px,calc(100% - 28px));max-height:90dvh;overflow:auto;padding:22px;background:#152238;color:#edf2ff;border:1px solid #445874;border-radius:20px}
  #returnWorkflowDialog::backdrop{background:#020617b8}
  #returnWorkflowDialog h2{font-size:20px;font-weight:800;margin-bottom:8px}
  #returnWorkflowDialog p{font-size:12px;line-height:1.7;color:#b5c2d7;overflow-wrap:anywhere}
  #returnWorkflowDialog label{font-size:13px}
  #returnWorkflowDialog textarea,#returnWorkflowDialog input[type=number]{padding:10px;border:1px solid #4a5f80;border-radius:9px;background:#0f1b2d;color:#fff;font-size:16px}
  #returnWorkflowDialog textarea{width:100%;min-height:76px;margin-top:8px}
  #returnWorkflowDialog .rw-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}
  #returnWorkflowDialog button{min-height:44px;padding:9px 12px;border-radius:9px;background:#2d3f58;color:#e1e8f5}
  #returnWorkflowDialog button[aria-pressed=true],#returnWorkflowDialog button[type=submit]{background:#5b7be6;color:white}
  #returnWorkflowDialog .rw-item{display:grid;grid-template-columns:24px minmax(0,1fr) 90px;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid #34465f}
  #returnWorkflowDialog .rw-item input[type=checkbox]{width:21px;height:21px}
  #returnWorkflowDialog .rw-item input[type=number]{width:90px}
  #returnWorkflowDialog .rw-actions{display:flex;gap:8px;margin-top:18px}
  #returnWorkflowDialog .rw-actions button{flex:1}
  #returnWorkflowDialog #rwError{color:#f7b2c1;min-height:1.5em;margin-top:8px}
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.id='returnWorkflowDialog';
  dialog.setAttribute('aria-labelledby','rwTitle');
  dialog.innerHTML='<form><h2 id=rwTitle></h2><p id=rwSchool></p><p id=rwHelp></p><div id=rwFields></div><p id=rwError role=alert></p><div class=rw-actions><button id=rwCancel type=button>취소</button><button type=submit>저장</button></div></form>';
  document.body.append(dialog);
  let activeId=null, mode='', focusBack=null, selected='', quantities=[], snapshot='';
  const signatures=new WeakMap();
  const taskById=id=>typeof PICKUPS==='undefined'?null:PICKUPS.find(p=>String(p.id)===String(id));
  function update(){
    box.querySelectorAll('[data-pk-card]').forEach(card=>{
      const p=taskById(card.getAttribute('data-pk-card'));if(!p)return;
      const w=p.manualWorkflow||{};
      const sig=JSON.stringify([p.done,w,p.fieldQuantities]);
      let status=card.querySelector('[data-return-workflow]');
      let partial=card.querySelector('[data-partial-check]');
      // 통일된 .dc-card 안에는 이미 하단 .dc-secondary-actions에 버튼이 배치되어 있으므로 위치 삽입 없이 상태만 동기화
      if(status&&partial&&!card.querySelector('.return-manual-row')){
        if(signatures.get(card)===sig)return;
        signatures.set(card,sig);
        status.dataset.returnWorkflow=String(p.id);
        status.textContent=p.done?'완료됨':(labels.get(w.status)||'상태 · 메모')+' · 변경';
        status.disabled=!!p.done;status.title=w.note||'진행 상태 선택';
        partial.dataset.partialCheck=String(p.id);partial.disabled=!!p.done;
        partial.title=p.done?'전체 완료를 취소한 뒤 수량을 변경하세요.':'품목별 완료 체크 또는 처리 수량 입력';
        return;
      }
      if(signatures.get(card)===sig&&card.querySelector('.return-manual-row'))return;
      signatures.set(card,sig);
      let row=card.querySelector('.return-manual-row');
      if(!row){row=document.createElement('div');row.className='return-manual-row';row.innerHTML='<span>진행 상태</span><button type=button data-return-workflow></button><button type=button data-partial-check>일부 완료 체크</button>';const header=card.querySelector('.pk-ui-statusrow');if(header)header.after(row);else card.prepend(row);}
      status=row.querySelector('[data-return-workflow]');
      status.dataset.returnWorkflow=String(p.id);
      status.textContent=p.done?'처리 완료':(labels.get(w.status)||'상태 선택')+' · 변경';
      status.disabled=!!p.done;status.title=w.note||'진행 상태 선택';
      partial=row.querySelector('[data-partial-check]');partial.dataset.partialCheck=String(p.id);partial.disabled=!!p.done;
      partial.title=p.done?'전체 완료를 취소한 뒤 수량을 변경하세요.':'품목별 완료 체크 또는 처리 수량 입력';
    });
  }
  box.addEventListener('click',e=>{
    const button=e.target.closest('[data-return-workflow],[data-partial-check]');if(!button||button.disabled)return;
    const partial=button.hasAttribute('data-partial-check');
    const p=taskById(partial?button.dataset.partialCheck:button.dataset.returnWorkflow);if(!p||p.done)return;
    activeId=String(p.id);focusBack=button;mode=partial?'partial':'workflow';
    snapshot=JSON.stringify([p.done,p.fieldQuantities,p.manualWorkflow]);
    dialog.querySelector('#rwTitle').textContent=partial?'일부 완료 체크':'업무 상태 변경';
    dialog.querySelector('#rwSchool').textContent=p.school||'납품·회수·반품 업무';
    dialog.querySelector('#rwHelp').textContent=partial?'체크하면 해당 품목 전체 수량이 처리됩니다. 일부 수량만 처리했다면 숫자를 입력하세요. 전체 업무 완료는 기존 완료 버튼으로 별도 확인합니다.':'상태 탭을 선택하고 저장하세요. 진행 상태는 수량·전체 완료 여부·웍스 완료 상태를 바꾸지 않습니다.';
    dialog.querySelector('#rwError').textContent='';
    const fields=dialog.querySelector('#rwFields');fields.replaceChildren();
    if(partial){
      try{quantities=normalizeFieldQuantities(p.fieldQuantities,false).map(q=>({...q}));}catch(_){quantities=[];}
      if(!quantities.length){dialog.querySelector('#rwHelp').textContent='등록된 품목별 수량이 없습니다. 내용 수정에서 품목과 수량을 등록한 뒤 다시 체크하세요.';}
      quantities.forEach((q,i)=>{
        const max=Math.max(0,Number(q.qty)||0);
        const row=document.createElement('label');row.className='rw-item';
        const check=document.createElement('input');check.type='checkbox';check.checked=max>0&&Number(q.done)>=max;check.disabled=max===0;
        const name=document.createElement('span');name.textContent=String(q.name||q.label||q.item||q.field||('품목 '+(i+1)))+' / 전체 '+max;
        const input=document.createElement('input');input.type='number';input.min='0';input.max=String(max);input.step='1';input.value=String(Math.min(max,Math.max(0,Number(q.done)||0)));input.dataset.quantityIndex=String(i);input.setAttribute('aria-label',name.textContent+' 처리 수량');
        check.addEventListener('change',()=>{input.value=String(check.checked?max:0);});
        input.addEventListener('input',()=>{check.checked=max>0&&Number(input.value)===max;check.indeterminate=Number(input.value)>0&&Number(input.value)<max;});
        check.indeterminate=Number(input.value)>0&&Number(input.value)<max;
        row.append(check,name,input);fields.append(row);
      });
    }else{
      selected=labels.has(p.manualWorkflow?.status)?p.manualWorkflow.status:'';
      const tabs=document.createElement('div');tabs.className='rw-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','진행 상태 선택');
      for(const [value,label] of options){const tab=document.createElement('button');tab.type='button';tab.textContent=label;tab.setAttribute('aria-pressed',String(selected===value));tab.onclick=()=>{selected=value;for(const t of tabs.children)t.setAttribute('aria-pressed',String(t===tab));};tabs.append(tab);}
      const label=document.createElement('label');label.textContent='사유·메모 (선택)';label.htmlFor='rwNote';
      const note=document.createElement('textarea');note.id='rwNote';note.maxLength=300;note.value=p.manualWorkflow?.note||'';
      fields.append(tabs,label,note);
    }
    dialog.querySelector('button[type=submit]').disabled=partial&&!quantities.length;dialog.showModal();
  });
  dialog.querySelector('#rwCancel').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{if(focusBack?.isConnected)focusBack.focus();});
  dialog.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();const p=taskById(activeId);const error=dialog.querySelector('#rwError');
    if(!p||p.done||snapshot!==JSON.stringify([p.done,p.fieldQuantities,p.manualWorkflow])){error.textContent='업무 내용이 변경되었습니다. 닫은 뒤 다시 확인하세요.';return;}
    const key=mode==='partial'?'fieldQuantities':'manualWorkflow';const previous=p[key];
    if(mode==='partial'){
      const inputs=[...dialog.querySelectorAll('[data-quantity-index]')];
      if(!quantities.length||inputs.some((input,i)=>input.value.trim()===''||!Number.isSafeInteger(Number(input.value))||Number(input.value)<0||Number(input.value)>Math.max(0,Number(quantities[i].qty)||0))){error.textContent='처리 수량을 0부터 전체 수량 사이의 정수로 입력하세요.';return;}
      p.fieldQuantities=quantities.map((q,i)=>({...q,done:Number(inputs[i].value)}));
    }else if(selected){p.manualWorkflow={status:selected,note:dialog.querySelector('#rwNote').value.trim(),updatedAt:new Date().toISOString()};}else delete p.manualWorkflow;
    try{
      if(typeof savePickups==='function'){if(!savePickups())throw new Error('verify');}
      else{const raw=JSON.stringify(PICKUPS);localStorage.setItem(PICKUPS_KEY,raw);if(localStorage.getItem(PICKUPS_KEY)!==raw)throw new Error('verify');}
    }
    catch(_){if(previous===undefined)delete p[key];else p[key]=previous;error.textContent='기기에 저장하지 못했습니다. 저장 공간·권한을 확인하고 다시 시도하세요.';return;}
    dialog.close();
    if(typeof renderPickups==='function')renderPickups();
    update();
    if(typeof scheduleSync==='function')scheduleSync();
    if(typeof showToast==='function')showToast('기기에 저장했습니다. 서버 동기화는 별도로 진행됩니다.');
  });
  new MutationObserver(update).observe(box,{childList:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')update();});
  update();
})();
