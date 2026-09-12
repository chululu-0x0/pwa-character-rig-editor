const $ = (selector) => document.querySelector(selector);

const stage = $('#stage');
const stageEmpty = $('#stageEmpty');
const backgroundInput = $('#backgroundInput');
const backgroundImage = $('#backgroundImage');
const partInput = $('#partInput');
const partTemplate = $('#partTemplate');
const characterArea = $('#characterArea');
const partSelect = $('#partSelect');
const parentSelect = $('#parentSelect');
const nudgePad = $('#nudgePad');
const statusText = $('#statusText');
const jsonPreview = $('#jsonPreview');
const selectedCoord = $('#selectedCoord');

const state = {
  stage: { width: 390, height: 844 },
  area: { x: 12, y: 18, width: 160, height: 220 },
  parts: [],
  selectedId: null,
  pivotMode: false,
  backgroundUrl: '',
  dragRaf: 0,
  padRaf: 0
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

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function selectedPart() {
  return state.parts.find(part => part.id === state.selectedId) || null;
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
  scheduleNudgePad();
}

function syncArea() {
  characterArea.style.left = `${state.area.x}px`;
  characterArea.style.top = `${state.area.y}px`;
  characterArea.style.width = `${state.area.width}px`;
  characterArea.style.height = `${state.area.height}px`;
  inputs.areaX.value = round(state.area.x);
  inputs.areaY.value = round(state.area.y);
  inputs.areaW.value = round(state.area.width);
  inputs.areaH.value = round(state.area.height);
  scheduleNudgePad();
}

function applyPartStyle(part, node = getPartNode(part.id)) {
  if (!node) return;
  node.style.left = `${part.x}px`;
  node.style.top = `${part.y}px`;
  node.style.width = `${part.width}px`;
  node.style.transformOrigin = `${part.pivotX}px ${part.pivotY}px`;
  node.style.transform = `rotate(${part.rotation}deg)`;
  node.style.zIndex = part.zIndex || 1;

  const pivot = node.querySelector('.pivot-dot');
  pivot.style.left = `${part.pivotX}px`;
  pivot.style.top = `${part.pivotY}px`;
}

function renderParts() {
  characterArea.querySelectorAll('.rig-part').forEach(el => el.remove());
  const roots = state.parts.filter(p => !p.parentId || !state.parts.some(x => x.id === p.parentId));
  roots.forEach(part => mountPartRecursive(part, characterArea));
  refreshPartSelects();
  syncInspector();
  requestAnimationFrame(updateSelectionVisuals);
}

function mountPartRecursive(part, parentElement) {
  const node = partTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = part.id;
  node.classList.toggle('selected', state.selectedId === part.id);

  const img = node.querySelector('img');
  if (part.objectUrl) img.src = part.objectUrl;
  img.alt = part.name;
  node.querySelector('.part-name-badge').textContent = part.name;

  parentElement.appendChild(node);
  applyPartStyle(part, node);

  node.addEventListener('pointerdown', onPartPointerDown);
  node.addEventListener('click', onPartClick);

  state.parts
    .filter(child => child.parentId === part.id)
    .forEach(child => mountPartRecursive(child, node));
}

function refreshPartSelects() {
  partSelect.innerHTML = '';
  state.parts.forEach(part => {
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = part.name;
    option.selected = part.id === state.selectedId;
    partSelect.appendChild(option);
  });

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
  ['partX','partY','partW','partRot','partRotRange','pivotX','pivotY'].forEach(key => {
    inputs[key].disabled = disabled;
  });
  parentSelect.disabled = disabled;

  if (!part) {
    selectedCoord.textContent = 'X — / Y —';
    nudgePad.hidden = true;
    return;
  }

  inputs.partX.value = round(part.x);
  inputs.partY.value = round(part.y);
  inputs.partW.value = round(part.width);
  inputs.partRot.value = round(part.rotation);
  inputs.partRotRange.value = part.rotation;
  inputs.pivotX.value = round(part.pivotX);
  inputs.pivotY.value = round(part.pivotY);
  parentSelect.value = part.parentId || '';
  selectedCoord.textContent = `X ${round(part.x)} / Y ${round(part.y)}`;
}

function selectPart(id) {
  if (!id || !state.parts.some(p => p.id === id)) return;
  state.selectedId = id;
  characterArea.querySelectorAll('.rig-part').forEach(node => {
    node.classList.toggle('selected', node.dataset.id === id);
  });
  refreshPartSelects();
  syncInspector();
  scheduleNudgePad();
}

function updateSelectionVisuals() {
  characterArea.querySelectorAll('.rig-part').forEach(node => {
    node.classList.toggle('selected', node.dataset.id === state.selectedId);
  });
  syncInspector();
  scheduleNudgePad();
}

function onPartClick(event) {
  const node = event.currentTarget;
  const id = node.dataset.id;
  event.stopPropagation();

  if (state.pivotMode) {
    selectPart(id);
    setPivotFromPointer(event, node);
    return;
  }
  selectPart(id);
}

function onPartPointerDown(event) {
  const node = event.currentTarget;
  const id = node.dataset.id;
  event.stopPropagation();

  if (state.pivotMode) {
    selectPart(id);
    return;
  }

  event.preventDefault();
  selectPart(id);
  const part = selectedPart();
  if (!part) return;

  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = part.x;
  const startY = part.y;
  node.setPointerCapture?.(event.pointerId);

  const move = (e) => {
    const parentRect = node.parentElement.getBoundingClientRect();
    const parentScale = node.parentElement.offsetWidth ? parentRect.width / node.parentElement.offsetWidth : 1;
    part.x = startX + (e.clientX - startClientX) / (parentScale || 1);
    part.y = startY + (e.clientY - startClientY) / (parentScale || 1);

    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0;
      node.style.left = `${part.x}px`;
      node.style.top = `${part.y}px`;
      syncInspector();
      scheduleNudgePad();
      markChanged();
    });
  };

  const up = () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
    syncInspector();
    scheduleNudgePad();
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
  scheduleNudgePad();
  markChanged('ピボット変更');
}

