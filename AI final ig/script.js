'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const qa = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { courses: [], schedule: [], mode:'batch', entity:'', spacious:true, stats:{nodes:0,backtracks:0,ms:0} };
  const SAMPLE = `Batch,Subject,Faculty_Name,Is_Lab,Weekly_Hours
S5 CSE-A,Data Structures,Dr. Meera Nair,false,3
S5 CSE-A,Database Systems,Prof. Arun Kumar,false,3
S5 CSE-A,Computer Networks,Dr. Fathima Ali,false,3
S5 CSE-A,Operating Systems,Dr. Raj Menon,false,3
S5 CSE-A,DBMS Lab,Prof. Arun Kumar,true,2
S5 CSE-A,Networks Lab,Dr. Fathima Ali,true,2
S5 CSE-B,Data Structures,Dr. Meera Nair,false,3
S5 CSE-B,Database Systems,Prof. Arun Kumar,false,3
S5 CSE-B,Computer Networks,Dr. Fathima Ali,false,3
S5 CSE-B,Operating Systems,Dr. Raj Menon,false,3
S5 CSE-B,Programming Lab,Prof. Vivek Das,true,2
S5 CSE-B,Networks Lab,Dr. Fathima Ali,true,2
S3 ECE-A,Digital Electronics,Dr. Neha Rao,false,3
S3 ECE-A,Signals & Systems,Prof. Ajay Shah,false,3
S3 ECE-A,Electronic Circuits,Dr. Kiran Das,false,3
S3 ECE-A,Electronics Lab,Dr. Neha Rao,true,3`;

  function csvParse(text){
    const rows=[]; let row=[], cell='', q=false;
    text=String(text||'').replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(c==='"' && q && n==='"'){cell+='"';i++;}
      else if(c==='"') q=!q;
      else if(c===','&&!q){row.push(cell.trim());cell='';}
      else if((c==='\n'||c==='\r')&&!q){ if(c==='\r'&&n==='\n')i++; row.push(cell.trim());cell=''; if(row.some(Boolean))rows.push(row); row=[]; }
      else cell+=c;
    }
    row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
    if(rows.length<2) throw new Error('CSV must include a header and at least one course.');
    const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const hdr=rows[0].map(norm), need=['batch','subject','facultyname','islab','weeklyhours'];
    const ix=Object.fromEntries(need.map(k=>[k,hdr.indexOf(k)]));
    if(Object.values(ix).some(v=>v<0)) throw new Error('Required columns: Batch, Subject, Faculty_Name, Is_Lab, Weekly_Hours.');
    return rows.slice(1).map((r,i)=>{
      const hours=Number(r[ix.weeklyhours]); const raw=(r[ix.islab]||'').toLowerCase();
      if(!r[ix.batch]||!r[ix.subject]||!r[ix.facultyname]||!Number.isInteger(hours)||hours<1) throw new Error(`Invalid course data on CSV row ${i+2}. Weekly_Hours must be a positive integer.`);
      return {id:i+1,batch:r[ix.batch],subject:r[ix.subject],faculty:r[ix.facultyname],isLab:['true','1','yes','y','lab'].includes(raw),hours};
    });
  }
  const csvEsc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  function coursesCSV(){ return ['Batch,Subject,Faculty_Name,Is_Lab,Weekly_Hours',...state.courses.map(c=>[c.batch,c.subject,c.faculty,c.isLab,c.hours].map(csvEsc).join(','))].join('\n'); }
  function parseRooms(id){ return $(id).value.split(',').map(x=>x.trim()).filter(Boolean); }
  function selectedDays(){ return qa('input[name="workday"]:checked').map(x=>x.value); }
  function config(){ return {days:selectedDays(), slots:Math.max(3,Math.min(10,Number($('slots-per-day').value)||6)), duration:Number($('slot-duration').value)||60, start:Number($('start-time').value)||9, theory:parseRooms('theory-rooms'), labs:parseRooms('lab-rooms')}; }
  function fmtTime(min){ const h=Math.floor(min/60), m=min%60, ap=h>=12?'PM':'AM', hh=((h+11)%12)+1; return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`; }
  function timeLabel(slot,cfg){ const a=cfg.start*60+slot*cfg.duration; return `${fmtTime(a)} – ${fmtTime(a+cfg.duration)}`; }
  function uniq(a){return [...new Set(a)];}

  function updateInputUI(){
    const t=parseRooms('theory-rooms'), l=parseRooms('lab-rooms');
    $('theory-rooms-count').textContent=`${t.length} room${t.length===1?'':'s'}`;
    $('lab-rooms-count').textContent=`${l.length} room${l.length===1?'':'s'}`;
    const hrs=state.courses.reduce((s,c)=>s+c.hours,0);
    $('workload-summary-badge').textContent=`${state.courses.length} Courses • ${hrs} Hours`;
    $('course-count-label').textContent=`${state.courses.length} item${state.courses.length===1?'':'s'}`;
    $('workload-table-body').innerHTML=state.courses.map(c=>`<tr><td class="p-1.5 px-2">${esc(c.batch)}</td><td class="p-1.5">${esc(c.subject)}${c.isLab?' <span class="text-purple-400">[LAB]</span>':''}</td><td class="p-1.5">${esc(c.faculty)}</td><td class="p-1.5 text-center">${c.hours}</td></tr>`).join('');
  }
  function esc(s){ const d=document.createElement('div'); d.textContent=String(s??''); return d.innerHTML; }
  function status(msg,type='ok'){
    const b=$('status-banner'); b.classList.remove('hidden','border-red-500/40','text-red-300','bg-red-500/10','border-purple-500/30','text-purple-300','bg-purple-500/10');
    const bad=type==='error'; b.classList.add(...(bad?['border-red-500/40','text-red-300','bg-red-500/10']:['border-purple-500/30','text-purple-300','bg-purple-500/10']));
    $('status-banner-icon').textContent=bad?'⚠':'✓'; $('status-banner-text').textContent=msg;
  }

  function solve(){
    const cfg=config();
    if(!state.courses.length) throw new Error('Load or enter workload CSV first.');
    if(!cfg.days.length) throw new Error('Select at least one working day.');
    if(!cfg.theory.length && state.courses.some(c=>!c.isLab)) throw new Error('Add at least one theory room.');
    if(!cfg.labs.length && state.courses.some(c=>c.isLab)) throw new Error('Add at least one lab room.');
    const perBatch={}; for(const c of state.courses) perBatch[c.batch]=(perBatch[c.batch]||0)+c.hours;
    for(const [b,h] of Object.entries(perBatch)) if(h>cfg.days.length*cfg.slots) throw new Error(`${b} needs ${h} slots but only ${cfg.days.length*cfg.slots} are available.`);
    const vars=[]; state.courses.forEach(c=>{for(let n=0;n<c.hours;n++) vars.push({...c,instance:n});});
    // Harder variables first: labs, shared faculty, larger course workloads.
    const facultyLoad={}; vars.forEach(v=>facultyLoad[v.faculty]=(facultyLoad[v.faculty]||0)+1);
    vars.sort((a,b)=>(Number(b.isLab)-Number(a.isLab))||(facultyLoad[b.faculty]-facultyLoad[a.faculty])||(b.hours-a.hours));
    const usedB=new Set(), usedF=new Set(), usedR=new Set(), courseDay=new Map(), assigned=[];
    let nodes=0, backtracks=0; const t0=performance.now();
    const key=(x,d,s)=>`${x}|${d}|${s}`;
    function domain(v){
      const rooms=v.isLab?cfg.labs:cfg.theory, out=[];
      for(const d of cfg.days) for(let s=0;s<cfg.slots;s++){
        if(usedB.has(key(v.batch,d,s))||usedF.has(key(v.faculty,d,s))) continue;
        // Prefer spreading the same subject across days, but allow same-day if needed.
        for(const r of rooms) if(!usedR.has(key(r,d,s))) out.push({d,s,r,pen:(courseDay.get(`${v.batch}|${v.subject}|${d}`)||0)*20+s*0.01});
      }
      out.sort((a,b)=>a.pen-b.pen); return out;
    }
    function pick(rem){ let bi=0, bd=null; for(let i=0;i<rem.length;i++){const d=domain(rem[i]); if(!d.length)return {i,dom:d}; if(!bd||d.length<bd.length){bi=i;bd=d;if(d.length===1)break;}} return {i:bi,dom:bd}; }
    function bt(rem){
      if(!rem.length)return true; if(nodes>250000)return false;
      const {i,dom}=pick(rem); if(!dom.length){backtracks++;return false;} const v=rem[i], next=rem.slice(0,i).concat(rem.slice(i+1));
      for(const p of dom){ nodes++; const kb=key(v.batch,p.d,p.s), kf=key(v.faculty,p.d,p.s), kr=key(p.r,p.d,p.s), cd=`${v.batch}|${v.subject}|${p.d}`;
        usedB.add(kb);usedF.add(kf);usedR.add(kr);courseDay.set(cd,(courseDay.get(cd)||0)+1); assigned.push({...v,day:p.d,slot:p.s,room:p.r});
        // Forward check only the most constrained remaining variables.
        let viable=true; for(const x of next){ if(domain(x).length===0){viable=false;break;} }
        if(viable&&bt(next))return true;
        assigned.pop(); usedB.delete(kb);usedF.delete(kf);usedR.delete(kr); const n=(courseDay.get(cd)||1)-1;n?courseDay.set(cd,n):courseDay.delete(cd);
      } backtracks++; return false;
    }
    const ok=bt(vars); const ms=performance.now()-t0;
    if(!ok) throw Object.assign(new Error('No conflict-free timetable exists with the current workload, days, slots, and rooms. Add capacity or reduce constraints.'),{stats:{nodes,backtracks,ms}});
    assigned.sort((a,b)=>cfg.days.indexOf(a.day)-cfg.days.indexOf(b.day)||a.slot-b.slot||a.batch.localeCompare(b.batch));
    return {schedule:assigned,cfg,stats:{nodes,backtracks,ms}};
  }

  function audit(){
    const counts={batch:0,faculty:0,room:0,lab:0}; const seen={batch:new Set(),faculty:new Set(),room:new Set()}, labs=new Set(parseRooms('lab-rooms'));
    for(const x of state.schedule){ for(const k of ['batch','faculty','room']){const z=`${x[k]}|${x.day}|${x.slot}`; if(seen[k].has(z))counts[k]++;seen[k].add(z);} if(x.isLab&&!labs.has(x.room))counts.lab++; }
    $('audit-batch-check').textContent=`${counts.batch} collisions`; $('audit-faculty-check').textContent=`${counts.faculty} collisions`; $('audit-room-check').textContent=`${counts.room} collisions`; $('audit-lab-check').textContent=counts.lab?`${counts.lab} violations`:'100% compliant';
    const total=counts.batch+counts.faculty+counts.room+counts.lab; $('audit-status').textContent=total?'Issues detected':'All checks passed'; $('metric-constraints').textContent=total?'Failed':'Passed'; $('metric-conflicts-detail').textContent=`${total} Violation${total===1?'':'s'}`;
  }
  function entities(mode){ if(mode==='batch')return uniq(state.courses.map(c=>c.batch)); if(mode==='faculty')return uniq(state.courses.map(c=>c.faculty)); if(mode==='room')return uniq([...parseRooms('theory-rooms'),...parseRooms('lab-rooms')]); return ['All Batches']; }
  function syncSelectors(){
    const es=entities(state.mode); if(!es.includes(state.entity))state.entity=es[0]||'';
    for(const id of ['entity-selector','entity-selector-fullscreen']){ const e=$(id); e.innerHTML=es.map(x=>`<option ${x===state.entity?'selected':''}>${esc(x)}</option>`).join(''); e.disabled=state.mode==='all'; }
    const label=state.mode==='batch'?'Batch:':state.mode==='faculty'?'Faculty:':state.mode==='room'?'Room:':'View:'; $('entity-selector-label').textContent=label;$('entity-selector-fullscreen-label').textContent=label;
    for(const root of [$('view-mode-tabs'),$('view-mode-tabs-fullscreen')]) qa('button[data-mode]',root).forEach(b=>{const on=b.dataset.mode===state.mode;b.classList.toggle('bg-[#27272a]',on);b.classList.toggle('text-zinc-100',on);b.classList.toggle('font-medium',on);b.classList.toggle('text-zinc-400',!on);});
  }
  function visibleSessions(){ if(state.mode==='all')return state.schedule; return state.schedule.filter(x=>x[state.mode]===state.entity); }
  function renderMatrix(wrapper,full=false){
    const cfg=config(), sessions=visibleSessions(), search=($(full?'search-filter-fullscreen':'search-filter').value||'').toLowerCase();
    const by=new Map(); sessions.forEach(x=>{const k=`${x.day}|${x.slot}`; if(!by.has(k))by.set(k,[]);by.get(k).push(x);});
    let h='<table class="w-full text-xs font-mono print-matrix"><thead><tr><th class="p-3 text-left border border-[#27272a]">Day / Time</th>';
    for(let s=0;s<cfg.slots;s++)h+=`<th class="p-3 text-center border border-[#27272a] min-w-[125px]">${esc(timeLabel(s,cfg))}</th>`; h+='</tr></thead><tbody>';
    for(const d of cfg.days){h+=`<tr><th class="p-3 text-left border border-[#27272a]">${d}</th>`; for(let s=0;s<cfg.slots;s++){const arr=by.get(`${d}|${s}`)||[];h+='<td class="p-2 align-top border border-[#27272a]">'; if(!arr.length)h+='<div class="timetable-free-box rounded-md min-h-[70px] flex items-center justify-center text-zinc-500">Free</div>'; else for(const x of arr){const hay=`${x.subject} ${x.room} ${x.faculty} ${x.batch}`.toLowerCase(), hi=search&&hay.includes(search);h+=`<button type="button" class="timetable-lecture-card ${hi?'is-highlighted':''} w-full text-left rounded-md border ${x.isLab?'border-purple-500/40 bg-purple-500/10':'border-[#3f3f46] bg-[#27272a]/60'} p-${full&&state.spacious?'3':'2'} mb-1" data-session="${state.schedule.indexOf(x)}"><div class="font-semibold text-zinc-100">${esc(x.subject)}</div><div class="text-zinc-400 mt-1">${esc(x.batch)}</div><div class="text-zinc-400">${esc(x.faculty)}</div><div class="text-purple-400">${esc(x.room)}${x.isLab?' • LAB':''}</div></button>`;} h+='</td>'; } h+='</tr>';}
    wrapper.innerHTML=h+'</tbody></table>';
    qa('[data-session]',wrapper).forEach(b=>b.addEventListener('click',()=>openDetails(state.schedule[Number(b.dataset.session)])));
  }
  function render(){ syncSelectors(); const label=state.mode==='all'?'All Batches':`${state.mode[0].toUpperCase()+state.mode.slice(1)} Schedule: ${state.entity}`; $('current-view-title').querySelector('span').textContent=label;$('current-view-title-fullscreen').querySelector('span').textContent=label; renderMatrix($('timetable-matrix-wrapper'));renderMatrix($('full-timetable-matrix-wrapper'),true); }
  function openDetails(x){ if(!x)return; const cfg=config(); $('course-detail-title').textContent=x.subject;$('detail-batch').textContent=x.batch;$('detail-faculty').textContent=x.faculty;$('detail-day').textContent=x.day;$('detail-time').textContent=timeLabel(x.slot,cfg);$('detail-room').textContent=x.room;$('detail-format').textContent=x.isLab?'Lab (strict lab room)':'Theory'; const d=$('course-detail-dialog'); d.showModal?d.showModal():d.setAttribute('open',''); }
  function metrics(cfg){ const st=state.stats, total=state.courses.reduce((s,c)=>s+c.hours,0), cap=cfg.days.length*cfg.slots*(cfg.theory.length+cfg.labs.length); $('metric-exec-time').textContent=st.ms.toFixed(1);$('metric-nodes').textContent=st.nodes.toLocaleString();$('metric-backtracks').textContent=`${st.backtracks.toLocaleString()} backtracks`;$('metric-slots-assigned').textContent=state.schedule.length;$('metric-slots-total').textContent=`/ ${total}`;$('metric-utilization').textContent=`${cap?Math.round(state.schedule.length/cap*100):0}% capacity`; }
  function generate(){ $('generate-btn-text').textContent='Solving CSP…'; setTimeout(()=>{try{const r=solve();state.schedule=r.schedule;state.stats=r.stats;metrics(r.cfg);audit();render();status(`Generated ${state.schedule.length} sessions with all hard constraints satisfied.`);}catch(e){if(e.stats)state.stats=e.stats;status(e.message,'error');}finally{$('generate-btn-text').textContent='Generate Schedule';}},0); }
  function exportCSV(){ if(!state.schedule.length){status('Generate a schedule before exporting.','error');return;} const cfg=config(); const rows=['Day,Slot,Time,Batch,Subject,Faculty,Room,Is_Lab',...state.schedule.map(x=>[x.day,x.slot+1,timeLabel(x.slot,cfg),x.batch,x.subject,x.faculty,x.room,x.isLab].map(csvEsc).join(','))]; const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));a.download='generated-timetable.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function loadText(text){ try{state.courses=csvParse(text);$('raw-csv-textarea').value=text;updateInputUI();state.schedule=[];render();status(`Loaded ${state.courses.length} courses. Ready to generate.`);}catch(e){status(e.message,'error');} }
  function setPage(full){$('page-workspace').classList.toggle('hidden',full);$('page-timetable-view').classList.toggle('hidden',!full);render();}
  function setMode(m){state.mode=m;state.entity='';render();}
  function toggleTheme(){const root=document.documentElement,light=!root.classList.contains('theme-light');root.classList.toggle('theme-light',light);root.classList.toggle('theme-dark',!light);$('theme-icon-sun').classList.toggle('hidden',!light);$('theme-icon-moon').classList.toggle('hidden',light);localStorage.setItem('academic-theme',light?'light':'dark');}

  function bind(){
    $('btn-generate-schedule').addEventListener('click',generate); $('btn-load-sample').addEventListener('click',()=>loadText(SAMPLE));$('btn-load-sample-top').addEventListener('click',()=>loadText(SAMPLE));
    $('btn-toggle-editor').addEventListener('click',()=>{$('csv-editor-container').classList.toggle('hidden');$('csv-editor-container').classList.toggle('flex');}); $('btn-apply-csv').addEventListener('click',()=>loadText($('raw-csv-textarea').value));
    $('csv-file-input').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadText(r.result);r.readAsText(f);});
    const drop=$('csv-file-input').closest('label'); drop.addEventListener('dragover',e=>e.preventDefault());drop.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){const r=new FileReader();r.onload=()=>loadText(r.result);r.readAsText(f);}});
    for(const id of ['theory-rooms','lab-rooms'])$(id).addEventListener('input',()=>{updateInputUI();if(state.schedule.length)render();});
    for(const id of ['slots-per-day','slot-duration','start-time'])$(id).addEventListener('change',()=>state.schedule.length&&render()); qa('input[name="workday"]').forEach(x=>x.addEventListener('change',()=>state.schedule.length&&render()));
    for(const root of [$('view-mode-tabs'),$('view-mode-tabs-fullscreen')])root.addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setMode(b.dataset.mode);});
    for(const id of ['entity-selector','entity-selector-fullscreen'])$(id).addEventListener('change',e=>{state.entity=e.target.value;render();});
    $('btn-expand-all').addEventListener('click',()=>{const es=entities(state.mode);if(es.length){state.entity=es[(Math.max(0,es.indexOf(state.entity))+1)%es.length];render();}});
    $('search-filter').addEventListener('input',render);$('search-filter-fullscreen').addEventListener('input',render);
    $('btn-open-full-page').addEventListener('click',()=>setPage(true));$('btn-back-to-generator').addEventListener('click',()=>setPage(false));$('btn-nav-timetable').addEventListener('click',()=>setPage(true));$('btn-nav-workspace').addEventListener('click',()=>setPage(false));
    $('btn-scale-spacious').addEventListener('click',()=>{state.spacious=true;render();});$('btn-scale-fit').addEventListener('click',()=>{state.spacious=false;render();});
    for(const id of ['btn-export-csv','btn-export-csv-fullscreen'])$(id).addEventListener('click',exportCSV); for(const id of ['btn-print','btn-print-fullscreen'])$(id).addEventListener('click',()=>window.print());
    $('btn-theme-toggle').addEventListener('click',toggleTheme);$('btn-close-course-details').addEventListener('click',()=>$('course-detail-dialog').close());$('course-detail-dialog').addEventListener('click',e=>{if(e.target===$('course-detail-dialog'))$('course-detail-dialog').close();});
  }
  document.addEventListener('DOMContentLoaded',()=>{bind(); if(localStorage.getItem('academic-theme')==='light')toggleTheme(); loadText(SAMPLE);});
})();
