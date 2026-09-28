const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stage = $('#stage');
const stageEmpty = $('#stageEmpty');
const backgroundInput = $('#backgroundInput');
const backgroundImage = $('#backgroundImage');
const partInput = $('#partInput');
const partTemplate = $('#partTemplate');
const characterArea = $('#characterArea');
const parentSelect = $('#parentSelect');
const layerList = $('#layerList');
const controlPanel = $('#controlPanel');
const layerPanel = $('#layerPanel');
const statusText = $('#statusText');
const testStatus = $('#testStatus');
const jsonPreview = $('#jsonPreview');
const selectedCoord = $('#selectedCoord');
const selectedName = $('#selectedName');
const controlModeText = $('#controlModeText');

const state = {
  stage: { width: 390, height: 844 },
  area: { x: 12, y: 18, width: 160, height: 220 },
  parts: [],
  selectedId: null,
  pivotMode: false,
  backgroundUrl: '',
  dragRaf: 0,
  testAnimation: null,
  testPartId: null
};

const inputs = {
  stageWidth: $('#stageWidth'), stageHeight: $('#stageHeight'),
  areaX: $('#areaX'), areaY: $('#areaY'), areaW: $('#areaW'), areaH: $('#areaH'),
  partX: $('#partX'), partY: $('#partY'), partW: $('#partW'), partRot: $('#partRot'),
  pivotX: $('#pivotX'), pivotY: $('#pivotY'),
  testAmplitude: $('#testAmplitude'), testDuration: $('#testDuration')
};

