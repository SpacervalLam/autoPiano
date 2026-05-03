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
    try { h.dynamicLowpass.disconnect(); } catch(e) {}
    try { h.cabinetResonance.disconnect(); } catch(e) {}
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
    
    // ─── 音区检测 ───────────────────────────────────────────────
    const isLow = baseFreq < 200;   // 低音区（C3-F3）
    const isHigh = baseFreq > 600;  // 高音区（F5以上）
    
    // ─── 振荡器设置 ─────────────────────────────────────────────
    const oscillators = [];

    // 主振荡器（三角形波，柔和的基础音色）
    const mainOsc = ctx.createOscillator();
    const mainGain = ctx.createGain();
    mainOsc.type = 'triangle';
    mainOsc.frequency.value = baseFreq;
    mainGain.gain.value = 0.5;
    mainOsc.connect(mainGain);
    oscillators.push({ osc: mainOsc, oscGain: mainGain });

    // 第二泛音（2倍频，正弦波）
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = baseFreq * 2;
    gain2.gain.value = 0.25;
    osc2.connect(gain2);
    oscillators.push({ osc: osc2, oscGain: gain2 });

    // 第三泛音（3倍频，正弦波）
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.value = baseFreq * 3;
    gain3.gain.value = 0.12;
    osc3.connect(gain3);
    oscillators.push({ osc: osc3, oscGain: gain3 });

    // ─── 音频处理链 ─────────────────────────────────────────────
    const masterGain = ctx.createGain();
    
    // 时变低通滤波器（模拟击弦后高频逐渐消失）
    const dynamicLowpass = ctx.createBiquadFilter();
    dynamicLowpass.type = 'lowpass';
    dynamicLowpass.Q.value = 0.7;
    
    // 静态共鸣滤波器（模拟钢琴箱体共振）
    const cabinetResonance = ctx.createBiquadFilter();
    cabinetResonance.type = 'bandpass';
    cabinetResonance.frequency.value = 300;
    cabinetResonance.Q.value = 1.2;
    cabinetResonance.gain.value = 2.5;
    
    // 高通滤波器（去除低频噪音）
    const highPassFilter = ctx.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 50;

    // 连接链路：振荡器 -> 时变低通 -> 共鸣滤波 -> 高通 -> 主增益
    oscillators.forEach(({ oscGain }) => oscGain.connect(dynamicLowpass));
    dynamicLowpass.connect(cabinetResonance);
    cabinetResonance.connect(highPassFilter);
    highPassFilter.connect(masterGain);
    masterGain.connect(ctx.destination);

    oscillators.forEach(({ osc }) => osc.start());

    const now = ctx.currentTime;
    
    // ─── 精细化振幅包络（双阶段衰减 + 音区差异化） ─────────────────
    const attack  = isHigh ? 0.003 : isLow ? 0.01 : 0.006;  // 极快起音
    const decay1  = isHigh ? 0.15 : isLow ? 0.4 : 0.25;     // 第一阶段快速衰减
    const decay2  = isHigh ? 0.8 : isLow ? 2.5 : 1.5;       // 第二阶段缓慢衰减
    const peak    = 0.6;
    const sustain1 = peak * (isHigh ? 0.25 : isLow ? 0.5 : 0.35);  // 第一延音水平
    const sustain2 = peak * (isHigh ? 0.05 : isLow ? 0.15 : 0.1);  // 第二延音水平（最终）

    // 时变低通滤波器：初始高频丰富，随后快速下降
    const initFreq = isHigh ? 8000 : isLow ? 4000 : 6000;
    const endFreq = isHigh ? 2000 : isLow ? 1000 : 1500;
    dynamicLowpass.frequency.setValueAtTime(initFreq, now);
    dynamicLowpass.frequency.linearRampToValueAtTime(endFreq, now + 0.3);

    // 振幅包络：起音 -> 快速衰减 -> 缓慢衰减
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.0, now);
    masterGain.gain.linearRampToValueAtTime(peak, now + attack);
    masterGain.gain.linearRampToValueAtTime(sustain1, now + attack + decay1);
    masterGain.gain.linearRampToValueAtTime(sustain2, now + attack + decay1 + decay2);

    const maxDuration = isLow ? 8.0 : isHigh ? 3.0 : 5.0;  // 低音时长更长
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

    const h = { oscillators, masterGain, dynamicLowpass, cabinetResonance, startedAt: now, safetyTimeout };
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
  whiteNotes.forEach((n, index)=>{
    const k = document.createElement('div');
    k.className = 'white-key';

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

  // 添加视觉黑键（仅供视觉效果，无功能）
  const blackKeyPositions = [0, 1, 3, 4, 5];
  const whiteKeyWidth = 62;

  [0, 1, 2].forEach(octaveOffset => {
    blackKeyPositions.forEach(pos => {
      const blackKey = document.createElement('div');
      blackKey.className = 'black-key';
      const position = (octaveOffset * 7 + pos) * whiteKeyWidth + whiteKeyWidth - 18;
      blackKey.style.left = `${position}px`;
      keyboard.appendChild(blackKey);
    });
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
    const el = Array.from(document.querySelectorAll('.white-key')).find(x=>x.dataset.note===note);
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
      const manageOption = document.createElement('option');
      manageOption.value = '__manage__';
      manageOption.textContent = '管理曲目';
      manageOption.style.color = '#888';
      select.appendChild(manageOption);
    } catch(err) {
      console.error('加载歌曲列表失败', err);
      const select = document.getElementById('songSelect');
      select.innerHTML = '<option value="">加载失败</option>';
    }
  }

  // 下拉框选择变化处理
  document.getElementById('songSelect').addEventListener('change', async (e) => {
    if (e.target.value === '__manage__') {
      e.target.value = '';
      document.getElementById('manageModal').style.display = 'flex';
      loadManageModal();
    }
  });

  // 加载管理模态框内容
  async function loadManageModal() {
    const songList = document.getElementById('songList');
    songList.innerHTML = '';
    try {
      const res = await fetch('http://127.0.0.1:5000/api/songs');
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        data.songs.forEach(song => {
          const item = document.createElement('div');
          item.className = 'song-item';
          item.innerHTML = `
            <span class="song-name" style="flex:1; color:#f1f1f1;">${song.name}</span>
            <button class="rename-btn" data-file="${song.filename}" data-name="${song.name}">重命名</button>
            <button class="del-btn" data-file="${song.filename}" style="color:#f44336;">删除</button>
          `;
          songList.appendChild(item);
        });
        document.querySelectorAll('.del-btn').forEach(btn => {
          btn.addEventListener('click', async (ev) => {
            const filename = ev.target.dataset.file;
            if (confirm('确定要删除这首曲目吗？')) {
              await fetch('http://127.0.0.1:5000/api/songs/' + filename, { method: 'DELETE' });
              loadManageModal();
            }
          });
        });
        document.querySelectorAll('.rename-btn').forEach(btn => {
          btn.addEventListener('click', async (ev) => {
            const filename = ev.target.dataset.file;
            const currentName = ev.target.dataset.name;
            const newName = prompt('请输入新的曲目名称：', currentName);
            if (newName && newName.trim() && newName !== currentName) {
              const newFilename = newName.trim() + '.txt';
              await fetch('http://127.0.0.1:5000/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_filename: filename, new_filename: newFilename })
              });
              loadManageModal();
            }
          });
        });
      } else {
        songList.innerHTML = '<p style="color:#888;">没有可管理的曲目</p>';
      }
    } catch(err) {
      songList.innerHTML = '<p style="color:#f44336;">加载失败</p>';
    }
  }

  // 关闭模态框
  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('manageModal').style.display = 'none';
  });

  document.getElementById('manageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('manageModal')) {
      document.getElementById('manageModal').style.display = 'none';
    }
  });

  // 自动播放功能
  let autoPlayTimeouts = [];
  document.getElementById('autoPlay').addEventListener('click', async ()=>{
    const btn = document.getElementById('autoPlay');

    if (btn.classList.contains('playing')) {
      autoPlayTimeouts.forEach(t => clearTimeout(t));
      autoPlayTimeouts = [];
      Object.keys(active).forEach(n => { if(active[n]) forceStopNote(n); });
      btn.classList.remove('playing');
      btn.textContent = '🎵 自动播放';
      return;
    }

    try{
      const select = document.getElementById('songSelect');
      const songName = select.value;

      if (!songName || songName === '__manage__') return;

      const res = await fetch('http://127.0.0.1:5000/api/transcribe', {
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song: songName })
      });
      const notes = await res.json();

      Object.keys(active).forEach(n => { if(active[n]) forceStopNote(n); });

      btn.classList.add('playing');
      btn.textContent = '🎵 播放中...';

      const start = ctx.currentTime + 0.1;
      let maxEndTime = 0;

      notes.forEach(n=>{
        const name = n.note;
        const t = start + n.time;
        const duration = n.duration;
        maxEndTime = Math.max(maxEndTime, t + duration);

        const playDelay = (t - ctx.currentTime) * 1000;
        if(playDelay >= 0) {
          const timeoutId = setTimeout(() => {
            playNote(name, false);
            highlight(name, true);

            const stopTimeoutId = setTimeout(() => {
              stopNote(name);
              highlight(name, false);
            }, duration * 1000);
            autoPlayTimeouts.push(stopTimeoutId);
          }, playDelay);
          autoPlayTimeouts.push(timeoutId);
        }
      });

      const endDelay = (maxEndTime - ctx.currentTime + 0.5) * 1000;
      const endTimeoutId = setTimeout(() => {
        btn.classList.remove('playing');
        btn.textContent = '🎵 自动播放';
        autoPlayTimeouts = [];
      }, endDelay);
      autoPlayTimeouts.push(endTimeoutId);

      console.log(`自动播放开始，共 ${notes.length} 个音符`);
    }catch(err){ console.error('自动播放失败',err); }
  });

  // 录制功能
  let isRecordingPending = false;  // 待录制状态
  let isRecording = false;          // 正式录制状态
  let recordingStartTime = 0;
  let recordedNotes = [];

  document.getElementById('recordBtn').addEventListener('click', () => {
    isRecordingPending = true;
    isRecording = false;
    recordingStartTime = 0;
    recordedNotes = [];
    
    document.getElementById('recordBtn').style.display = 'none';
    document.getElementById('stopRecordBtn').style.display = 'inline-block';
    document.getElementById('stopRecordBtn').classList.add('recording');
    document.getElementById('stopRecordBtn').textContent = '⏹️ 待录制';
    
    console.log('进入待录制状态，请按下第一个音符开始录制');
  });

  document.getElementById('stopRecordBtn').addEventListener('click', async () => {
    isRecordingPending = false;
    isRecording = false;
    recordingStartTime = 0;
    
    document.getElementById('stopRecordBtn').style.display = 'none';
    document.getElementById('stopRecordBtn').classList.remove('recording');
    document.getElementById('stopRecordBtn').textContent = '⏹️ 停止录制';
    document.getElementById('recordBtn').style.display = 'inline-block';
    
    if (recordedNotes.length > 0) {
      const songName = prompt('请输入录制的曲目名称：');
      if (songName && songName.trim()) {
        try {
          const res = await fetch('http://127.0.0.1:5000/api/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              song_name: songName.trim(),
              notes: recordedNotes
            })
          });
          const result = await res.json();
          if (result.success) {
            alert('录制成功！曲目已保存');
            loadSongList();
          } else {
            alert('录制失败：' + result.message);
          }
        } catch (err) {
          console.error('录制保存失败', err);
          alert('录制保存失败');
        }
      }
    }
    
    console.log('停止录制，共录制 ' + recordedNotes.length + ' 个音符');
  });

  // 重写 playNote 以支持录制
  const originalPlayNote = playNote;
  playNote = function(name, fromPointer = false) {
    if (isRecordingPending && !isRecording) {
      // 第一个音符，正式开始录制
      isRecording = true;
      recordingStartTime = ctx.currentTime;
      document.getElementById('stopRecordBtn').textContent = '⏹️ 录制中';
      console.log('第一个音符已按下，正式开始录制');
    }
    
    if (isRecording) {
      const time = ctx.currentTime - recordingStartTime;
      recordedNotes.push({ note: name, time: time, duration: 0.5 });
      console.log(`录制音符: ${name} at ${time.toFixed(3)}s`);
    }
    originalPlayNote(name, fromPointer);
  };

  // 页面加载时获取歌曲列表
  loadSongList();
})();