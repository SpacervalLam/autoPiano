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
  bot.forEach((k,i)=> keyToNote[k] = whiteNotes[i]);
  mid.forEach((k,i)=> keyToNote[k] = whiteNotes[7 + i]);
  top.forEach((k,i)=> keyToNote[k] = whiteNotes[14 + i]);

  const freq = {
    'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'G3':196.00,'A3':220.00,'B3':246.94,
    'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'B4':493.88,
    'C5':523.25,'D5':587.33,'E5':659.25,'F5':698.46,'G5':783.99,'A5':880.00,'B5':987.77
  };

  const active = {};
  const activeFromPointer = new Set();
  const noteElements = {};

  // ─── 核心修复：用来标记每次 playNote 的"代" ──────────────────────────────
  // stopNote 的 setTimeout 回调捕获的是 h 的引用，而不是 active[name]。
  // 只要 h === active[name] 时才真正销毁，就能避免 "旧回调错误清理新播放" 的竞争。
  // 同时 active[name] 在 stopNote 调用时立即置 null，
  // 让下一次 playNote 可以立即进入，而不必等 release 结束。
  // ──────────────────────────────────────────────────────────────────────────

  function _destroyHandle(h) {
    // 安全销毁一个播放句柄的所有 Web Audio 节点
    try { clearTimeout(h.safetyTimeout); } catch(e) {}
    h.oscillators.forEach(({ osc, oscGain }) => {
      try { osc.stop(); } catch(e) {}
      try { osc.disconnect(); } catch(e) {}
      try { oscGain.disconnect(); } catch(e) {}
    });
    try { h.masterGain.disconnect(); } catch(e) {}
  }

  function playNote(name, fromPointer = false){
    // 如果当前有正在 release 中的旧句柄，先把它清理掉再开始新播放
    // （旧句柄的 gain 已经在向 0 ramp，直接 stop 不会有爆音）
    if(active[name]) {
      _destroyHandle(active[name]);
      active[name] = null;
      activeFromPointer.delete(name);
    }

    if(ctx.state === 'suspended') ctx.resume();

    const baseFreq = freq[name] || 440;
    const oscillators = [];

    const mainOsc = ctx.createOscillator();
    const mainGain = ctx.createGain();
    mainOsc.type = 'triangle';
    mainOsc.frequency.value = baseFreq;
    mainGain.gain.value = 0.5;
    mainOsc.connect(mainGain);
    oscillators.push({ osc: mainOsc, oscGain: mainGain });

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = baseFreq * 2;
    gain2.gain.value = 0.25;
    osc2.connect(gain2);
    oscillators.push({ osc: osc2, oscGain: gain2 });

    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.value = baseFreq * 3;
    gain3.gain.value = 0.12;
    osc3.connect(gain3);
    oscillators.push({ osc: osc3, oscGain: gain3 });

    const masterGain = ctx.createGain();
    const lowPassFilter = ctx.createBiquadFilter();
    const highPassFilter = ctx.createBiquadFilter();

    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = 3500;
    lowPassFilter.Q.value = 0.5;

    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 50;

    oscillators.forEach(({ oscGain }) => oscGain.connect(lowPassFilter));
    lowPassFilter.connect(highPassFilter);
    highPassFilter.connect(masterGain);
    masterGain.connect(ctx.destination);

    oscillators.forEach(({ osc }) => osc.start());

    const now = ctx.currentTime;
    const attack  = 0.008;
    const decay   = 0.3;
    const sustain = 0.35;
    const peak    = 0.55;

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.0, now);
    masterGain.gain.linearRampToValueAtTime(peak, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustain * peak, now + attack + decay);

    const maxDuration = 5.0;
    // safetyTimeout 使用闭包捕获 h，不依赖 active[name]
    const safetyTimeout = setTimeout(() => {
      if(active[name] === h) {
        console.warn(`音符 ${name} 达到最大播放时长，强制停止`);
        _destroyHandle(h);
        active[name] = null;
        activeFromPointer.delete(name);
        const el = noteElements[name];
        if(el) el.classList.remove('pressed');
      }
    }, maxDuration * 1000);

    const h = { oscillators, masterGain, startedAt: now, safetyTimeout };
    active[name] = h;
    if(fromPointer) activeFromPointer.add(name);

    const el = noteElements[name];
    if(el) el.classList.add('pressed');
  }

  function stopNote(name){
    const h = active[name];
    if(!h) return;

    // ★ 关键修复：立即将 active[name] 置 null，
    //   使后续 playNote 或重复 stopNote 不会再进入此分支。
    //   h 仍然保留局部引用，由下面的 setTimeout 负责最终销毁。
    active[name] = null;
    activeFromPointer.delete(name);

    const now = ctx.currentTime;
    const release = 0.4;

    h.masterGain.gain.cancelScheduledValues(now);
    h.masterGain.gain.setValueAtTime(h.masterGain.gain.value, now);
    h.masterGain.gain.linearRampToValueAtTime(0.0, now + release);

    // ★ setTimeout 只销毁"自己这次"的 h，与 active[name] 完全解耦。
    //   即使此音符在 release 期间被重新按下，新句柄也不会被误删。
    setTimeout(() => {
      _destroyHandle(h);
    }, (release + 0.05) * 1000);

    const el = noteElements[name];
    if(el) el.classList.remove('pressed');
  }

  // forceStopNote：立即截断，无 release（用于 safetyTimeout 已在上面内联处理）
  function forceStopNote(name){
    const h = active[name];
    if(!h) return;
    active[name] = null;
    activeFromPointer.delete(name);
    _destroyHandle(h);
    const el = noteElements[name];
    if(el) el.classList.remove('pressed');
  }

  // 创建按键到音符的反向映射
  const noteToKey = {};
  Object.entries(keyToNote).forEach(([key, note]) => {
    noteToKey[note] = key;
  });

  // 渲染 21 个白键（C3..B5）
  const keyboard = document.getElementById('keyboard');
  whiteNotes.forEach(n=>{
    const k = document.createElement('div');
    k.className = 'key';

    const label = document.createElement('div');
    label.className = 'note-label';
    label.textContent = n;
    k.appendChild(label);

    const keyHint = noteToKey[n];
    if(keyHint) {
      const hint = document.createElement('div');
      hint.className = 'key-hint';
      hint.textContent = keyHint.toUpperCase();
      k.appendChild(hint);
    }

    k.dataset.note = n;
    noteElements[n] = k;

    k.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); try{ k.setPointerCapture(ev.pointerId); }catch(e){} playNote(n, true); });
    k.addEventListener('pointerup',   (ev)=>{ ev.preventDefault(); try{ k.releasePointerCapture(ev.pointerId); }catch(e){} stopNote(n); });
    k.addEventListener('pointerleave',(ev)=>{ try{ if(k.hasPointerCapture && !k.hasPointerCapture(ev.pointerId)) stopNote(n); }catch(e){ stopNote(n); } });
    k.addEventListener('pointercancel',(ev)=>{ try{ k.releasePointerCapture(ev.pointerId); }catch(e){} stopNote(n); });

    keyboard.appendChild(k);
  });

  window.addEventListener('pointerup', ()=>{
    activeFromPointer.forEach(n=> stopNote(n));
    // activeFromPointer 已在 stopNote 内部 delete，此处 clear 作为兜底
    activeFromPointer.clear();
  });

  window.addEventListener('pointercancel', ()=>{
    activeFromPointer.forEach(n=> stopNote(n));
    activeFromPointer.clear();
  });

  const downSet = new Set();
  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if(downSet.has(k)) return;
    downSet.add(k);
    const note = keyToNote[k];
    if(note){ playNote(note); highlight(note,true); }
  });
  window.addEventListener('keyup', e=>{
    const k = e.key.toLowerCase();
    downSet.delete(k);
    const note = keyToNote[k];
    if(note){ stopNote(note); highlight(note,false); }
  });

  function highlight(note,on){
    const el = Array.from(document.querySelectorAll('.key')).find(x=>x.dataset.note===note);
    if(!el) return;
    if(on) el.classList.add('pressed'); else el.classList.remove('pressed');
  }

  // 加载歌曲列表
  async function loadSongList() {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/songs');
      const data = await res.json();
      const select = document.getElementById('songSelect');
      
      select.innerHTML = '';
      if (data.songs && data.songs.length > 0) {
        data.songs.forEach(song => {
          const option = document.createElement('option');
          option.value = song.filename;
          option.textContent = song.name;
          select.appendChild(option);
        });
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '没有可用的曲目';
        select.appendChild(option);
      }
    } catch(err) {
      console.error('加载歌曲列表失败', err);
      const select = document.getElementById('songSelect');
      select.innerHTML = '<option value="">加载失败</option>';
    }
  }

  // 自动播放功能
  document.getElementById('autoPlay').addEventListener('click', async ()=>{
    try{
      const select = document.getElementById('songSelect');
      const songName = select.value;
      
      const res = await fetch('http://127.0.0.1:5000/api/transcribe', { 
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song: songName })
      });
      const notes = await res.json();

      // 立即强制停止所有正在播放的音符（autoPlay 场景不需要 release 淡出）
      Object.keys(active).forEach(n => { if(active[n]) forceStopNote(n); });

      const start = ctx.currentTime + 0.1;

      notes.forEach(n=>{
        const name = n.note;
        const t = start + n.time;
        const duration = n.duration;

        const playDelay = (t - ctx.currentTime) * 1000;
        if(playDelay >= 0) {
          setTimeout(() => {
            playNote(name, false);
            highlight(name, true);

            setTimeout(() => {
              stopNote(name);
              highlight(name, false);
            }, duration * 1000);
          }, playDelay);
        }
      });

      console.log(`自动播放开始，共 ${notes.length} 个音符`);
    }catch(err){ console.error('自动播放失败',err); }
  });

  // 页面加载时获取歌曲列表
  loadSongList();
})();