function scheduleNudgePad() {
  cancelAnimationFrame(state.padRaf);
  state.padRaf = requestAnimationFrame(positionNudgePad);
}

function positionNudgePad() {
  state.padRaf = 0;
  const part = selectedPart();
  const node = part ? getPartNode(part.id) : null;
  if (!part || !node) {
    nudgePad.hidden = true;
    return;
  }

  nudgePad.hidden = false;
  const stageRect = stage.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const scaleX = state.stage.width / stageRect.width || 1;
  const scaleY = state.stage.height / stageRect.height || 1;
  const padW = nudgePad.offsetWidth || 122;
  const padH = nudgePad.offsetHeight || 122;

  let left = ((nodeRect.left + nodeRect.width / 2) - stageRect.left) * scaleX - padW / 2;
  let top = (nodeRect.bottom - stageRect.top) * scaleY + 14;

  left = Math.max(6, Math.min(state.stage.width - padW - 6, left));
  if (top + padH > state.stage.height - 6) {
    top = Math.max(6, ((nodeRect.top - stageRect.top) * scaleY) - padH - 14);
  }

  nudgePad.style.left = `${left}px`;
  nudgePad.style.top = `${top}px`;
}

function nudgeSelected(dx, dy) {
  const part = selectedPart();
  if (!part) return;
  part.x += dx;
  part.y += dy;
  const node = getPartNode(part.id);
  if (node) {
    node.style.left = `${part.x}px`;
    node.style.top = `${part.y}px`;
  }
  syncInspector();
  scheduleNudgePad();
  markChanged('1px移動');
}

nudgePad.querySelectorAll('.nudge-btn').forEach(button => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    nudgeSelected(Number(button.dataset.dx), Number(button.dataset.dy));
  });
});

characterArea.addEventListener('pointerdown', (event) => {
  if (event.target !== characterArea && !event.target.classList.contains('character-area-label')) return;
  if (state.pivotMode) return;
  event.preventDefault();

  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = state.area.x;
  const startY = state.area.y;
  characterArea.setPointerCapture?.(event.pointerId);

  const move = (e) => {
    const stageRect = stage.getBoundingClientRect();
    const scale = stageRect.width / state.stage.width || 1;
    state.area.x = startX + (e.clientX - startClientX) / scale;
    state.area.y = startY + (e.clientY - startClientY) / scale;

    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0;
      syncArea();
      markChanged();
    });
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
  markChanged('背景表示中');
});

