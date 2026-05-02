// 前端原型：键盘映射 + WebAudio 低延迟演示 + 调用后端占位接口自动播放
(function(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  // 三个八度白键：C3..B3, C4..B4, C5..B5（共21键）
  const whiteNotes = [];
  const names = ['C','D','E','F','G','A','B'];
  [3,4,5].forEach(oct => names.forEach(n=> whiteNotes.push(n+oct)));

  // 按键映射：按用户要求使用三排键位
  // 上排: q w e r t y u -> 对应 C5..B5
  // 中排: a s d f g h j -> 对应 C4..B4
  // 下排: z x c v b n m -> 对应 C3..B3
  const keyToNote = {};
  const top = ['q','w','e','r','t','y','u'];
  const mid = ['a','s','d','f','g','h','j'];
  const bot = ['z','x','c','v','b','n','m'];
  // map bottom -> octave 3
  bot.forEach((k,i)=> keyToNote[k] = whiteNotes[i]);
  mid.forEach((k,i)=> keyToNote[k] = whiteNotes[7 + i]);
  top.forEach((k,i)=> keyToNote[k] = whiteNotes[14 + i]);

  const freq = {
    'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'G3':196.00,'A3':220.00,'B3':246.94,
    'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'B4':493.88,
    'C5':523.25,'D5':587.33,'E5':659.25,'F5':698.46,'G5':783.99,'A5':880.00,'B5':987.77
  };

  const active = {};
  const activeFromPointer = new Set(); // 记录哪些音符是由指针事件触发的
  const noteElements = {}; // note -> DOM element

  function playNote(name, fromPointer = false){
    if(active[name]) return;
    // ensure audio context resumed on first gesture
    if(ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.value = freq[name] || 440;
    filter.type = 'lowpass';
    filter.frequency.value = 8000;
    g.gain.value = 0.0;
    o.connect(filter); filter.connect(g); g.connect(ctx.destination);
    o.start();
    // 简单 ADSR：快攻、短释放
    const now = ctx.currentTime;
    const attack = 0.008;
    const peak = 0.9;
    if(g.gain.cancelScheduledValues) {
      g.gain.cancelScheduledValues(now);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + attack);
    active[name] = {osc:o,gain:g, startedAt: now};
    if(fromPointer) activeFromPointer.add(name);
    // 视觉按下效果
    const el = noteElements[name];
    if(el) el.classList.add('pressed');
  }

  function stopNote(name){
    const h = active[name];
    if(!h) return;
    const now = ctx.currentTime;
    const release = 0.12;
    // 防御性编程：检查 cancelScheduledValues 是否存在
    if(h.gain.gain.cancelScheduledValues) {
      h.gain.gain.cancelScheduledValues(now);
    }
    h.gain.gain.setValueAtTime(h.gain.gain.value, now);
    h.gain.gain.linearRampToValueAtTime(0.0001, now + release);
    setTimeout(()=>{ try{ h.osc.stop() }catch(e){} delete active[name]; activeFromPointer.delete(name); }, (release+0.02)*1000);
    // 移除视觉按下效果
    const el = noteElements[name];
    if(el) el.classList.remove('pressed');
  }

  // 渲染 21 个白键（C3..B5）
  const keyboard = document.getElementById('keyboard');
  whiteNotes.forEach(n=>{
    const k = document.createElement('div');
    k.className = 'key';
    const label = document.createElement('div'); label.className = 'label'; label.textContent = n;
    k.appendChild(label);
    k.dataset.note = n;
    noteElements[n] = k;
    // pointer events handle mouse + touch
    k.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); try{ k.setPointerCapture(ev.pointerId); }catch(e){} playNote(n, true); });
    k.addEventListener('pointerup', (ev)=>{ ev.preventDefault(); try{ k.releasePointerCapture(ev.pointerId); }catch(e){} stopNote(n); });
    k.addEventListener('pointerleave', (ev)=>{ /* do not force-stop here if pointer is captured */ try{ if(k.hasPointerCapture && !k.hasPointerCapture(ev.pointerId)) stopNote(n); }catch(e){ stopNote(n); } });
    k.addEventListener('pointercancel', (ev)=>{ try{ k.releasePointerCapture(ev.pointerId); }catch(e){} stopNote(n); });
    // ensure touchend outside target also releases
    keyboard.appendChild(k);
  });

  // global pointerup to handle release outside key element (only for pointer events)
  window.addEventListener('pointerup', ()=>{
    // 只停止由指针事件触发的音符
    activeFromPointer.forEach(n=> stopNote(n));
    activeFromPointer.clear();
  });

  // pointercancel: ensure release (only for pointer events)
  window.addEventListener('pointercancel', ()=>{
    // 只停止由指针事件触发的音符
    activeFromPointer.forEach(n=> stopNote(n));
    activeFromPointer.clear();
  });

  // 键盘事件（防止重复触发）
  const downSet = new Set();
  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if(downSet.has(k)) return;
    downSet.add(k);
    const note = keyToNote[k];
    if(note){ playNote(note); highlight(note,true) }
  });
  window.addEventListener('keyup', e=>{
    const k = e.key.toLowerCase();
    downSet.delete(k);
    const note = keyToNote[k];
    if(note){ stopNote(note); highlight(note,false) }
  });

  function highlight(note,on){
    const el = Array.from(document.querySelectorAll('.key')).find(x=>x.dataset.note===note);
    if(!el) return; if(on) el.classList.add('pressed'); else el.classList.remove('pressed');
  }

  // 自动播放：请求后端占位接口并按时间触发
  document.getElementById('autoPlay').addEventListener('click', async ()=>{
    try{
      const res = await fetch('http://127.0.0.1:5000/api/transcribe', { method:'POST' });
      const notes = await res.json();
      const start = ctx.currentTime + 0.05;
      notes.forEach(n=>{
        const name = n.note;
        const t = start + n.time;
        // schedule: start/stop via timeout relative to wall clock
        setTimeout(()=>{ playNote(name); highlight(name,true) }, (t - ctx.currentTime)*1000);
        setTimeout(()=>{ stopNote(name); highlight(name,false) }, (t + n.duration - ctx.currentTime)*1000);
      });
    }catch(err){ console.error('自动播放失败',err) }
  });
})();
