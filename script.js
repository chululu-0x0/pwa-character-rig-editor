const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stage = $('#stage');
const stageEmpty = $('#stageEmpty');
const backgroundInput = $('#backgroundInput');
const backgroundImage = $('#backgroundImage');
const partInput = $('#partInput');
const importJsonInput = $('#importJsonInput');
const partTemplate = $('#partTemplate');
const characterArea = $('#characterArea');
const parentSelect = $('#parentSelect');
const layerList = $('#layerList');
const hierarchyTree = $('#hierarchyTree');
const controlPanel = $('#controlPanel');
const layerPanel = $('#layerPanel');
const hierarchyPanel = $('#hierarchyPanel');
const statusText = $('#statusText');
const testStatus = $('#testStatus');
const jsonPreview = $('#jsonPreview');
const selectedCoord = $('#selectedCoord');
const selectedName = $('#selectedName');
const controlModeText = $('#controlModeText');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');

const state = {
  stage: { width: 390, height: 844 },
  area: { x: 12, y: 18, width: 160, height: 220 },
  parts: [],
  selectedId: null,
  pivotMode: false,
  backgroundUrl: '',
  dragRaf: 0,
  testRaf: 0,
  testStart: 0,
  testRunning: false,
  liveObjectUrls: new Set(),
  undoStack: [],
  redoStack: []
};

const inputs = {
  stageWidth: $('#stageWidth'), stageHeight: $('#stageHeight'),
  areaX: $('#areaX'), areaY: $('#areaY'), areaW: $('#areaW'), areaH: $('#areaH'),
  partX: $('#partX'), partY: $('#partY'), partW: $('#partW'), partRot: $('#partRot'),
  pivotX: $('#pivotX'), pivotY: $('#pivotY'),
  testAmplitude: $('#testAmplitude'), testDuration: $('#testDuration'),
  testChildScale: $('#testChildScale'), testDelay: $('#testDelay')
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
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function degToRad(deg) { return deg * Math.PI / 180; }
function radToDeg(rad) { return rad * 180 / Math.PI; }
function selectedPart() { return state.parts.find(p => p.id === state.selectedId) || null; }
function partById(id) { return state.parts.find(p => p.id === id) || null; }
function getPartNode(id) {
  return characterArea.querySelector(`.rig-part[data-id="${CSS.escape(id)}"]`);
}
function markChanged(text = '変更あり') { statusText.textContent = text; }
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ---------- 2D affine matrices ----------
function identity() { return { a:1, b:0, c:0, d:1, e:0, f:0 }; }
function multiply(m1, m2) {
  return {
    a: m1.a*m2.a + m1.c*m2.b,
    b: m1.b*m2.a + m1.d*m2.b,
    c: m1.a*m2.c + m1.c*m2.d,
    d: m1.b*m2.c + m1.d*m2.d,
    e: m1.a*m2.e + m1.c*m2.f + m1.e,
    f: m1.b*m2.e + m1.d*m2.f + m1.f
  };
}
function inverse(m) {
  const det = m.a*m.d - m.b*m.c;
  if (Math.abs(det) < 1e-8) return identity();
  return {
    a: m.d/det,
    b: -m.b/det,
    c: -m.c/det,
    d: m.a/det,
    e: (m.c*m.f - m.d*m.e)/det,
    f: (m.b*m.e - m.a*m.f)/det
  };
}
function translate(x,y) { return { a:1,b:0,c:0,d:1,e:x,f:y }; }
function rotate(deg) {
  const r = degToRad(deg), cs = Math.cos(r), sn = Math.sin(r);
  return { a:cs,b:sn,c:-sn,d:cs,e:0,f:0 };
}
function transformPoint(m, x, y) {
  return { x:m.a*x + m.c*y + m.e, y:m.b*x + m.d*y + m.f };
}
function localMatrix(part, rotationOffset = 0) {
  const r = part.rotation + rotationOffset;
  return multiply(
    translate(part.x, part.y),
    multiply(translate(part.pivotX, part.pivotY), multiply(rotate(r), translate(-part.pivotX, -part.pivotY)))
  );
}
function worldMatrix(part, offsets = null, cache = new Map()) {
  if (!part) return identity();
  if (cache.has(part.id)) return cache.get(part.id);
  const offset = offsets?.get(part.id) || 0;
  const local = localMatrix(part, offset);
  const parent = part.parentId ? partById(part.parentId) : null;
  const result = parent ? multiply(worldMatrix(parent, offsets, cache), local) : local;
  cache.set(part.id, result);
  return result;
}
function decomposeLocalMatrixIntoPart(part, m) {
  const rotation = radToDeg(Math.atan2(m.b, m.a));
  const rpX = m.a * part.pivotX + m.c * part.pivotY;
  const rpY = m.b * part.pivotX + m.d * part.pivotY;
  part.rotation = rotation;
  part.x = m.e - part.pivotX + rpX;
  part.y = m.f - part.pivotY + rpY;
}

// ---------- history ----------
function snapshot() {
  return {
    stage: { ...state.stage },
    area: { ...state.area },
    parts: state.parts.map(p => ({ ...p })),
    selectedId: state.selectedId
  };
}
function restoreSnapshot(snap) {
  stopTest();
  state.stage = { ...snap.stage };
  state.area = { ...snap.area };
  state.parts = snap.parts.map(p => ({ ...p }));
  state.selectedId = snap.selectedId && state.parts.some(p => p.id === snap.selectedId) ? snap.selectedId : (state.parts.at(-1)?.id || null);
  syncStage(); syncArea(); renderParts(); updateHistoryButtons();
}
function pushHistory() {
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 80) state.undoStack.shift();
  state.redoStack.length = 0;
  updateHistoryButtons();
}
function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshot());
  restoreSnapshot(state.undoStack.pop());
  markChanged('一つ前に戻しました');
}
function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshot());
  restoreSnapshot(state.redoStack.pop());
  markChanged('一つ先へ進みました');
}
function updateHistoryButtons() {
  undoBtn.disabled = !state.undoStack.length;
  redoBtn.disabled = !state.redoStack.length;
}
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ---------- stage / area ----------
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