partInput.addEventListener('change', () => {
  const files = [...(partInput.files || [])];
  if (!files.length) return;

  files.forEach(file => {
    const name = file.name.replace(/\.[^.]+$/, '');
    const part = {
      id: uid(),
      name,
      fileName: file.name,
      objectUrl: URL.createObjectURL(file),
      x: 10,
      y: 10,
      width: 100,
      rotation: 0,
      pivotX: 0,
      pivotY: 0,
      parentId: '',
      zIndex: state.parts.length + 1
    };
    state.parts.push(part);
    state.selectedId = part.id;
  });

  partInput.value = '';
  renderParts();
  markChanged(`${files.length}パーツ追加`);
});

partSelect.addEventListener('change', () => selectPart(partSelect.value));

$('#togglePivotBtn').addEventListener('click', (event) => {
  state.pivotMode = !state.pivotMode;
  event.currentTarget.classList.toggle('active', state.pivotMode);
  event.currentTarget.textContent = state.pivotMode ? 'ピボット設定中' : 'ピボット設定';
  $('#pivotModeHint').textContent = state.pivotMode
    ? '選択したパーツ画像上で、回転中心にしたい場所をタップしてください。'
    : '「ピボット設定」を押してから、画像上の回転中心にしたい場所をタップします。';
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

    applyPartStyle(part);
    syncInspector();
    scheduleNudgePad();
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

  state.parts.forEach(p => {
    if (p.parentId === part.id) p.parentId = '';
  });
  if (part.objectUrl) URL.revokeObjectURL(part.objectUrl);
  state.parts = state.parts.filter(p => p.id !== part.id);
  state.selectedId = state.parts[0]?.id || null;
  renderParts();
  markChanged('パーツ削除');
});

function exportData() {
  return {
    stage: { ...state.stage },
    characterArea: { ...state.area },
    parts: state.parts.map(({ id, name, fileName, x, y, width, rotation, pivotX, pivotY, parentId, zIndex }) => ({
      id,
      name,
      fileName,
      x: round(x),
      y: round(y),
      width: round(width),
      rotation: round(rotation),
      pivotX: round(pivotX),
      pivotY: round(pivotY),
      parentId,
      zIndex
    }))
  };
}

function jsonText() {
  return JSON.stringify(exportData(), null, 2);
}

$('#previewJsonBtn').addEventListener('click', () => {
  jsonPreview.value = jsonText();
  statusText.textContent = '座標表示済み';
});

$('#copyJsonBtn').addEventListener('click', async () => {
  const text = jsonText();
  jsonPreview.value = text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    jsonPreview.select();
    document.execCommand('copy');
  }
  statusText.textContent = '座標コピー済み';
});

$('#downloadJsonBtn').addEventListener('click', () => {
  const blob = new Blob([jsonText()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'character-coordinates.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  statusText.textContent = '座標保存済み';
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('配置を初期化しますか？')) return;

  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.parts.forEach(part => {
    if (part.objectUrl) URL.revokeObjectURL(part.objectUrl);
  });

  state.stage = { width: 390, height: 844 };
  state.area = { x: 12, y: 18, width: 160, height: 220 };
  state.parts = [];
  state.selectedId = null;
  state.pivotMode = false;
  state.backgroundUrl = '';

  backgroundImage.hidden = true;
  backgroundImage.removeAttribute('src');
  stageEmpty.hidden = false;
  nudgePad.hidden = true;
  jsonPreview.value = '';
  $('#togglePivotBtn').classList.remove('active');
  $('#togglePivotBtn').textContent = 'ピボット設定';

  syncStage();
  syncArea();
  renderParts();
  statusText.textContent = '初期化済み';
});

$('#fitBtn').addEventListener('click', () => {
  const wrap = document.querySelector('.stage-wrap');
  wrap.scrollTo({
    left: Math.max(0, (stage.offsetWidth - wrap.clientWidth) / 2),
    top: 0,
    behavior: 'smooth'
  });
});

window.addEventListener('resize', scheduleNudgePad);
window.addEventListener('beforeunload', () => {
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.parts.forEach(part => {
    if (part.objectUrl) URL.revokeObjectURL(part.objectUrl);
  });
});

syncStage();
syncArea();
renderParts();