function uid() {
  return `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function int(value, fallback = 0) {
  const n = Math.round(num(value, fallback));
  return Number.isFinite(n) ? n : fallback;
}
function selectedPart() {
  return state.parts.find(p => p.id === state.selectedId) || null;
}
function getPartNode(id) {
  return characterArea.querySelector(`.rig-part[data-id="${CSS.escape(id)}"]`);
}
function markChanged(text = '変更あり') {
  statusText.textContent = text;
}

function syncStage() {
  stage.style.width = `${state.stage.width}px`;
  stage.style.height = `${state.stage.height}px`;
  inputs.stageWidth.value = state.stage.width;
  inputs.stageHeight.value = state.stage.height;
}
function syncArea() {
  characterArea.style.left = `${state.area.x}px`;
  characterArea.style.top = `${state.area.y}px`;
  characterArea.style.width = `${state.area.width}px`;
  characterArea.style.height = `${state.area.height}px`;
  inputs.areaX.value = Math.round(state.area.x);
  inputs.areaY.value = Math.round(state.area.y);
  inputs.areaW.value = Math.round(state.area.width);
  inputs.areaH.value = Math.round(state.area.height);
}

function applyPartStyle(part, node = getPartNode(part.id)) {
  if (!node) return;
  node.style.left = `${part.x}px`;
  node.style.top = `${part.y}px`;
  node.style.width = `${part.width}px`;
  node.style.transformOrigin = `${part.pivotX}px ${part.pivotY}px`;
  node.style.transform = `rotate(${part.rotation}deg)`;
  node.style.zIndex = String(part.order || 1);
  node.classList.toggle('hidden-layer', !part.visible);
  const pivot = $('.pivot-cross', node);
  pivot.style.left = `${part.pivotX}px`;
  pivot.style.top = `${part.pivotY}px`;
}

function effectiveRoots() {
  return state.parts.filter(p => !p.parentId || !state.parts.some(x => x.id === p.parentId));
}

function renderParts() {
  stopTest();
  $$('.rig-part', characterArea).forEach(el => el.remove());
  const roots = effectiveRoots().sort((a,b) => a.order - b.order);
  roots.forEach(part => mountPartRecursive(part, characterArea));
  renderLayers();
  refreshParentSelect();
  syncInspector();
}

function mountPartRecursive(part, parentElement) {
  const node = partTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = part.id;
  const img = $('img', node);
  if (part.objectUrl) img.src = part.objectUrl;
  img.alt = part.name;
  parentElement.appendChild(node);
  applyPartStyle(part, node);

  node.addEventListener('pointerdown', onPartPointerDown);
  node.addEventListener('click', onPartClick);

  state.parts
    .filter(child => child.parentId === part.id)
    .sort((a,b) => a.order - b.order)
    .forEach(child => mountPartRecursive(child, node));
}

function renderLayers() {
  layerList.innerHTML = '';
  if (!state.parts.length) {
    layerList.innerHTML = '<div class="layer-empty">パーツ未読込</div>';
    return;
  }

  [...state.parts]
    .sort((a,b) => b.order - a.order)
    .forEach(part => {
      const row = document.createElement('div');
      row.className = `layer-row${part.id === state.selectedId ? ' selected' : ''}`;
      row.dataset.id = part.id;
      row.innerHTML = `
        <button class="layer-eye" type="button" title="表示/非表示">${part.visible ? '👁' : '—'}</button>
        <button class="layer-name" type="button" title="${escapeHtml(part.name)}">${escapeHtml(part.name)}</button>
        <button class="layer-move layer-up" type="button" title="手前へ">↑</button>
        <button class="layer-move layer-down" type="button" title="奥へ">↓</button>
      `;
      $('.layer-eye', row).addEventListener('click', e => {
        e.stopPropagation();
        part.visible = !part.visible;
        const node = getPartNode(part.id);
        if (node) node.classList.toggle('hidden-layer', !part.visible);
        renderLayers();
        markChanged(part.visible ? 'レイヤー表示' : 'レイヤー非表示');
      });
      $('.layer-name', row).addEventListener('click', () => selectPart(part.id));
      $('.layer-up', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, 1); });
      $('.layer-down', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, -1); });
      layerList.appendChild(row);
    });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function moveLayer(id, direction) {
  const ordered = [...state.parts].sort((a,b) => a.order - b.order);
  const i = ordered.findIndex(p => p.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  const a = ordered[i], b = ordered[j];
  const temp = a.order; a.order = b.order; b.order = temp;
  normalizeOrders();
  renderParts();
  markChanged(direction > 0 ? 'レイヤーを手前へ' : 'レイヤーを奥へ');
}

function normalizeOrders() {
  [...state.parts].sort((a,b) => a.order - b.order).forEach((p,i) => p.order = i + 1);
}

function refreshParentSelect() {
  parentSelect.innerHTML = '<option value="">なし（character-area基準）</option>';
  const selected = selectedPart();
  state.parts.forEach(part => {
    if (!selected || part.id === selected.id) return;
    if (isDescendant(part.id, selected.id)) return;
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = part.name;
    parentSelect.appendChild(option);
  });
  parentSelect.value = selected?.parentId || '';
}

function isDescendant(candidateId, ancestorId) {
  let current = state.parts.find(p => p.id === candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = state.parts.find(p => p.id === current.parentId);
  }
  return false;
}

function syncInspector() {
  const part = selectedPart();
  const disabled = !part;
  const locked = state.pivotMode;
  ['partX','partY','partW','partRot'].forEach(key => inputs[key].disabled = disabled || locked);
  ['pivotX','pivotY'].forEach(key => inputs[key].disabled = disabled);
  parentSelect.disabled = disabled || locked;
  ['areaX','areaY','areaW','areaH'].forEach(key => inputs[key].disabled = locked);
  document.body.classList.toggle('pivot-mode', state.pivotMode);
  $$('.rotate-btn', controlPanel).forEach(b => b.disabled = disabled || locked);
  $$('.nudge-btn', controlPanel).forEach(b => b.disabled = disabled);
  controlModeText.textContent = state.pivotMode ? 'ピボット移動 1px' : 'パーツ移動 1px / 回転 1°';

  if (!part) {
    selectedCoord.textContent = '未選択';
    selectedName.textContent = 'レイヤーから選択';
    return;
  }
  inputs.partX.value = Math.round(part.x);
  inputs.partY.value = Math.round(part.y);
  inputs.partW.value = Math.round(part.width);
  inputs.partRot.value = Math.round(part.rotation);
  inputs.pivotX.value = Math.round(part.pivotX);
  inputs.pivotY.value = Math.round(part.pivotY);
  parentSelect.value = part.parentId || '';
  selectedCoord.textContent = `X ${Math.round(part.x)} / Y ${Math.round(part.y)}`;
  selectedName.textContent = part.name;
}

function selectPart(id) {
  if (!id || !state.parts.some(p => p.id === id)) return;
  stopTest();
  state.selectedId = id;
  renderLayers();
  refreshParentSelect();
  syncInspector();
}

function onPartClick(event) {
  event.stopPropagation();
  const node = event.currentTarget;
  selectPart(node.dataset.id);
  if (state.pivotMode) setPivotFromPointer(event, node);
}

function onPartPointerDown(event) {
  event.stopPropagation();
  const node = event.currentTarget;
  const id = node.dataset.id;
  selectPart(id);
  if (state.pivotMode || state.testAnimation) return;

  event.preventDefault();
  const part = selectedPart();
  if (!part) return;
  const sx = event.clientX, sy = event.clientY;
  const ox = part.x, oy = part.y;
  node.setPointerCapture?.(event.pointerId);

  const move = e => {
    const parentRect = node.parentElement.getBoundingClientRect();
    const scale = node.parentElement.offsetWidth ? parentRect.width / node.parentElement.offsetWidth : 1;
    part.x = ox + (e.clientX - sx) / (scale || 1);
    part.y = oy + (e.clientY - sy) / (scale || 1);
    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0;
      node.style.left = `${part.x}px`;
      node.style.top = `${part.y}px`;
      syncInspector();
      markChanged();
    });
  };
  const up = () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
}

function setPivotFromPointer(event, node) {
  const part = selectedPart();
  if (!part) return;
  const rect = node.getBoundingClientRect();
  const scale = rect.width / part.width || 1;
  part.pivotX = (event.clientX - rect.left) / scale;
  part.pivotY = (event.clientY - rect.top) / scale;
  applyPartStyle(part, node);
  syncInspector();
  markChanged('ピボット変更');
}

function nudgeSelected(dx, dy) {
  const part = selectedPart();
  if (!part || state.testAnimation) return;
  const node = getPartNode(part.id);
  if (state.pivotMode) {
    part.pivotX += dx;
    part.pivotY += dy;
    applyPartStyle(part, node);
    syncInspector();
    markChanged('ピボットを1px移動');
    return;
  }
  part.x += dx; part.y += dy;
  if (node) { node.style.left = `${part.x}px`; node.style.top = `${part.y}px`; }
  syncInspector();
  markChanged('1px移動');
}

function rotateSelected(delta) {
  const part = selectedPart();
  if (!part || state.pivotMode || state.testAnimation) return;
  part.rotation += delta;
  applyPartStyle(part);
  syncInspector();
  markChanged(`${delta > 0 ? '+' : ''}${delta}°回転`);
}

$$('.nudge-btn', controlPanel).forEach(button => {
  button.addEventListener('click', () => nudgeSelected(Number(button.dataset.dx), Number(button.dataset.dy)));
});
$$('.rotate-btn', controlPanel).forEach(button => {
  button.addEventListener('click', () => rotateSelected(Number(button.dataset.rotate)));
});

characterArea.addEventListener('pointerdown', event => {
  if (event.target !== characterArea && !event.target.classList.contains('character-area-label')) return;
  if (state.pivotMode || state.testAnimation) return;
  event.preventDefault();
  const sx = event.clientX, sy = event.clientY;
  const ox = state.area.x, oy = state.area.y;
  characterArea.setPointerCapture?.(event.pointerId);
  const move = e => {
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / state.stage.width || 1;
    state.area.x = ox + (e.clientX - sx) / scale;
    state.area.y = oy + (e.clientY - sy) / scale;
    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => { state.dragRaf = 0; syncArea(); markChanged(); });
  };
  const up = () => {
    characterArea.removeEventListener('pointermove', move);
    characterArea.removeEventListener('pointerup', up);
    characterArea.removeEventListener('pointercancel', up);
  };
  characterArea.addEventListener('pointermove', move);
  characterArea.addEventListener('pointerup', up);
  characterArea.addEventListener('pointercancel', up);
});

backgroundInput.addEventListener('change', () => {
  const file = backgroundInput.files?.[0];
  if (!file) return;
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.backgroundUrl = URL.createObjectURL(file);
  backgroundImage.src = state.backgroundUrl;
  backgroundImage.hidden = false;
  stageEmpty.hidden = true;
  backgroundInput.value = '';
  markChanged('下地表示中');
});

partInput.addEventListener('change', async () => {
  const files = [...(partInput.files || [])];
  if (!files.length) return;
  for (const file of files) {
    const objectUrl = URL.createObjectURL(file);
    const natural = await getImageSize(objectUrl);
    const part = {
      id: uid(),
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      objectUrl,
      naturalWidth: natural.width,
      naturalHeight: natural.height,
      x: 10,
      y: 10,
      width: natural.width,
      rotation: 0,
      pivotX: Math.round(natural.width / 2),
      pivotY: Math.round(natural.height / 2),
      parentId: '',
      visible: true,
      order: state.parts.length + 1
    };
    state.parts.push(part);
    state.selectedId = part.id;
  }
  partInput.value = '';
  renderParts();
  markChanged(`${files.length}パーツ追加（実寸）`);
});

function getImageSize(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 100, height: img.naturalHeight || 100 });
    img.onerror = () => resolve({ width: 100, height: 100 });
    img.src = url;
  });
}

$('#togglePivotBtn').addEventListener('click', event => {
  stopTest();
  state.pivotMode = !state.pivotMode;
  event.currentTarget.classList.toggle('active', state.pivotMode);
  event.currentTarget.textContent = state.pivotMode ? 'ピボット設定中' : 'ピボット設定';
  $('#pivotModeHint').textContent = state.pivotMode
    ? 'パーツ本体は固定中です。画像上を押すか、操作盤の十字キーでピボットだけを動かせます。'
    : 'ピボット設定中はパーツ本体を固定し、十字マークだけを動かします。';
  syncInspector();
});

$('#applyStageSizeBtn').addEventListener('click', () => {
  state.stage.width = Math.max(240, int(inputs.stageWidth.value, 390));
  state.stage.height = Math.max(320, int(inputs.stageHeight.value, 844));
  syncStage(); markChanged('画面サイズ変更');
});

parentSelect.addEventListener('change', () => {
  const part = selectedPart();
  if (!part || state.pivotMode) return;
  part.parentId = parentSelect.value;
  renderParts();
  markChanged('親子関係変更');
});

$('#deletePartBtn').addEventListener('click', () => {
  const part = selectedPart();
  if (!part) return;
  stopTest();
  state.parts.forEach(p => { if (p.parentId === part.id) p.parentId = ''; });
  if (part.objectUrl) URL.revokeObjectURL(part.objectUrl);
  state.parts = state.parts.filter(p => p.id !== part.id);
  normalizeOrders();
  state.selectedId = state.parts.at(-1)?.id || null;
  renderParts();
  markChanged('レイヤー削除');
});

// ---- 専用テンキー ----
let numpadTarget = null;
let numpadValue = '';
const numpadBackdrop = $('#numpadBackdrop');
const numpadDisplay = $('#numpadDisplay');
const numpadLabel = $('#numpadLabel');

$$('.numeric-input').forEach(input => {
  input.addEventListener('pointerdown', e => {
    if (input.disabled) return;
    e.preventDefault();
    openNumpad(input);
  });
  input.addEventListener('focus', () => input.blur());
});

function openNumpad(input) {
  numpadTarget = input;
  numpadValue = String(input.value ?? '0');
  numpadDisplay.textContent = numpadValue || '0';
  const labelText = input.closest('label')?.childNodes?.[0]?.textContent?.trim() || '数値';
  numpadLabel.textContent = labelText;
  numpadBackdrop.hidden = false;
}
function closeNumpad() {
  numpadBackdrop.hidden = true;
  numpadTarget = null;
}
$$('[data-key]', $('#numpad')).forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.key;
    if (/^\d$/.test(key)) {
      if (numpadValue === '0') numpadValue = key;
      else if (numpadValue === '-0') numpadValue = `-${key}`;
      else numpadValue += key;
    } else if (key === 'back') {
      numpadValue = numpadValue.slice(0, -1) || '0';
    } else if (key === 'sign') {
      numpadValue = numpadValue.startsWith('-') ? numpadValue.slice(1) : `-${numpadValue || '0'}`;
    }
    numpadDisplay.textContent = numpadValue || '0';
  });
});
$('#numpadClearBtn').addEventListener('click', () => { numpadValue = '0'; numpadDisplay.textContent = '0'; });
$('#numpadCancelBtn').addEventListener('click', closeNumpad);
$('#numpadOkBtn').addEventListener('click', () => {
  if (!numpadTarget) return closeNumpad();
  numpadTarget.value = String(int(numpadValue, 0));
  applyNumericInput(numpadTarget.id);
  closeNumpad();
});
numpadBackdrop.addEventListener('pointerdown', e => { if (e.target === numpadBackdrop) closeNumpad(); });

function applyNumericInput(id) {
  const v = int(inputs[id]?.value, 0);
  if (id === 'stageWidth' || id === 'stageHeight' || id === 'testAmplitude' || id === 'testDuration') return;
  if (id.startsWith('area')) {
    if (state.pivotMode) return;
    state.area.x = id === 'areaX' ? v : state.area.x;
    state.area.y = id === 'areaY' ? v : state.area.y;
    state.area.width = id === 'areaW' ? Math.max(40, v) : state.area.width;
    state.area.height = id === 'areaH' ? Math.max(40, v) : state.area.height;
    syncArea(); markChanged(); return;
  }
  const part = selectedPart();
  if (!part) return;
  const map = { partX:'x', partY:'y', partW:'width', partRot:'rotation', pivotX:'pivotX', pivotY:'pivotY' };
  const key = map[id];
  if (!key) return;
  if (state.pivotMode && !['pivotX','pivotY'].includes(key)) return;
  part[key] = key === 'width' ? Math.max(1, v) : v;
  applyPartStyle(part); syncInspector(); markChanged();
}

// ---- ドラッグ可能フローティングパネル ----
[controlPanel, layerPanel].forEach(makePanelDraggable);
function makePanelDraggable(panel) {
  const handle = $('.panel-drag-handle', panel);
  const saved = loadPanelPosition(panel.dataset.panel);
  if (saved) {
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  }
  handle.addEventListener('pointerdown', event => {
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const dy = event.clientY - rect.top;
    handle.setPointerCapture?.(event.pointerId);
    const move = e => {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      const left = Math.max(0, Math.min(maxLeft, e.clientX - dx));
      const top = Math.max(0, Math.min(maxTop, e.clientY - dy));
      panel.style.left = `${left}px`; panel.style.top = `${top}px`;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const r = panel.getBoundingClientRect();
      localStorage.setItem(`rig-panel-${panel.dataset.panel}`, JSON.stringify({ left:r.left, top:r.top }));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}
function loadPanelPosition(name) {
  try { return JSON.parse(localStorage.getItem(`rig-panel-${name}`) || 'null'); } catch { return null; }
}

// ---- 試運転 ----
function startTest() {
  stopTest();
  const part = selectedPart();
  if (!part || !part.visible) { testStatus.textContent = 'レイヤーを選択'; return; }
  if (state.pivotMode) { testStatus.textContent = 'ピボット設定を終了'; return; }
  const node = getPartNode(part.id);
  if (!node) return;
  const amplitude = Math.max(1, Math.abs(int(inputs.testAmplitude.value, 15)));
  const duration = Math.max(200, Math.abs(int(inputs.testDuration.value, 1200)));
  const base = part.rotation;
  state.testPartId = part.id;
  state.testAnimation = node.animate([
    { transform: `rotate(${base - amplitude}deg)` },
    { transform: `rotate(${base + amplitude}deg)` }
  ], {
    duration: duration / 2,
    direction: 'alternate',
    iterations: Infinity,
    easing: 'ease-in-out'
  });
  document.body.classList.add('test-running');
  testStatus.textContent = `${part.name} 再生中`;
  $('#testRunBtn').classList.add('active');
  $('#testRunBtn').textContent = '試運転停止';
}
function stopTest() {
  if (state.testAnimation) state.testAnimation.cancel();
  state.testAnimation = null;
  if (state.testPartId) {
    const p = state.parts.find(x => x.id === state.testPartId);
    if (p) applyPartStyle(p);
  }
  state.testPartId = null;
  document.body.classList.remove('test-running');
  testStatus.textContent = '停止中';
  $('#testRunBtn').classList.remove('active');
  $('#testRunBtn').textContent = '試運転';
}
$('#startTestBtn').addEventListener('click', startTest);
$('#stopTestBtn').addEventListener('click', stopTest);
$('#testRunBtn').addEventListener('click', () => state.testAnimation ? stopTest() : startTest());

function exportData() {
  return {
    stage: { ...state.stage },
    characterArea: { ...state.area },
    parts: [...state.parts].sort((a,b) => a.order - b.order).map(p => ({
      id: p.id,
      name: p.name,
      fileName: p.fileName,
      x: Math.round(p.x),
      y: Math.round(p.y),
      width: Math.round(p.width),
      naturalWidth: p.naturalWidth,
      naturalHeight: p.naturalHeight,
      rotation: Math.round(p.rotation),
      pivotX: Math.round(p.pivotX),
      pivotY: Math.round(p.pivotY),
      parentId: p.parentId,
      visible: p.visible,
      order: p.order
    }))
  };
}
function jsonText() { return JSON.stringify(exportData(), null, 2); }
$('#previewJsonBtn').addEventListener('click', () => { jsonPreview.value = jsonText(); statusText.textContent = '座標表示済み'; });
$('#copyJsonBtn').addEventListener('click', async () => {
  const text = jsonText(); jsonPreview.value = text;
  try { await navigator.clipboard.writeText(text); }
  catch { jsonPreview.select(); document.execCommand('copy'); }
  statusText.textContent = '座標コピー済み';
});
$('#downloadJsonBtn').addEventListener('click', () => {
  const blob = new Blob([jsonText()], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'character-coordinates.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  statusText.textContent = '座標保存済み';
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('配置を初期化しますか？')) return;
  stopTest();
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.parts.forEach(p => p.objectUrl && URL.revokeObjectURL(p.objectUrl));
  state.stage = { width:390, height:844 };
  state.area = { x:12, y:18, width:160, height:220 };
  state.parts = []; state.selectedId = null; state.pivotMode = false; state.backgroundUrl = '';
  backgroundImage.hidden = true; backgroundImage.removeAttribute('src'); stageEmpty.hidden = false;
  jsonPreview.value = '';
  $('#togglePivotBtn').classList.remove('active'); $('#togglePivotBtn').textContent = 'ピボット設定';
  syncStage(); syncArea(); renderParts(); markChanged('初期化済み');
});

$('#fitBtn').addEventListener('click', () => {
  const wrap = $('.stage-wrap');
  wrap.scrollTo({ left:Math.max(0,(stage.offsetWidth-wrap.clientWidth)/2), top:0, behavior:'smooth' });
});

window.addEventListener('resize', () => {
  [controlPanel, layerPanel].forEach(panel => {
    const r = panel.getBoundingClientRect();
    if (r.right > innerWidth) panel.style.left = `${Math.max(0, innerWidth - panel.offsetWidth)}px`;
    if (r.bottom > innerHeight) panel.style.top = `${Math.max(0, innerHeight - panel.offsetHeight)}px`;
  });
});
window.addEventListener('beforeunload', () => {
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.parts.forEach(p => p.objectUrl && URL.revokeObjectURL(p.objectUrl));
});

syncStage(); syncArea(); renderParts();