// ---------- rendering ----------
function applyPartStyle(part, node = getPartNode(part.id), offsets = null, cache = new Map()) {
  if (!node) return;
  const m = worldMatrix(part, offsets, cache);
  node.style.width = `${part.width}px`;
  node.style.transformOrigin = '0 0';
  node.style.transform = `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
  node.style.zIndex = String(part.order || 1);
  node.classList.toggle('hidden-layer', !part.visible);
  const pivot = $('.pivot-cross', node);
  pivot.style.left = `${part.pivotX}px`;
  pivot.style.top = `${part.pivotY}px`;
}
function applyAllPartStyles(offsets = null) {
  const cache = new Map();
  state.parts.forEach(part => applyPartStyle(part, getPartNode(part.id), offsets, cache));
}
function renderParts() {
  stopTest();
  $$('.rig-part', characterArea).forEach(el => el.remove());
  [...state.parts].sort((a,b) => a.order - b.order).forEach(part => {
    const node = partTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = part.id;
    const img = $('img', node);
    if (part.objectUrl) img.src = part.objectUrl;
    img.alt = part.name;
    characterArea.appendChild(node);
    node.addEventListener('pointerdown', onPartPointerDown);
    node.addEventListener('click', onPartClick);
    const cross = $('.pivot-cross', node);
    cross.addEventListener('pointerdown', onPivotPointerDown);
  });
  applyAllPartStyles();
  renderLayers();
  renderHierarchy();
  refreshParentSelect();
  syncInspector();
}

// ---------- flat layer panel ----------
function renderLayers() {
  layerList.innerHTML = '';
  if (!state.parts.length) {
    layerList.innerHTML = '<div class="layer-empty">パーツ未読込</div>';
    return;
  }
  [...state.parts].sort((a,b) => b.order - a.order).forEach(part => {
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
      e.stopPropagation(); pushHistory();
      part.visible = !part.visible;
      applyPartStyle(part);
      renderLayers();
      markChanged(part.visible ? 'レイヤー表示' : 'レイヤー非表示');
    });
    $('.layer-name', row).addEventListener('click', () => selectPart(part.id));
    $('.layer-up', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, 1); });
    $('.layer-down', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, -1); });
    layerList.appendChild(row);
  });
}
function moveLayer(id, direction) {
  const ordered = [...state.parts].sort((a,b) => a.order - b.order);
  const i = ordered.findIndex(p => p.id === id), j = i + direction;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  pushHistory();
  const a = ordered[i], b = ordered[j];
  [a.order, b.order] = [b.order, a.order];
  normalizeOrders();
  applyAllPartStyles(); renderLayers();
  markChanged(direction > 0 ? 'レイヤーを手前へ' : 'レイヤーを奥へ');
}
function normalizeOrders() {
  [...state.parts].sort((a,b) => a.order - b.order).forEach((p,i) => p.order = i + 1);
}

// ---------- hierarchy tree ----------
function renderHierarchy() {
  hierarchyTree.innerHTML = '';
  if (!state.parts.length) {
    hierarchyTree.innerHTML = '<div class="tree-empty">パーツ未読込</div>';
    return;
  }
  const roots = state.parts.filter(p => !p.parentId || !partById(p.parentId));
  roots.sort((a,b) => a.name.localeCompare(b.name, 'ja'));
  const addBranch = (part, depth) => {
    const row = document.createElement('div');
    row.className = `tree-row${depth === 0 ? ' root' : ''}${part.id === state.selectedId ? ' selected' : ''}`;
    row.style.paddingLeft = `${5 + depth * 15}px`;
    for (let d = 1; d <= depth; d++) {
      const line = document.createElement('span');
      line.className = 'tree-depth-line';
      line.style.left = `${7 + d * 15}px`;
      row.appendChild(line);
    }
    const btn = document.createElement('button');
    btn.className = 'tree-select';
    btn.type = 'button';
    btn.textContent = part.name;
    btn.title = part.name;
    btn.addEventListener('click', () => selectPart(part.id));
    row.appendChild(btn);
    hierarchyTree.appendChild(row);
    state.parts.filter(p => p.parentId === part.id)
      .sort((a,b) => a.name.localeCompare(b.name, 'ja'))
      .forEach(child => addBranch(child, depth + 1));
  };
  roots.forEach(root => addBranch(root, 0));
}
function refreshParentSelect() {
  parentSelect.innerHTML = '<option value="">なし（character-area）</option>';
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
  let current = partById(candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = partById(current.parentId);
  }
  return false;
}
function reparentPreserveWorld(part, newParentId) {
  const before = worldMatrix(part);
  const parentWorld = newParentId ? worldMatrix(partById(newParentId)) : identity();
  const newLocal = multiply(inverse(parentWorld), before);
  part.parentId = newParentId || '';
  decomposeLocalMatrixIntoPart(part, newLocal);
}
parentSelect.addEventListener('change', () => {
  const part = selectedPart();
  if (!part || state.pivotMode || state.testRunning) return;
  const newParentId = parentSelect.value;
  if (newParentId === part.parentId) return;
  pushHistory();
  reparentPreserveWorld(part, newParentId);
  applyAllPartStyles(); renderHierarchy(); refreshParentSelect(); syncInspector();
  markChanged('親子関係変更（見た目位置を維持）');
});

// ---------- inspector / selection ----------
function syncInspector() {
  const part = selectedPart();
  const disabled = !part;
  const locked = state.pivotMode || state.testRunning;
  ['partX','partY','partW','partRot'].forEach(key => inputs[key].disabled = disabled || locked);
  ['pivotX','pivotY'].forEach(key => inputs[key].disabled = disabled || state.testRunning);
  parentSelect.disabled = disabled || locked;
  ['areaX','areaY','areaW','areaH'].forEach(key => inputs[key].disabled = state.pivotMode || state.testRunning);
  document.body.classList.toggle('pivot-mode', state.pivotMode);
  $$('.rotate-btn', controlPanel).forEach(b => b.disabled = disabled || locked);
  $$('.nudge-btn', controlPanel).forEach(b => b.disabled = disabled || state.testRunning);
  controlModeText.textContent = state.pivotMode ? 'ピボット移動 1px / 十字を直接ドラッグ可' : 'パーツ移動 1px / 回転 1°';

  if (!part) {
    selectedCoord.textContent = '未選択';
    selectedName.textContent = 'レイヤー / 親子ツリーから選択';
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
  if (!id || !partById(id)) return;
  stopTest();
  state.selectedId = id;
  renderLayers(); renderHierarchy(); refreshParentSelect(); syncInspector();
}

// ---------- part drag ----------
function areaScale() {
  const rect = characterArea.getBoundingClientRect();
  return characterArea.offsetWidth ? rect.width / characterArea.offsetWidth : 1;
}
function pointerToArea(clientX, clientY) {
  const rect = characterArea.getBoundingClientRect();
  const scale = areaScale() || 1;
  return { x:(clientX - rect.left)/scale, y:(clientY - rect.top)/scale };
}
function onPartClick(event) {
  event.stopPropagation();
  const node = event.currentTarget;
  selectPart(node.dataset.id);
  if (state.pivotMode && !event.target.classList.contains('pivot-cross')) {
    const p = pointerToArea(event.clientX, event.clientY);
    const part = selectedPart();
    const localPoint = transformPoint(inverse(worldMatrix(part)), p.x, p.y);
    pushHistory();
    setPivotPreservePose(part, localPoint.x, localPoint.y);
    applyAllPartStyles(); syncInspector();
    markChanged('ピボット変更');
  }
}
function onPartPointerDown(event) {
  if (event.target.classList.contains('pivot-cross')) return;
  event.stopPropagation();
  const node = event.currentTarget;
  const id = node.dataset.id;
  selectPart(id);
  if (state.pivotMode || state.testRunning) return;
  event.preventDefault();
  const part = selectedPart();
  if (!part) return;
  pushHistory();
  const sx = event.clientX, sy = event.clientY;
  const ox = part.x, oy = part.y;
  const parent = part.parentId ? partById(part.parentId) : null;
  const parentWorld = parent ? worldMatrix(parent) : identity();
  const invParent = inverse(parentWorld);
  const startArea = pointerToArea(sx, sy);
  const startLocal = transformPoint(invParent, startArea.x, startArea.y);
  node.setPointerCapture?.(event.pointerId);

  const move = e => {
    const areaPoint = pointerToArea(e.clientX, e.clientY);
    const localPoint = transformPoint(invParent, areaPoint.x, areaPoint.y);
    part.x = ox + (localPoint.x - startLocal.x);
    part.y = oy + (localPoint.y - startLocal.y);
    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0;
      applyAllPartStyles(); syncInspector(); markChanged();
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

// ---------- pivot: preserve image pose ----------
function setPivotPreservePose(part, newPivotX, newPivotY) {
  const oldLocal = localMatrix(part);
  part.pivotX = newPivotX;
  part.pivotY = newPivotY;
  const r = rotate(part.rotation);
  const rpX = r.a * part.pivotX + r.c * part.pivotY;
  const rpY = r.b * part.pivotX + r.d * part.pivotY;
  part.x = oldLocal.e - part.pivotX + rpX;
  part.y = oldLocal.f - part.pivotY + rpY;
}
function onPivotPointerDown(event) {
  if (!state.pivotMode || state.testRunning) return;
  event.preventDefault(); event.stopPropagation();
  const node = event.currentTarget.closest('.rig-part');
  const part = partById(node?.dataset.id);
  if (!part) return;
  selectPart(part.id);
  pushHistory();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const movePivot = e => {
    const p = pointerToArea(e.clientX, e.clientY);
    const localPoint = transformPoint(inverse(worldMatrix(part)), p.x, p.y);
    setPivotPreservePose(part, localPoint.x, localPoint.y);
    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0; applyAllPartStyles(); syncInspector(); markChanged('ピボットを直接移動');
    });
  };
  const end = () => {
    event.currentTarget.removeEventListener('pointermove', movePivot);
    event.currentTarget.removeEventListener('pointerup', end);
    event.currentTarget.removeEventListener('pointercancel', end);
  };
  event.currentTarget.addEventListener('pointermove', movePivot);
  event.currentTarget.addEventListener('pointerup', end);
  event.currentTarget.addEventListener('pointercancel', end);
}

function nudgeSelected(dx, dy) {
  const part = selectedPart();
  if (!part || state.testRunning) return;
  pushHistory();
  if (state.pivotMode) {
    setPivotPreservePose(part, part.pivotX + dx, part.pivotY + dy);
    applyAllPartStyles(); syncInspector(); markChanged('ピボットを1px移動'); return;
  }
  part.x += dx; part.y += dy;
  applyAllPartStyles(); syncInspector(); markChanged('1px移動');
}
function rotateSelected(delta) {
  const part = selectedPart();
  if (!part || state.pivotMode || state.testRunning) return;
  pushHistory();
  part.rotation += delta;
  applyAllPartStyles(); syncInspector(); markChanged(`${delta > 0 ? '+' : ''}${delta}°回転`);
}
$$('.nudge-btn', controlPanel).forEach(button => button.addEventListener('click', () => nudgeSelected(Number(button.dataset.dx), Number(button.dataset.dy))));
$$('.rotate-btn', controlPanel).forEach(button => button.addEventListener('click', () => rotateSelected(Number(button.dataset.rotate))));

// ---------- character-area drag ----------
characterArea.addEventListener('pointerdown', event => {
  if (event.target !== characterArea && !event.target.classList.contains('character-area-label')) return;
  if (state.pivotMode || state.testRunning) return;
  event.preventDefault(); pushHistory();
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

// ---------- file loading ----------
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
  pushHistory();
  for (const file of files) {
    const objectUrl = URL.createObjectURL(file);
    state.liveObjectUrls.add(objectUrl);
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

// ---------- pivot mode ----------
$('#togglePivotBtn').addEventListener('click', event => {
  stopTest();
  state.pivotMode = !state.pivotMode;
  event.currentTarget.classList.toggle('active', state.pivotMode);
  event.currentTarget.textContent = state.pivotMode ? 'ピボット設定中' : 'ピボット設定';
  $('#pivotModeHint').textContent = state.pivotMode
    ? '画像位置は固定中。十字を直接ドラッグ・画像上をクリック・操作盤の十字キーでピボットだけを動かせます。'
    : 'ピボット設定中は画像位置を固定したまま、十字だけを移動できます。';
  syncInspector();
});

$('#applyStageSizeBtn').addEventListener('click', () => {
  pushHistory();
  state.stage.width = Math.max(240, int(inputs.stageWidth.value, 390));
  state.stage.height = Math.max(320, int(inputs.stageHeight.value, 844));
  syncStage(); markChanged('画面サイズ変更');
});

$('#deletePartBtn').addEventListener('click', () => {
  const part = selectedPart();
  if (!part) return;
  stopTest(); pushHistory();
  // Children keep their current world pose when detached to root.
  const children = state.parts.filter(p => p.parentId === part.id);
  children.forEach(child => reparentPreserveWorld(child, ''));
  state.parts = state.parts.filter(p => p.id !== part.id);
  normalizeOrders();
  state.selectedId = state.parts.at(-1)?.id || null;
  renderParts(); markChanged('パーツ削除');
});

// ---------- numpad ----------
let numpadTarget = null;
let numpadValue = '';
const numpadBackdrop = $('#numpadBackdrop');
const numpadDisplay = $('#numpadDisplay');
const numpadLabel = $('#numpadLabel');
$$('.numeric-input').forEach(input => {
  input.addEventListener('pointerdown', e => {
    if (input.disabled) return;
    e.preventDefault(); openNumpad(input);
  });
  input.addEventListener('focus', () => input.blur());
});
function openNumpad(input) {
  numpadTarget = input;
  numpadValue = String(input.value ?? '0');
  numpadDisplay.textContent = numpadValue || '0';
  numpadLabel.textContent = input.closest('label')?.childNodes?.[0]?.textContent?.trim() || '数値';
  numpadBackdrop.hidden = false;
}
function closeNumpad() { numpadBackdrop.hidden = true; numpadTarget = null; }
$$('[data-key]', $('#numpad')).forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.key;
    if (/^\d$/.test(key)) {
      if (numpadValue === '0') numpadValue = key;
      else if (numpadValue === '-0') numpadValue = `-${key}`;
      else numpadValue += key;
    } else if (key === 'back') numpadValue = numpadValue.slice(0, -1) || '0';
    else if (key === 'sign') numpadValue = numpadValue.startsWith('-') ? numpadValue.slice(1) : `-${numpadValue || '0'}`;
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
  if (['testAmplitude','testDuration','testChildScale','testDelay'].includes(id)) return;
  if (id === 'stageWidth' || id === 'stageHeight') return;
  if (id.startsWith('area')) {
    if (state.pivotMode || state.testRunning) return;
    pushHistory();
    state.area.x = id === 'areaX' ? v : state.area.x;
    state.area.y = id === 'areaY' ? v : state.area.y;
    state.area.width = id === 'areaW' ? Math.max(40, v) : state.area.width;
    state.area.height = id === 'areaH' ? Math.max(40, v) : state.area.height;
    syncArea(); markChanged(); return;
  }
  const part = selectedPart();
  if (!part || state.testRunning) return;
  const map = { partX:'x', partY:'y', partW:'width', partRot:'rotation', pivotX:'pivotX', pivotY:'pivotY' };
  const key = map[id];
  if (!key) return;
  if (state.pivotMode && !['pivotX','pivotY'].includes(key)) return;
  pushHistory();
  if (key === 'pivotX') setPivotPreservePose(part, v, part.pivotY);
  else if (key === 'pivotY') setPivotPreservePose(part, part.pivotX, v);
  else part[key] = key === 'width' ? Math.max(1, v) : v;
  applyAllPartStyles(); syncInspector(); markChanged();
}

// ---------- draggable floating panels ----------
[controlPanel, layerPanel, hierarchyPanel].forEach(makePanelDraggable);
function makePanelDraggable(panel) {
  const handle = $('.panel-drag-handle', panel);
  const saved = loadPanelPosition(panel.dataset.panel);
  if (saved) {
    panel.style.left = `${saved.left}px`; panel.style.top = `${saved.top}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  }
  handle.addEventListener('pointerdown', event => {
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const dx = event.clientX - rect.left, dy = event.clientY - rect.top;
    handle.setPointerCapture?.(event.pointerId);
    const move = e => {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      const left = clamp(e.clientX - dx, 0, maxLeft);
      const top = clamp(e.clientY - dy, 0, maxTop);
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

// ---------- upgraded test run ----------
function descendantsWithDepth(rootId) {
  const result = [];
  const walk = (id, depth) => {
    state.parts.filter(p => p.parentId === id).forEach(child => {
      result.push({ part: child, depth });
      walk(child.id, depth + 1);
    });
  };
  walk(rootId, 1);
  return result;
}
function startTest() {
  stopTest();
  const part = selectedPart();
  if (!part || !part.visible) { testStatus.textContent = 'パーツを選択'; return; }
  if (state.pivotMode) { testStatus.textContent = 'ピボット設定を終了'; return; }
  const amplitude = Math.max(1, Math.abs(int(inputs.testAmplitude.value, 15)));
  const duration = Math.max(200, Math.abs(int(inputs.testDuration.value, 1200)));
  const childScale = clamp(Math.abs(int(inputs.testChildScale.value, 70))/100, 0, 2);
  const delay = Math.max(0, Math.abs(int(inputs.testDelay.value, 100)));
  const mode = $('#testMode').value;
  const chain = mode === 'chain' ? descendantsWithDepth(part.id) : [];
  state.testRunning = true;
  state.testStart = performance.now();
  document.body.classList.add('test-running');
  testStatus.textContent = mode === 'chain' ? `${part.name} チェーン再生中` : `${part.name} 再生中`;
  $('#testRunBtn').classList.add('active');
  $('#testRunBtn').textContent = '試運転停止';
  syncInspector();

  const frame = now => {
    if (!state.testRunning) return;
    const offsets = new Map();
    const phase = ((now - state.testStart) / duration) * Math.PI * 2;
    offsets.set(part.id, Math.sin(phase) * amplitude);
    chain.forEach(({ part: child, depth }) => {
      const childPhase = (((now - state.testStart) - delay * depth) / duration) * Math.PI * 2;
      offsets.set(child.id, Math.sin(childPhase) * amplitude * Math.pow(childScale, depth));
    });
    applyAllPartStyles(offsets);
    state.testRaf = requestAnimationFrame(frame);
  };
  state.testRaf = requestAnimationFrame(frame);
}
function stopTest() {
  if (state.testRaf) cancelAnimationFrame(state.testRaf);
  state.testRaf = 0;
  if (!state.testRunning) return;
  state.testRunning = false;
  applyAllPartStyles();
  document.body.classList.remove('test-running');
  testStatus.textContent = '停止中';
  $('#testRunBtn').classList.remove('active');
  $('#testRunBtn').textContent = '試運転';
  syncInspector();
}
$('#startTestBtn').addEventListener('click', startTest);
$('#stopTestBtn').addEventListener('click', stopTest);
$('#testRunBtn').addEventListener('click', () => state.testRunning ? stopTest() : startTest());

// ---------- export ----------
function exportData() {
  return {
    version: 6,
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
      parentFileName: p.parentId ? (partById(p.parentId)?.fileName || '') : '',
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

// ---------- import saved coordinates ----------
function findCurrentPartForSaved(saved, unusedIds) {
  const savedFile = String(saved?.fileName || '');
  const savedName = String(saved?.name || '');
  let current = state.parts.find(p => unusedIds.has(p.id) && p.fileName === savedFile);
  if (!current && savedFile) {
    const lower = savedFile.toLocaleLowerCase();
    current = state.parts.find(p => unusedIds.has(p.id) && String(p.fileName || '').toLocaleLowerCase() === lower);
  }
  if (!current && savedName) {
    current = state.parts.find(p => unusedIds.has(p.id) && p.name === savedName);
  }
  return current || null;
}

function importCoordinateData(data) {
  if (!data || !Array.isArray(data.parts)) throw new Error('parts配列がありません');
  if (!state.parts.length) throw new Error('先にパーツ画像を読み込んでください');

  stopTest();
  pushHistory();

  const unusedIds = new Set(state.parts.map(p => p.id));
  const matches = [];
  const missing = [];
  const savedIdToCurrentId = new Map();

  data.parts.forEach(saved => {
    const current = findCurrentPartForSaved(saved, unusedIds);
    if (!current) {
      missing.push(saved.fileName || saved.name || saved.id || '不明なパーツ');
      return;
    }
    unusedIds.delete(current.id);
    matches.push({ saved, current });
    if (saved.id != null) savedIdToCurrentId.set(String(saved.id), current.id);
  });

  if (!matches.length) throw new Error('同じファイル名のパーツが見つかりませんでした');

  if (data.stage && Number.isFinite(Number(data.stage.width)) && Number.isFinite(Number(data.stage.height))) {
    state.stage.width = Math.max(240, num(data.stage.width, state.stage.width));
    state.stage.height = Math.max(320, num(data.stage.height, state.stage.height));
  }
  const savedArea = data.characterArea || data.area;
  if (savedArea) {
    state.area.x = num(savedArea.x, state.area.x);
    state.area.y = num(savedArea.y, state.area.y);
    state.area.width = Math.max(40, num(savedArea.width, state.area.width));
    state.area.height = Math.max(40, num(savedArea.height, state.area.height));
  }

  // First restore each part's own local transform. Parent links are restored afterwards.
  matches.forEach(({ saved, current }) => {
    current.x = num(saved.x, current.x);
    current.y = num(saved.y, current.y);
    current.width = Math.max(1, num(saved.width, current.width));
    current.rotation = num(saved.rotation, current.rotation);
    current.pivotX = num(saved.pivotX, current.pivotX);
    current.pivotY = num(saved.pivotY, current.pivotY);
    current.visible = saved.visible !== false;
    current.order = num(saved.order, current.order);
    current.parentId = '';
  });

  // Rebuild hierarchy using saved-id -> currently loaded image-id mapping.
  matches.forEach(({ saved, current }) => {
    let parentId = '';
    if (saved.parentId != null && saved.parentId !== '') {
      parentId = savedIdToCurrentId.get(String(saved.parentId)) || '';
    }
    if (!parentId && saved.parentFileName) {
      const parentMatch = matches.find(({ saved: candidate }) =>
        String(candidate.fileName || '').toLocaleLowerCase() === String(saved.parentFileName || '').toLocaleLowerCase()
      );
      parentId = parentMatch?.current.id || '';
    }
    if (parentId && parentId !== current.id) current.parentId = parentId;
  });

  normalizeOrders();
  if (!state.parts.some(p => p.id === state.selectedId)) state.selectedId = matches[0].current.id;
  syncStage();
  syncArea();
  renderParts();

  const extraCount = unusedIds.size;
  const message = `座標読み込み完了 ${matches.length}/${data.parts.length}パーツ`;
  statusText.textContent = message;
  jsonPreview.value = JSON.stringify(data, null, 2);

  if (missing.length || extraCount) {
    const lines = [message];
    if (missing.length) lines.push(`見つからなかった画像: ${missing.join(', ')}`);
    if (extraCount) lines.push(`保存データに無い読込済み画像: ${extraCount}個（現在位置のまま）`);
    alert(lines.join('\n'));
  }
}

importJsonInput.addEventListener('change', async () => {
  const file = importJsonInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    importCoordinateData(data);
  } catch (error) {
    statusText.textContent = '座標読み込み失敗';
    alert(`座標JSONを読み込めませんでした。\n${error?.message || error}`);
  } finally {
    importJsonInput.value = '';
  }
});

// ---------- reset / misc ----------
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('配置を初期化しますか？')) return;
  stopTest(); pushHistory();
  state.stage = { width:390, height:844 };
  state.area = { x:12, y:18, width:160, height:220 };
  state.parts = []; state.selectedId = null; state.pivotMode = false;
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.backgroundUrl = '';
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
  [controlPanel, layerPanel, hierarchyPanel].forEach(panel => {
    const r = panel.getBoundingClientRect();
    if (r.right > innerWidth) panel.style.left = `${Math.max(0, innerWidth - panel.offsetWidth)}px`;
    if (r.bottom > innerHeight) panel.style.top = `${Math.max(0, innerHeight - panel.offsetHeight)}px`;
  });
});
window.addEventListener('beforeunload', () => {
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.liveObjectUrls.forEach(url => URL.revokeObjectURL(url));
});

syncStage(); syncArea(); renderParts(); updateHistoryButtons();
