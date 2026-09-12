const $ = (selector) => document.querySelector(selector);

const stage = $('#stage');
const backgroundInput = $('#backgroundInput');
const backgroundImage = $('#backgroundImage');
const stageEmpty = $('#stageEmpty');
const partInput = $('#partInput');
const partTemplate = $('#partTemplate');
const characterArea = $('#characterArea');
const partSelect = $('#partSelect');
const parentSelect = $('#parentSelect');
const statusText = $('#statusText');
const jsonPreview = $('#jsonPreview');

const state = {
  stage: { width: 390, height: 844 },
  area: { x: 12, y: 18, width: 160, height: 220 },
  parts: [],
  selectedId: null,
  pivotMode: false,
  backgroundDataUrl: ''
};

const inputs = {
  stageWidth: $('#stageWidth'), stageHeight: $('#stageHeight'),
  areaX: $('#areaX'), areaY: $('#areaY'), areaW: $('#areaW'), areaH: $('#areaH'),
  partX: $('#partX'), partY: $('#partY'), partW: $('#partW'), partRot: $('#partRot'),
  partRotRange: $('#partRotRange'), pivotX: $('#pivotX'), pivotY: $('#pivotY')
};

function uid() {
  return `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function number(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function selectedPart() {
  return state.parts.find(p => p.id === state.selectedId) || null;
}

function markChanged(text = '変更あり') {
  statusText.textContent = text;
  updateJsonPreview();
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
  inputs.areaX.value = state.area.x;
  inputs.areaY.value = state.area.y;
  inputs.areaW.value = state.area.width;
  inputs.areaH.value = state.area.height;
}

function renderParts() {
  characterArea.querySelectorAll('.rig-part').forEach(el => el.remove());

  const roots = state.parts.filter(p => !p.parentId || !state.parts.some(x => x.id === p.parentId));
  roots.forEach(part => mountPartRecursive(part, characterArea));

  refreshPartSelects();
  syncInspector();
}

function mountPartRecursive(part, parentElement) {
  const node = partTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = part.id;
  node.classList.toggle('selected', state.selectedId === part.id);
  node.style.left = `${part.x}px`;
  node.style.top = `${part.y}px`;
  node.style.width = `${part.width}px`;
  node.style.transformOrigin = `${part.pivotX}px ${part.pivotY}px`;
  node.style.transform = `rotate(${part.rotation}deg)`;
  node.style.zIndex = part.zIndex || 1;

  const img = node.querySelector('img');
  img.src = part.dataUrl;
  img.alt = part.name;

  const pivotDot = node.querySelector('.pivot-dot');
  pivotDot.style.left = `${part.pivotX}px`;
  pivotDot.style.top = `${part.pivotY}px`;

  node.querySelector('.part-name-badge').textContent = part.name;
  parentElement.appendChild(node);

  node.addEventListener('pointerdown', onPartPointerDown);
  node.addEventListener('click', onPartClick);

  state.parts.filter(child => child.parentId === part.id).forEach(child => mountPartRecursive(child, node));
}

function refreshPartSelects() {
  const current = state.selectedId;
  partSelect.innerHTML = '';
  state.parts.forEach(part => {
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = part.name;
    option.selected = part.id === current;
    partSelect.appendChild(option);
  });

  parentSelect.innerHTML = '<option value="">なし（character-area基準）</option>';
  const selected = selectedPart();
  state.parts.forEach(part => {
    if (!selected || part.id === selected.id) return;
    if (selected && isDescendant(part.id, selected.id)) return;
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
  ['partX','partY','partW','partRot','partRotRange','pivotX','pivotY'].forEach(key => inputs[key].disabled = disabled);
  parentSelect.disabled = disabled;
  if (!part) return;

  inputs.partX.value = Math.round(part.x * 100) / 100;
  inputs.partY.value = Math.round(part.y * 100) / 100;
  inputs.partW.value = Math.round(part.width * 100) / 100;
  inputs.partRot.value = part.rotation;
  inputs.partRotRange.value = part.rotation;
  inputs.pivotX.value = Math.round(part.pivotX * 100) / 100;
  inputs.pivotY.value = Math.round(part.pivotY * 100) / 100;
  parentSelect.value = part.parentId || '';
}

function selectPart(id) {
  state.selectedId = id;
  renderParts();
}

function onPartClick(event) {
  const node = event.currentTarget;
  const id = node.dataset.id;
  if (state.pivotMode && id === state.selectedId) {
    event.stopPropagation();
    setPivotFromPointer(event, node);
    return;
  }
  event.stopPropagation();
  selectPart(id);
}

function onPartPointerDown(event) {
  const node = event.currentTarget;
  const id = node.dataset.id;
  if (state.pivotMode) {
    state.selectedId = id;
    renderParts();
    return;
  }

  event.stopPropagation();
  event.preventDefault();
  state.selectedId = id;
  const part = selectedPart();
  if (!part) return;

  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = part.x;
  const startY = part.y;
  node.classList.add('selected');
  node.setPointerCapture?.(event.pointerId);

  function move(e) {
    const scale = stage.getBoundingClientRect().width / state.stage.width || 1;
    part.x = startX + (e.clientX - startClientX) / scale;
    part.y = startY + (e.clientY - startClientY) / scale;
    node.style.left = `${part.x}px`;
    node.style.top = `${part.y}px`;
    syncInspector();
    updateJsonPreview();
    statusText.textContent = '変更あり';
  }

  function up() {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
    renderParts();
  }

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
  renderParts();
  markChanged('ピボット変更');
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


characterArea.addEventListener('pointerdown', (event) => {
  if (event.target !== characterArea && !event.target.classList.contains('character-area-label')) return;
  if (state.pivotMode) return;
  event.preventDefault();

  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = state.area.x;
  const startY = state.area.y;
  characterArea.setPointerCapture?.(event.pointerId);

  function move(e) {
    const scale = stage.getBoundingClientRect().width / state.stage.width || 1;
    state.area.x = startX + (e.clientX - startClientX) / scale;
    state.area.y = startY + (e.clientY - startClientY) / scale;
    syncArea();
    updateJsonPreview();
    statusText.textContent = '変更あり';
  }

  function up() {
    characterArea.removeEventListener('pointermove', move);
    characterArea.removeEventListener('pointerup', up);
    characterArea.removeEventListener('pointercancel', up);
  }

  characterArea.addEventListener('pointermove', move);
  characterArea.addEventListener('pointerup', up);
  characterArea.addEventListener('pointercancel', up);
});

backgroundInput.addEventListener('change', async () => {
  const file = backgroundInput.files?.[0];
  if (!file) return;
  state.backgroundDataUrl = await fileToDataUrl(file);
  backgroundImage.src = state.backgroundDataUrl;
  backgroundImage.hidden = false;
  stageEmpty.hidden = true;
  markChanged('背景読込済み');
});

partInput.addEventListener('change', async () => {
  const files = [...(partInput.files || [])];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    const part = {
      id: uid(), name, dataUrl,
      x: 10, y: 10,
      width: 100,
      rotation: 0,
      pivotX: 0,
      pivotY: 0,
      parentId: '',
      zIndex: state.parts.length + 1
    };
    state.parts.push(part);
    state.selectedId = part.id;
  }
  partInput.value = '';
  renderParts();
  markChanged(`${files.length}パーツ追加`);
});

partSelect.addEventListener('change', () => selectPart(partSelect.value));

$('#togglePivotBtn').addEventListener('click', (e) => {
  state.pivotMode = !state.pivotMode;
  e.currentTarget.classList.toggle('active', state.pivotMode);
  e.currentTarget.textContent = state.pivotMode ? 'ピボット設定中' : 'ピボット設定';
  $('#pivotModeHint').textContent = state.pivotMode
    ? '選択したパーツ画像上で、回転中心にしたい場所をタップしてください。'
    : 'ピボット設定を押すと、選択中の画像をタップした位置が回転中心になります。';
});

$('#applyStageSizeBtn').addEventListener('click', () => {
  state.stage.width = Math.max(240, number(inputs.stageWidth.value, 390));
  state.stage.height = Math.max(320, number(inputs.stageHeight.value, 844));
  syncStage();
  markChanged('画面サイズ変更');
});

['areaX','areaY','areaW','areaH'].forEach(key => {
  inputs[key].addEventListener('input', () => {
    state.area.x = number(inputs.areaX.value, state.area.x);
    state.area.y = number(inputs.areaY.value, state.area.y);
    state.area.width = Math.max(40, number(inputs.areaW.value, state.area.width));
    state.area.height = Math.max(40, number(inputs.areaH.value, state.area.height));
    syncArea();
    markChanged();
  });
});

function bindPartNumber(inputKey, partKey, min = null) {
  inputs[inputKey].addEventListener('input', () => {
    const part = selectedPart();
    if (!part) return;
    let value = number(inputs[inputKey].value, part[partKey]);
    if (min !== null) value = Math.max(min, value);
    part[partKey] = value;
    if (partKey === 'rotation') {
      inputs.partRot.value = value;
      inputs.partRotRange.value = value;
    }
    renderParts();
    markChanged();
  });
}

bindPartNumber('partX', 'x');
bindPartNumber('partY', 'y');
bindPartNumber('partW', 'width', 1);
bindPartNumber('partRot', 'rotation');
bindPartNumber('partRotRange', 'rotation');
bindPartNumber('pivotX', 'pivotX');
bindPartNumber('pivotY', 'pivotY');

parentSelect.addEventListener('change', () => {
  const part = selectedPart();
  if (!part) return;
  part.parentId = parentSelect.value;
  renderParts();
  markChanged('親子関係変更');
});

$('#deletePartBtn').addEventListener('click', () => {
  const part = selectedPart();
  if (!part) return;
  state.parts.forEach(p => { if (p.parentId === part.id) p.parentId = ''; });
  state.parts = state.parts.filter(p => p.id !== part.id);
  state.selectedId = state.parts[0]?.id || null;
  renderParts();
  markChanged('パーツ削除');
});

function exportData() {
  return {
    version: 1,
    stage: { ...state.stage },
    characterArea: { ...state.area },
    parts: state.parts.map(({ id, name, x, y, width, rotation, pivotX, pivotY, parentId, zIndex, dataUrl }) => ({
      id, name, x, y, width, rotation, pivotX, pivotY, parentId, zIndex, dataUrl
    })),
    backgroundDataUrl: state.backgroundDataUrl || ''
  };
}

function updateJsonPreview() {
  jsonPreview.value = JSON.stringify(exportData(), null, 2);
}

$('#copyJsonBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(exportData(), null, 2));
    statusText.textContent = 'JSONコピー済み';
  } catch {
    jsonPreview.select();
    document.execCommand('copy');
    statusText.textContent = 'JSONコピー済み';
  }
});

$('#downloadJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'character-rig.json';
  a.click();
  URL.revokeObjectURL(url);
  statusText.textContent = 'JSON保存済み';
});

$('#jsonInput').addEventListener('change', async () => {
  const file = $('#jsonInput').files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state.stage = { ...state.stage, ...(data.stage || {}) };
    state.area = { ...state.area, ...(data.characterArea || {}) };
    state.parts = Array.isArray(data.parts) ? data.parts : [];
    state.selectedId = state.parts[0]?.id || null;
    state.backgroundDataUrl = data.backgroundDataUrl || '';
    if (state.backgroundDataUrl) {
      backgroundImage.src = state.backgroundDataUrl;
      backgroundImage.hidden = false;
      stageEmpty.hidden = true;
    } else {
      backgroundImage.hidden = true;
      stageEmpty.hidden = false;
    }
    syncStage();
    syncArea();
    renderParts();
    markChanged('JSON読込済み');
  } catch (err) {
    alert('JSONを読み込めませんでした。');
    console.error(err);
  }
  $('#jsonInput').value = '';
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('配置データを初期化しますか？')) return;
  state.stage = { width: 390, height: 844 };
  state.area = { x: 12, y: 18, width: 160, height: 220 };
  state.parts = [];
  state.selectedId = null;
  state.backgroundDataUrl = '';
  state.pivotMode = false;
  backgroundImage.hidden = true;
  backgroundImage.removeAttribute('src');
  stageEmpty.hidden = false;
  $('#togglePivotBtn').classList.remove('active');
  $('#togglePivotBtn').textContent = 'ピボット設定';
  syncStage();
  syncArea();
  renderParts();
  markChanged('初期化済み');
});

$('#fitBtn').addEventListener('click', () => {
  const wrap = document.querySelector('.stage-wrap');
  wrap.scrollTo({ left: Math.max(0, (stage.offsetWidth - wrap.clientWidth) / 2), top: 0, behavior: 'smooth' });
});

syncStage();
syncArea();
renderParts();
updateJsonPreview();
