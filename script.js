const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stage = $('#stage');
const stageEmpty = $('#stageEmpty');
const backgroundInput = $('#backgroundInput');
const backgroundImage = $('#backgroundImage');
const partInput = $('#partInput');
const partGroupSelect = $('#partGroupSelect');
const newGroupBtn = $('#newGroupBtn');
const importJsonInput = $('#importJsonInput');
const partTemplate = $('#partTemplate');
const characterArea = $('#characterArea');
const parentSelect = $('#parentSelect');
const layerList = $('#layerList');
const layerGroupSelect = $('#layerGroupSelect');
const layerNewGroupBtn = $('#layerNewGroupBtn');
const groupBackBtn = $('#groupBackBtn');
const groupFrontBtn = $('#groupFrontBtn');
const groupVisibilityBtn = $('#groupVisibilityBtn');
const renameGroupBtn = $('#renameGroupBtn');
const duplicateGroupBtn = $('#duplicateGroupBtn');
const shiftGroupTimeBtn = $('#shiftGroupTimeBtn');
const groupMoveBtn = $('#groupMoveBtn');
const deleteGroupBtn = $('#deleteGroupBtn');
const hierarchyGroupName = $('#hierarchyGroupName');
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
const controlFlipIkBtn = $('#controlFlipIkBtn');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');
const jsonFileName = $('#jsonFileName');
const ikTarget = $('#ikTarget');
const toggleIkBtn = $('#toggleIkBtn');
const ikStatus = $('#ikStatus');
const animationPanel = $('#animationPanel');
const appHeader = $('.app-header');
const appShell = $('.app-shell');
const timelineSlider = $('#timelineSlider');
const trackList = $('#trackList');
const trackViewport = $('#trackViewport');
const timelineBody = $('#timelineBody');
const timelineEndLabel = $('#timelineEndLabel');
const animStatus = $('#animStatus');
const motionName = $('#motionName');
const animLoop = $('#animLoop');
const selectedKeyLabel = $('#selectedKeyLabel');
const keyEditStatus = $('#keyEditStatus');
const overwriteKeyBtn = $('#overwriteKeyBtn');
const duplicateKeyBtn = $('#duplicateKeyBtn');
const deleteKeyBtn = $('#deleteKeyBtn');
const timelineCollapseBtn = $('#timelineCollapseBtn');
const trackRowsToggleBtn = $('#trackRowsToggleBtn');
const onionSkinToggle = $('#onionSkinToggle');
const onionPrevLayer = $('#onionPrevLayer');
const onionNextLayer = $('#onionNextLayer');
const boneLayer = $('#boneLayer');
const toggleBoneBtn = $('#toggleBoneBtn');
const deformMode = $('#deformMode');
const deformAnchor = $('#deformAnchor');

const state = {
  stage: { width: 390, height: 844 },
  area: { x: 12, y: 18, width: 160, height: 220 },
  parts: [],
  groups: [{ id:'group-default', name:'未分類', visible:true }],
  activeGroupId: 'group-default',
  selectedId: null,
  groupMoveMode: false,
  pivotMode: false,
  boneVisible: false,
  backgroundUrl: '',
  dragRaf: 0,
  testRaf: 0,
  testStart: 0,
  testRunning: false,
  ikMode: false,
  ikBendDir: 1,
  ikTarget: { x: 0, y: 0 },
  animation: {
    name: 'walk01', duration: 1000, loop: true, currentTime: 0,
    tracks: {}, areaKeys: [], playing: false, raf: 0, playStartedAt: 0, playStartTime: 0,
    previewActive: false, previewPose: null,
    selectedGroupId: null, selectedKeyTime: null, keyDraftTime: null, keyDirty: false,
    timelineCollapsed: false, tracksHidden: false, onionSkin: true
  },
  liveObjectUrls: new Set(),
  undoStack: [],
  redoStack: []
};

const inputs = {
  stageWidth: $('#stageWidth'), stageHeight: $('#stageHeight'),
  areaX: $('#areaX'), areaY: $('#areaY'), areaW: $('#areaW'), areaH: $('#areaH'),
  partX: $('#partX'), partY: $('#partY'), partW: $('#partW'), partRot: $('#partRot'),
  pivotX: $('#pivotX'), pivotY: $('#pivotY'), deformAmount: $('#deformAmount'),
  testAmplitude: $('#testAmplitude'), testDuration: $('#testDuration'),
  testChildScale: $('#testChildScale'), testDelay: $('#testDelay'),
  ikRootName: $('#ikRootName'), ikMidName: $('#ikMidName'), ikEndName: $('#ikEndName'), ikBendName: $('#ikBendName'),
  animDuration: $('#animDuration'), animTime: $('#animTime'), selectedKeyTime: $('#selectedKeyTime')
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
function normalizeRad(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function lerp(a,b,t) { return a + (b-a)*t; }
function lerpAngle(a,b,t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}
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
function matrixRotationDeg(m) { return radToDeg(Math.atan2(m.b, m.a)); }
function worldPoint(part, x, y) { return transformPoint(worldMatrix(part), x, y); }
function worldPivot(part) { return worldPoint(part, part.pivotX, part.pivotY); }

function decomposeLocalMatrixIntoPart(part, m) {
  const rotation = radToDeg(Math.atan2(m.b, m.a));
  const rpX = m.a * part.pivotX + m.c * part.pivotY;
  const rpY = m.b * part.pivotX + m.d * part.pivotY;
  part.rotation = rotation;
  part.x = m.e - part.pivotX + rpX;
  part.y = m.f - part.pivotY + rpY;
}



// ---------- groups + animation / group tracks ----------
function makeGroupId() { return `group-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function ensureGroups() {
  if (!Array.isArray(state.groups) || !state.groups.length) state.groups = [{ id:'group-default', name:'未分類', visible:true }];
  state.groups.forEach(g => { if (typeof g.visible !== 'boolean') g.visible = true; });
  const ids = new Set(state.groups.map(g => g.id));
  state.parts.forEach(p => { if (!p.groupId || !ids.has(p.groupId)) p.groupId = state.groups[0].id; });
  if (!state.activeGroupId || !ids.has(state.activeGroupId)) state.activeGroupId = state.groups[0].id;
}
function groupById(id) { ensureGroups(); return state.groups.find(g => g.id === id) || null; }
function activeGroup() { return groupById(state.activeGroupId); }
function isGroupVisible(groupId) { const g=groupById(groupId); return !g || g.visible !== false; }
function partsInGroup(groupId) { return state.parts.filter(p => p.groupId === groupId).sort((a,b)=>a.order-b.order); }
function groupIndex(groupId) { ensureGroups(); return Math.max(0, state.groups.findIndex(g => g.id === groupId)); }
function effectiveZIndex(part) { return (groupIndex(part.groupId) + 1) * 10000 + (part.order || 1); }
function syncGroupLayerButtons() {
  const i = groupIndex(state.activeGroupId);
  if (groupBackBtn) groupBackBtn.disabled = i <= 0;
  if (groupFrontBtn) groupFrontBtn.disabled = i < 0 || i >= state.groups.length - 1;
  const group = activeGroup();
  if (groupVisibilityBtn) {
    const visible = !group || group.visible !== false;
    groupVisibilityBtn.textContent = visible ? '👁 表示' : '— 非表示';
    groupVisibilityBtn.classList.toggle('group-hidden', !visible);
    groupVisibilityBtn.disabled = !group;
  }
}
function moveActiveGroupLayer(direction) {
  ensureGroups();
  const i = groupIndex(state.activeGroupId), j = i + direction;
  if (i < 0 || j < 0 || j >= state.groups.length) return;
  pushHistory();
  [state.groups[i], state.groups[j]] = [state.groups[j], state.groups[i]];
  refreshGroupSelects();
  applyAllPartStyles();
  renderLayers();
  renderTrackList();
  markChanged(direction > 0 ? 'グループを手前へ' : 'グループを奥へ');
}
function refreshGroupSelects() {
  ensureGroups();
  [partGroupSelect, layerGroupSelect].forEach(select => {
    if (!select) return;
    const previous = select === partGroupSelect ? (select.value || state.activeGroupId) : state.activeGroupId;
    select.innerHTML = '';
    state.groups.forEach(g => {
      const option = document.createElement('option'); option.value = g.id; option.textContent = g.name; select.appendChild(option);
    });
    select.value = state.groups.some(g=>g.id===previous) ? previous : state.activeGroupId;
  });
  if (layerGroupSelect) layerGroupSelect.value = state.activeGroupId;
  syncGroupLayerButtons();
}
function switchActiveGroup(groupId) {
  ensureGroups();
  if (!groupById(groupId)) return;
  state.activeGroupId = groupId;
  if (partGroupSelect) partGroupSelect.value = groupId;
  if (layerGroupSelect) layerGroupSelect.value = groupId;
  const members = partsInGroup(groupId);
  if (!selectedPart() || selectedPart().groupId !== groupId) state.selectedId = members[0]?.id || null;
  clearKeySelection(false);
  renderLayers(); renderHierarchy(); refreshParentSelect(); syncInspector(); refreshIkUi(); renderTrackList(); renderOnionSkins(); renderBoneOverlay(state.animation.previewActive?state.animation.previewPose?.parts:null,null);
  markChanged(`グループ: ${groupById(groupId)?.name || ''}`);
}
function createGroupFromUi() {
  const name = (window.prompt('新しいグループ名', '新規グループ') || '').trim();
  if (!name) return;
  pushHistory();
  const group = { id:makeGroupId(), name, visible:true };
  state.groups.push(group); state.activeGroupId = group.id;
  refreshGroupSelects(); switchActiveGroup(group.id);
  markChanged(`グループ作成: ${name}`);
}

function uniqueGroupName(baseName) {
  ensureGroups();
  const base = String(baseName || 'グループ').trim() || 'グループ';
  const names = new Set(state.groups.map(g => g.name));
  if (!names.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base} copy`;
}
function renameActiveGroup() {
  const group = activeGroup();
  if (!group) return;
  const next = (window.prompt('グループ名を変更', group.name) || '').trim();
  if (!next || next === group.name) return;
  pushHistory();
  group.name = next;
  refreshGroupSelects();
  renderLayers(); renderHierarchy(); renderTrackList(); syncKeyEditUi();
  markChanged(`グループ名変更: ${next}`);
}
function cloneAnimationTrackForPart(sourcePart, clonedPart) {
  const sourceTrack = trackForPart(sourcePart);
  if (!sourceTrack?.keys?.length) return;
  state.animation.tracks[clonedPart.id] = {
    partId: clonedPart.id,
    fileName: clonedPart.fileName,
    name: clonedPart.name,
    keys: sourceTrack.keys.map(key => ({
      ...key,
      id: `key-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    }))
  };
}
function duplicateActiveGroup() {
  stopAnimation(true);
  stopTest();
  const sourceGroup = activeGroup();
  if (!sourceGroup) return;
  const sourceParts = partsInGroup(sourceGroup.id);
  if (!sourceParts.length) {
    alert('このグループには複製するパーツがありません。');
    return;
  }
  const defaultName = uniqueGroupName(`${sourceGroup.name} コピー`);
  const requested = window.prompt('複製後のグループ名', defaultName);
  if (requested == null) return;
  const newName = uniqueGroupName(requested.trim() || defaultName);
  commitAnimationPreview();
  pushHistory();

  const newGroup = { id: makeGroupId(), name: newName, visible: sourceGroup.visible !== false };
  state.groups.push(newGroup);
  const idMap = new Map();
  const clones = [];

  sourceParts.forEach(source => {
    const clone = {
      ...source,
      id: uid(),
      groupId: newGroup.id,
      parentId: source.parentId,
      duplicateSourceId: source.id,
      duplicateSourceFileName: source.fileName
    };
    idMap.set(source.id, clone.id);
    clones.push({ source, clone });
    state.parts.push(clone);
  });

  // Internal parents are redirected to the duplicated counterpart.
  // A parent in another group (for example torso) remains connected to that original parent.
  clones.forEach(({ source, clone }) => {
    if (source.parentId && idMap.has(source.parentId)) clone.parentId = idMap.get(source.parentId);
    cloneAnimationTrackForPart(source, clone);
  });

  state.activeGroupId = newGroup.id;
  state.selectedId = clones.find(({source}) => source.id === state.selectedId)?.clone.id || clones[0]?.clone.id || null;
  clearKeySelection(false);
  refreshGroupSelects();
  renderParts();
  syncAnimationUi();
  markChanged(`グループ複製: ${sourceGroup.name} → ${newName}`);
}


function groupRootParts(groupId) {
  const members = partsInGroup(groupId);
  const ids = new Set(members.map(p => p.id));
  return members.filter(p => !p.parentId || !ids.has(p.parentId));
}
function vectorToParentLocal(part, dx, dy) {
  const parent = part.parentId ? partById(part.parentId) : null;
  if (!parent) return { x:dx, y:dy };
  const inv = inverse(worldMatrix(parent));
  const a = transformPoint(inv, 0, 0);
  const b = transformPoint(inv, dx, dy);
  return { x:b.x-a.x, y:b.y-a.y };
}
function translateGroupNowAndTimeline(groupId, dx, dy) {
  const roots = groupRootParts(groupId);
  roots.forEach(part => {
    const d = vectorToParentLocal(part, dx, dy);
    part.x += d.x;
    part.y += d.y;
    const track = trackForPart(part);
    if (track) track.keys.forEach(key => { key.x += d.x; key.y += d.y; });
  });
  clearKeySelection(false);
  applyAllPartStyles();
  syncInspector();
  renderTrackList();
}
function captureGroupTranslationBase(groupId) {
  return groupRootParts(groupId).map(part => {
    const parent = part.parentId ? partById(part.parentId) : null;
    const invParent = parent ? inverse(worldMatrix(parent)) : identity();
    const track = trackForPart(part);
    return {
      part,
      x:part.x, y:part.y,
      invParent,
      keys:(track?.keys || []).map(key => ({ key, x:key.x, y:key.y }))
    };
  });
}
function applyGroupTranslationBase(base, dx, dy) {
  base.forEach(item => {
    const a = transformPoint(item.invParent, 0, 0);
    const b = transformPoint(item.invParent, dx, dy);
    const lx = b.x-a.x, ly = b.y-a.y;
    item.part.x = item.x + lx;
    item.part.y = item.y + ly;
    item.keys.forEach(k => { k.key.x = k.x + lx; k.key.y = k.y + ly; });
  });
  clearKeySelection(false);
  applyAllPartStyles(); syncInspector(); renderTrackList();
}
function setGroupMoveMode(enabled) {
  state.groupMoveMode = !!enabled;
  if (state.groupMoveMode) {
    stopTest(); stopAnimation(true); commitAnimationPreview();
    if (state.ikMode) disableIkMode(true);
    if (state.pivotMode) {
      state.pivotMode = false;
      $('#togglePivotBtn').classList.remove('active');
      $('#togglePivotBtn').textContent = 'ピボット設定';
    }
  }
  document.body.classList.toggle('group-move-mode', state.groupMoveMode);
  groupMoveBtn?.classList.toggle('active', state.groupMoveMode);
  if (groupMoveBtn) groupMoveBtn.textContent = state.groupMoveMode ? '✥ 移動中' : '✥ 移動';
  syncInspector();
  if (controlModeText) controlModeText.textContent = state.groupMoveMode ? 'グループ全体移動 1px / ドラッグ可' : (state.ikMode ? 'IKターゲットをドラッグ / 末端パーツを掴んでIK' : (state.pivotMode ? 'ピボット移動 1px / 十字を直接ドラッグ可' : 'パーツ移動 1px / 回転 1°'));
}
function shiftActiveGroupKeys() {
  const group = activeGroup();
  if (!group) return;
  const raw = window.prompt(`「${group.name}」の全キーを何msずらしますか？\n例: 左足を半周期ずらすなら 500\nループ時は端を越えると反対側へ回ります。`, String(Math.round(state.animation.duration/2)));
  if (raw == null) return;
  const offset = Math.round(Number(raw));
  if (!Number.isFinite(offset) || offset === 0) return;
  stopAnimation(true); commitAnimationPreview(); pushHistory(); clearKeySelection(false);
  const duration = Math.max(1, Math.round(state.animation.duration));
  let collisions = 0;
  partsInGroup(group.id).forEach(part => {
    const track = trackForPart(part); if (!track) return;
    const moved = track.keys.map(key => {
      let time;
      if (state.animation.loop) time = ((Math.round(key.time) + offset) % duration + duration) % duration;
      else time = clamp(Math.round(key.time) + offset, 0, duration);
      return { ...key, time };
    }).sort((a,b)=>a.time-b.time);
    const dedup = new Map();
    moved.forEach(key => { if (dedup.has(key.time)) collisions++; dedup.set(key.time, key); });
    track.keys = [...dedup.values()].sort((a,b)=>a.time-b.time);
  });
  state.animation.currentTime = state.animation.loop ? ((state.animation.currentTime + offset) % duration + duration) % duration : clamp(state.animation.currentTime + offset,0,duration);
  syncAnimationUi(); applyAnimationPreview(state.animation.currentTime);
  markChanged(`グループ時間移動 ${offset>0?'+':''}${offset}ms${collisions?`（${collisions}キー重複整理）`:''}`);
}
function deleteActiveGroup() {
  const group = activeGroup(); if (!group) return;
  const members = partsInGroup(group.id);
  if (!window.confirm(`グループ「${group.name}」を削除しますか？\nパーツ ${members.length}個と、そのタイムラインキーも削除されます。`)) return;
  stopAnimation(true); stopTest(); commitAnimationPreview(); pushHistory();
  const ids = new Set(members.map(p=>p.id));
  state.parts.filter(p => !ids.has(p.id) && p.parentId && ids.has(p.parentId)).forEach(child => reparentPreserveWorld(child, ''));
  members.forEach(part => { delete state.animation.tracks[part.id]; });
  state.parts = state.parts.filter(p => !ids.has(p.id));
  const idx = state.groups.findIndex(g=>g.id===group.id);
  state.groups = state.groups.filter(g=>g.id!==group.id);
  if (!state.groups.length) state.groups = [{ id:makeGroupId(), name:'未分類', visible:true }];
  state.activeGroupId = state.groups[Math.min(Math.max(idx,0), state.groups.length-1)].id;
  state.selectedId = partsInGroup(state.activeGroupId)[0]?.id || state.parts[0]?.id || null;
  clearKeySelection(false); setGroupMoveMode(false); normalizeOrders(); refreshGroupSelects(); renderParts(); syncAnimationUi();
  markChanged(`グループ削除: ${group.name}`);
}

function freshAnimation() {
  return {
    name: 'walk01', duration: 1000, loop: true, currentTime: 0,
    tracks: {}, areaKeys: [], playing: false, raf: 0, playStartedAt: 0, playStartTime: 0,
    previewActive: false, previewPose: null,
    selectedGroupId: null, selectedKeyTime: null, keyDraftTime: null, keyDirty: false,
    timelineCollapsed: false, tracksHidden: false, onionSkin: true
  };
}
function cloneTrackKey(key) { return { ...key }; }
function cloneAreaKey(key) { return { ...key }; }
function cloneTrack(track) { return { partId:track.partId, fileName:track.fileName, name:track.name, keys:(track.keys||[]).map(cloneTrackKey) }; }
function animationForSnapshot() {
  const a = state.animation; const tracks = {};
  Object.entries(a.tracks || {}).forEach(([id, track]) => tracks[id] = cloneTrack(track));
  return {
    name:a.name, duration:a.duration, loop:a.loop, currentTime:a.currentTime,
    tracks, areaKeys:(a.areaKeys||[]).map(cloneAreaKey),
    selectedGroupId:a.selectedGroupId || null, selectedKeyTime:a.selectedKeyTime,
    keyDraftTime:a.keyDraftTime, keyDirty:!!a.keyDirty,
    timelineCollapsed:!!a.timelineCollapsed, tracksHidden:!!a.tracksHidden, onionSkin:a.onionSkin !== false
  };
}
function ensureTrack(part) {
  if (!part) return null;
  let track = state.animation.tracks[part.id];
  if (!track) { track = { partId:part.id, fileName:part.fileName, name:part.name, keys:[] }; state.animation.tracks[part.id] = track; }
  track.fileName = part.fileName; track.name = part.name; return track;
}
function trackForPart(part) { return part ? state.animation.tracks[part.id] || null : null; }
function sortedTrackKeys(track) { return [...(track?.keys || [])].sort((a,b)=>a.time-b.time); }
function totalTrackKeyCount() { return Object.values(state.animation.tracks || {}).reduce((n,t)=>n+(t.keys?.length||0),0); }
function groupKeyTimes(groupId) {
  const times=[]; partsInGroup(groupId).forEach(part => (trackForPart(part)?.keys||[]).forEach(k=>times.push(Math.round(k.time))));
  return [...new Set(times)].sort((a,b)=>a-b);
}
function groupHasKeyAt(groupId,time,ignoreTime=null) {
  return groupKeyTimes(groupId).some(t => Math.abs(t-time)<=1 && (ignoreTime==null || Math.abs(t-ignoreTime)>1));
}
function capturePartPose(part) {
  if (state.animation.previewActive && state.animation.previewPose) {
    const pp = state.animation.previewPose.parts.get(part.id); if (pp) return { x:pp.x,y:pp.y,width:pp.width,rotation:pp.rotation,deformAmount:num(pp.deformAmount,part.deformAmount||0) };
  }
  return { x:part.x,y:part.y,width:part.width,rotation:part.rotation,deformAmount:num(part.deformAmount,0) };
}
function interpolationPair(keys, time, loop, duration) {
  const sorted=[...(keys||[])].sort((a,b)=>a.time-b.time);
  if (!sorted.length) return null;
  if (sorted.length === 1) return { a:sorted[0], b:sorted[0], t:sorted[0].time, aTime:sorted[0].time, bTime:sorted[0].time };

  const d=Math.max(1,num(duration,1));
  const t=clamp(num(time,0),0,d);
  const first=sorted[0], last=sorted[sorted.length-1];

  // Exact keys should always win, including 0ms and duration-ms keys.
  const exact=sorted.find(k=>Math.abs(num(k.time,0)-t)<0.0001);
  if (exact) return { a:exact,b:exact,t,aTime:t,bTime:t };

  // Normal segment inside the recorded key range.
  for(let i=0;i<sorted.length-1;i++) {
    const a=sorted[i], b=sorted[i+1];
    if(t>a.time && t<b.time) return { a,b,t,aTime:a.time,bTime:b.time };
  }

  if (!loop) {
    if (t<first.time) return { before:true, first };
    return { a:last,b:last,t,aTime:last.time,bTime:last.time };
  }

  // Loop segment: last key -> virtual copy of first key in the next cycle.
  // If the playhead is before the first key, view it as time+duration so the
  // same continuous segment spans the timeline boundary.
  const wrappedT = t < first.time ? t + d : t;
  return {
    a:last,
    b:first,
    t:wrappedT,
    aTime:last.time,
    bTime:first.time + d
  };
}
function interpolateKeyValues(keys, time, fallback) {
  const pair=interpolationPair(keys,time,!!state.animation.loop,state.animation.duration);
  if(!pair) return {...fallback};
  if(pair.before) return {...fallback};
  const {a,b,t,aTime,bTime}=pair;
  const span=Math.max(0.0001,bTime-aTime), f=a===b?0:clamp((t-aTime)/span,0,1);
  return { x:lerp(num(a.x,fallback.x),num(b.x,a.x),f), y:lerp(num(a.y,fallback.y),num(b.y,a.y),f), width:lerp(num(a.width,fallback.width),num(b.width,a.width),f), rotation:lerpAngle(num(a.rotation,fallback.rotation),num(b.rotation,a.rotation),f), deformAmount:lerp(num(a.deformAmount,fallback.deformAmount||0),num(b.deformAmount,a.deformAmount??fallback.deformAmount??0),f) };
}
function interpolateAreaAt(time) {
  const fallback={x:state.area.x,y:state.area.y};
  const pair=interpolationPair(state.animation.areaKeys||[],time,!!state.animation.loop,state.animation.duration);
  if(!pair) return fallback;
  if(pair.before) return fallback;
  const {a,b,t,aTime,bTime}=pair;
  const span=Math.max(0.0001,bTime-aTime), f=a===b?0:clamp((t-aTime)/span,0,1);
  return {x:lerp(num(a.x,fallback.x),num(b.x,a.x),f),y:lerp(num(a.y,fallback.y),num(b.y,a.y),f)};
}
function interpolatedPoseAt(time) {
  if (!totalTrackKeyCount() && !(state.animation.areaKeys||[]).length) return null;
  const pose={area:interpolateAreaAt(time),parts:new Map()};
  state.parts.forEach(part=>{ const fallback={x:part.x,y:part.y,width:part.width,rotation:part.rotation,deformAmount:num(part.deformAmount,0)}; const track=trackForPart(part); pose.parts.set(part.id, interpolateKeyValues(track?.keys||[],time,fallback)); });
  return pose;
}
function localMatrixFromPose(part, pose) {
  const x=pose?.x??part.x, y=pose?.y??part.y, rotation=pose?.rotation??part.rotation;
  return multiply(translate(x,y),multiply(translate(part.pivotX,part.pivotY),multiply(rotate(rotation),translate(-part.pivotX,-part.pivotY))));
}
function worldMatrixFromPose(part, poseMap, cache=new Map()) {
  if(!part)return identity(); if(cache.has(part.id))return cache.get(part.id);
  const local=localMatrixFromPose(part,poseMap?.get(part.id)); const parent=part.parentId?partById(part.parentId):null;
  const result=parent?multiply(worldMatrixFromPose(parent,poseMap,cache),local):local; cache.set(part.id,result); return result;
}

const DEFORM_SLICES = 12;
function ensureDeformStructure(node, part) {
  const base = $('.part-base-image', node) || $('img', node);
  let slices = $('.deform-slices', node);
  if (!slices) {
    slices = document.createElement('div');
    slices.className = 'deform-slices';
    slices.hidden = true;
    node.insertBefore(slices, node.querySelector('.pivot-cross') || null);
  }
  return { base, slices };
}
function ensureSliceCount(container, part, orientation) {
  const signature = `${orientation}|${part.objectUrl || ''}`;
  if (container.dataset.signature === signature && container.children.length === DEFORM_SLICES) return;
  container.replaceChildren();
  container.dataset.signature = signature;
  for (let i=0;i<DEFORM_SLICES;i++) {
    const slice=document.createElement('div'); slice.className='deform-slice';
    const img=document.createElement('img'); img.src=part.objectUrl || ''; img.alt=''; img.draggable=false;
    slice.appendChild(img); container.appendChild(slice);
  }
}
function applyDeformVisual(node, part, posePart=null) {
  if (!node || !part) return;
  const {base,slices}=ensureDeformStructure(node,part);
  const width=Math.max(1,num(posePart?.width,part.width));
  const ratio=(num(part.naturalWidth,1)>0)?num(part.naturalHeight,1)/num(part.naturalWidth,1):1;
  const height=Math.max(1,width*ratio);
  node.style.height=`${height}px`;
  if (base) { base.src=part.objectUrl || base.src; base.style.display='block'; }
  const mode=part.deformMode || 'none';
  const amount=clamp(num(posePart?.deformAmount,part.deformAmount||0),-100,100);
  const anchor=part.deformAnchor || 'top';
  const active=mode==='bend' && Math.abs(amount)>.01 && !!part.objectUrl;
  slices.hidden=!active;
  if (!active) return;
  if (base) base.style.display='none';
  const horizontal = anchor==='top' || anchor==='bottom';
  const orientation=horizontal?'h':'v';
  ensureSliceCount(slices,part,orientation);
  slices.style.width=`${width}px`; slices.style.height=`${height}px`;
  const maxShift=(amount/100)*(horizontal?width:height)*0.35;
  [...slices.children].forEach((slice,i)=>{
    const img=slice.firstElementChild;
    const center=(i+.5)/DEFORM_SLICES;
    const t=(anchor==='bottom'||anchor==='right')?1-center:center;
    const shift=maxShift*t*t;
    if (horizontal) {
      const top=i*height/DEFORM_SLICES, h=height/DEFORM_SLICES+1.2;
      Object.assign(slice.style,{left:'0px',top:`${top}px`,width:`${width}px`,height:`${h}px`,transform:`translate3d(${shift}px,0,0)`});
      Object.assign(img.style,{left:'0px',top:`${-top}px`,width:`${width}px`,height:`${height}px`});
    } else {
      const left=i*width/DEFORM_SLICES, w=width/DEFORM_SLICES+1.2;
      Object.assign(slice.style,{left:`${left}px`,top:'0px',width:`${w}px`,height:`${height}px`,transform:`translate3d(0,${shift}px,0)`});
      Object.assign(img.style,{left:`${-left}px`,top:'0px',width:`${width}px`,height:`${height}px`});
    }
  });
}

function bonePoint(part, poseMap=null, offsets=null, cache=new Map()) {
  const m=poseMap ? worldMatrixFromPose(part,poseMap,cache) : worldMatrix(part,offsets,cache);
  return transformPoint(m,part.pivotX,part.pivotY);
}
function renderBoneOverlay(poseMap=null, offsets=null) {
  if (!boneLayer) return;
  boneLayer.replaceChildren();
  if (!state.boneVisible || !activeGroup() || activeGroup().visible===false) { boneLayer.hidden=true; return; }
  boneLayer.hidden=false;
  boneLayer.setAttribute('width',String(state.area.width));
  boneLayer.setAttribute('height',String(state.area.height));
  const members=partsInGroup(state.activeGroupId).filter(p=>p.visible);
  const memberIds=new Set(members.map(p=>p.id));
  const cache=new Map();
  const ns='http://www.w3.org/2000/svg';
  members.forEach(part=>{
    const child=bonePoint(part,poseMap,offsets,cache);
    const parent=part.parentId?partById(part.parentId):null;
    if (parent && memberIds.has(parent.id)) {
      const pp=bonePoint(parent,poseMap,offsets,cache);
      const line=document.createElementNS(ns,'line');
      line.setAttribute('x1',pp.x);line.setAttribute('y1',pp.y);line.setAttribute('x2',child.x);line.setAttribute('y2',child.y);line.setAttribute('class','bone-line');
      boneLayer.appendChild(line);
    }
  });
  members.forEach(part=>{
    const p=bonePoint(part,poseMap,offsets,cache);
    const c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',part.id===state.selectedId?'7':'5');
    c.setAttribute('class',`bone-joint${part.id===state.selectedId?' selected':''}`);
    boneLayer.appendChild(c);
  });
}

function applyPreviewPose(pose) {
  if(!pose)return; characterArea.style.left=`${pose.area.x}px`; characterArea.style.top=`${pose.area.y}px`; const cache=new Map();
  state.parts.forEach(part=>{ const node=getPartNode(part.id); if(!node)return; const pp=pose.parts.get(part.id), m=worldMatrixFromPose(part,pose.parts,cache); node.style.width=`${pp?.width??part.width}px`; node.style.transformOrigin='0 0'; node.style.transform=`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`; node.style.zIndex=String(effectiveZIndex(part)); node.classList.toggle('hidden-layer',!part.visible || !isGroupVisible(part.groupId)); applyDeformVisual(node,part,pp); });
  renderBoneOverlay(pose.parts,null);
}

function clearOnionLayers() {
  [onionPrevLayer,onionNextLayer].forEach(layer => {
    if (!layer) return;
    layer.replaceChildren();
    layer.hidden = true;
  });
}
function adjacentGroupKeyTimes(groupId, time) {
  const times = groupKeyTimes(groupId);
  if (times.length < 2) return { prev:null, next:null };
  const t = num(time,0);
  const exactIndex = times.findIndex(v => Math.abs(v-t)<=1);
  let prev = null, next = null;
  if (exactIndex >= 0) {
    prev = exactIndex > 0 ? times[exactIndex-1] : (state.animation.loop ? times[times.length-1] : null);
    next = exactIndex < times.length-1 ? times[exactIndex+1] : (state.animation.loop ? times[0] : null);
  } else {
    prev = [...times].reverse().find(v => v < t) ?? (state.animation.loop ? times[times.length-1] : null);
    next = times.find(v => v > t) ?? (state.animation.loop ? times[0] : null);
  }
  if (prev != null && next != null && Math.abs(prev-next)<=1) next = null;
  return { prev, next };
}
function renderOnionPose(layer, groupId, time) {
  if (!layer) return;
  layer.replaceChildren();
  const group = groupById(groupId);
  if (!group || group.visible === false) { layer.hidden=true; return; }
  const pose = interpolatedPoseAt(time);
  if (!pose) { layer.hidden=true; return; }
  layer.hidden=false;
  layer.style.left=`${pose.area.x}px`;
  layer.style.top=`${pose.area.y}px`;
  const cache=new Map();
  partsInGroup(groupId).forEach(part => {
    if (!part.visible || !part.objectUrl) return;
    const pp=pose.parts.get(part.id);
    const m=worldMatrixFromPose(part,pose.parts,cache);
    const node=document.createElement('div');
    node.className='onion-part';
    node.style.width=`${pp?.width??part.width}px`;
    node.style.transform=`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
    node.style.zIndex=String(part.order||1);
    const img=document.createElement('img');
    img.className='part-base-image';
    img.src=part.objectUrl;
    img.alt='';
    img.draggable=false;
    const slices=document.createElement('div'); slices.className='deform-slices'; slices.hidden=true;
    node.append(img,slices);
    applyDeformVisual(node,part,pp);
    layer.appendChild(node);
  });
}
function renderOnionSkins() {
  if (!onionPrevLayer || !onionNextLayer) return;
  if (!state.animation.onionSkin || state.animation.playing || state.testRunning) {
    clearOnionLayers(); return;
  }
  const group=activeGroup();
  if (!group || group.visible===false || !partsInGroup(group.id).length) { clearOnionLayers(); return; }
  const reference = hasSelectedGroupKey()
    ? num(state.animation.keyDraftTime ?? state.animation.selectedKeyTime, state.animation.currentTime)
    : state.animation.currentTime;
  const {prev,next}=adjacentGroupKeyTimes(group.id,reference);
  if (prev == null) { onionPrevLayer.replaceChildren(); onionPrevLayer.hidden=true; }
  else renderOnionPose(onionPrevLayer,group.id,prev);
  if (next == null) { onionNextLayer.replaceChildren(); onionNextLayer.hidden=true; }
  else renderOnionPose(onionNextLayer,group.id,next);
}

function applyAnimationPreview(time,{renderTracks=false}={}) {
  const pose=interpolatedPoseAt(time); state.animation.currentTime=clamp(time,0,state.animation.duration); syncTimelineReadout();
  if(!pose){state.animation.previewActive=false;state.animation.previewPose=null;syncArea();applyAllPartStyles();renderOnionSkins();return;}
  state.animation.previewActive=true;state.animation.previewPose=pose;applyPreviewPose(pose);syncInspector(); if(renderTracks)renderTrackList(); renderOnionSkins();
}
function commitAnimationPreview() {
  if(!state.animation.previewActive||!state.animation.previewPose)return false; const pose=state.animation.previewPose;
  state.area.x=pose.area.x;state.area.y=pose.area.y; state.parts.forEach(part=>{const pp=pose.parts.get(part.id);if(!pp)return;part.x=pp.x;part.y=pp.y;part.width=pp.width;part.rotation=pp.rotation;part.deformAmount=num(pp.deformAmount,part.deformAmount||0);});
  state.animation.previewActive=false;state.animation.previewPose=null;syncArea();applyAllPartStyles();syncInspector();return true;
}
function clearAnimationPreview({restore=true}={}) {state.animation.previewActive=false;state.animation.previewPose=null;if(restore){syncArea();applyAllPartStyles();syncInspector();}renderOnionSkins();}
function clearKeySelection(render=true){state.animation.selectedGroupId=null;state.animation.selectedKeyTime=null;state.animation.keyDraftTime=null;state.animation.keyDirty=false;syncKeyEditUi();if(render)renderTrackList();}
function selectGroupKey(groupId,time,{preview=true}={}) {
  stopAnimation(true); state.animation.selectedGroupId=groupId;state.animation.selectedKeyTime=Math.round(time);state.animation.keyDraftTime=Math.round(time);state.animation.keyDirty=false;state.animation.currentTime=time;
  state.activeGroupId=groupId;refreshGroupSelects(); const members=partsInGroup(groupId); if(!selectedPart()||selectedPart().groupId!==groupId)state.selectedId=members[0]?.id||null;
  if(preview)applyAnimationPreview(time); renderLayers();renderHierarchy();refreshParentSelect();syncInspector();syncKeyEditUi();syncTimelineReadout();renderTrackList();renderOnionSkins();
}
function hasSelectedGroupKey(){return !!state.animation.selectedGroupId && state.animation.selectedKeyTime!=null;}
function setSelectedKeyDirty(dirty=true){if(!hasSelectedGroupKey())return;state.animation.keyDirty=!!dirty;syncKeyEditUi();renderTrackList();}
function markSelectedKeyPoseDirty(){if(!hasSelectedGroupKey())return;setSelectedKeyDirty(true);}
function syncKeyEditUi(){
  const has=hasSelectedGroupKey(), group=groupById(state.animation.selectedGroupId), original=has?Math.round(state.animation.selectedKeyTime):0, draft=has?Math.round(state.animation.keyDraftTime??original):0;
  inputs.selectedKeyTime.disabled=!has;inputs.selectedKeyTime.value=draft;overwriteKeyBtn.disabled=!has;duplicateKeyBtn.disabled=!has;deleteKeyBtn.disabled=!has;
  if(!has){selectedKeyLabel.textContent='キー未選択';keyEditStatus.textContent='グループ行の◆を選択';keyEditStatus.classList.remove('dirty');return;}
  selectedKeyLabel.textContent=`${group?.name||'グループ'} ${original}ms`;
  if(state.animation.keyDirty){keyEditStatus.textContent=`未確定 → ${draft}ms`;keyEditStatus.classList.add('dirty');} else {keyEditStatus.textContent='登録内容と同じ';keyEditStatus.classList.remove('dirty');}
}
function setSelectedKeyDraftTime(time,{render=true}={}){if(!hasSelectedGroupKey())return;const original=state.animation.selectedKeyTime;const t=Math.round(clamp(num(time,original),0,state.animation.duration));state.animation.keyDraftTime=t;state.animation.currentTime=t;state.animation.keyDirty=t!==Math.round(original)||state.animation.keyDirty;syncTimelineReadout();syncKeyEditUi();if(render)renderTrackList();renderOnionSkins();}
function writePartKey(part,time,pose,{replace=true}={}) {
  const track=ensureTrack(part); const existing=track.keys.find(k=>Math.abs(k.time-time)<=1);
  if(existing && replace) Object.assign(existing,{time,...pose});
  else if(!existing) track.keys.push({id:`key-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,time,...pose});
  track.keys.sort((a,b)=>a.time-b.time); return existing || track.keys.find(k=>Math.abs(k.time-time)<=1);
}
function addNewKeyframe(){
  stopAnimation(true); ensureGroups(); const group=activeGroup(), targets=partsInGroup(state.activeGroupId), t=Math.round(state.animation.currentTime);
  if(!group||!targets.length){animStatus.textContent='現在のグループにパーツがありません';return;}
  if(groupHasKeyAt(group.id,t)){selectGroupKey(group.id,t);animStatus.textContent=`${group.name} ${t}ms は登録済み`;return;}
  commitAnimationPreview();pushHistory();targets.forEach(part=>writePartKey(part,t,capturePartPose(part),{replace:false}));selectGroupKey(group.id,t,{preview:false});syncAnimationUi();markChanged(`${group.name} グループキー登録 ${t}ms`);
}
function overwriteSelectedKeyframe(){
  if(!hasSelectedGroupKey()){animStatus.textContent='上書きするグループキーを選択';return;}
  const groupId=state.animation.selectedGroupId, group=groupById(groupId), original=Math.round(state.animation.selectedKeyTime), t=Math.round(state.animation.keyDraftTime??original), targets=partsInGroup(groupId);
  if(groupHasKeyAt(groupId,t,original)){animStatus.textContent=`${t}msには同グループの別キーがあります`;return;}
  stopAnimation(true);commitAnimationPreview();pushHistory();
  targets.forEach(part=>{const track=ensureTrack(part);track.keys=track.keys.filter(k=>Math.abs(k.time-original)>1);writePartKey(part,t,capturePartPose(part),{replace:true});});
  state.animation.selectedKeyTime=t;state.animation.keyDraftTime=t;state.animation.keyDirty=false;state.animation.currentTime=t;applyAnimationPreview(t);syncAnimationUi();markChanged(`${group?.name||'グループ'} キー上書き ${t}ms`);
}
function findDuplicateGroupTime(groupId,sourceTime){const occupied=new Set(groupKeyTimes(groupId)),duration=Math.round(state.animation.duration);for(const c of [sourceTime+100,sourceTime-100]){const t=Math.round(clamp(c,0,duration));if(!occupied.has(t))return t;}for(let d=1;d<=duration;d++){if(sourceTime+d<=duration&&!occupied.has(sourceTime+d))return sourceTime+d;if(sourceTime-d>=0&&!occupied.has(sourceTime-d))return sourceTime-d;}return null;}
function duplicateSelectedKeyframe(){
  if(!hasSelectedGroupKey()){animStatus.textContent='複製するグループキーを選択';return;}
  const groupId=state.animation.selectedGroupId, source=Math.round(state.animation.selectedKeyTime), t=findDuplicateGroupTime(groupId,source);if(t==null){animStatus.textContent='空き時刻がありません';return;}
  const pose=interpolatedPoseAt(source);pushHistory();partsInGroup(groupId).forEach(part=>{const pp=pose?.parts.get(part.id)||capturePartPose(part);writePartKey(part,t,{x:pp.x,y:pp.y,width:pp.width,rotation:pp.rotation,deformAmount:num(pp.deformAmount,part.deformAmount||0)},{replace:false});});selectGroupKey(groupId,t);markChanged(`${groupById(groupId)?.name||'グループ'} キー複製 ${source}→${t}ms`);
}
function deleteCurrentKeyframe(){
  if(!hasSelectedGroupKey()){animStatus.textContent='削除するグループキーを選択';return;}
  const groupId=state.animation.selectedGroupId,t=Math.round(state.animation.selectedKeyTime);pushHistory();partsInGroup(groupId).forEach(part=>{const track=trackForPart(part);if(track)track.keys=track.keys.filter(k=>Math.abs(k.time-t)>1);});clearKeySelection(false);syncAnimationUi();applyAnimationPreview(state.animation.currentTime);markChanged('グループキー削除');
}
function syncTimelineReadout(){const t=Math.round(state.animation.currentTime);inputs.animTime.value=t;timelineSlider.max=String(Math.max(1,state.animation.duration));timelineSlider.value=String(clamp(t,0,state.animation.duration));if(timelineEndLabel)timelineEndLabel.textContent=`${Math.round(state.animation.duration)}ms`;}
function renderTrackList(){
  if(!trackList)return;ensureGroups();trackList.innerHTML='';const duration=Math.max(1,state.animation.duration);const groups=state.groups.filter(g=>partsInGroup(g.id).length);
  if(!groups.length){trackList.innerHTML='<div class="track-empty">グループを作成してパーツを追加すると表示されます</div>';return;}
  groups.forEach(group=>{
    const row=document.createElement('div');row.className=`track-row${group.id===state.activeGroupId?' selected-part':''}${group.visible===false?' group-hidden':''}`;
    const label=document.createElement('button');label.type='button';label.className='track-label';label.textContent=group.name;label.title=`${group.name} (${partsInGroup(group.id).length}パーツ)`;label.addEventListener('click',()=>switchActiveGroup(group.id));
    const lane=document.createElement('div');lane.className='track-lane';const playhead=document.createElement('span');playhead.className='track-playhead';playhead.style.left=`${clamp(state.animation.currentTime/duration,0,1)*100}%`;lane.appendChild(playhead);
    groupKeyTimes(group.id).forEach(time=>{
      const selected=state.animation.selectedGroupId===group.id&&Math.abs(state.animation.selectedKeyTime-time)<=1;const displayTime=selected&&state.animation.keyDraftTime!=null?state.animation.keyDraftTime:time;
      const marker=document.createElement('button');marker.type='button';marker.className=`track-key${selected?' selected':''}${selected&&state.animation.keyDirty?' draft':''}`;marker.style.left=`${clamp(displayTime/duration,0,1)*100}%`;marker.title=`${group.name} ${Math.round(displayTime)}ms`;
      marker.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();stopAnimation(true);if(!selected)selectGroupKey(group.id,time);let dragged=false;const sx=e.clientX;marker.setPointerCapture?.(e.pointerId);const move=ev=>{if(Math.abs(ev.clientX-sx)>2)dragged=true;if(!dragged)return;const rect=lane.getBoundingClientRect();const ratio=rect.width?clamp((ev.clientX-rect.left)/rect.width,0,1):0;const draft=Math.round(ratio*state.animation.duration);setSelectedKeyDraftTime(draft,{render:false});marker.style.left=`${clamp(draft/state.animation.duration,0,1)*100}%`;marker.title=`${group.name} ${draft}ms`;};const up=()=>{marker.removeEventListener('pointermove',move);marker.removeEventListener('pointerup',up);marker.removeEventListener('pointercancel',up);renderTrackList();};marker.addEventListener('pointermove',move);marker.addEventListener('pointerup',up);marker.addEventListener('pointercancel',up);});
      lane.appendChild(marker);
    });
    row.append(label,lane);trackList.appendChild(row);
  });
}
function totalGroupKeyCount(){return state.groups.reduce((n,g)=>n+groupKeyTimes(g.id).length,0);}

function updateChromeMetrics(){
  const headerH=Math.ceil(appHeader?.getBoundingClientRect().height||0);
  const timelineH=Math.ceil(animationPanel?.getBoundingClientRect().height||0);
  document.documentElement.style.setProperty('--editor-header-h',`${headerH}px`);
  document.documentElement.style.setProperty('--editor-timeline-h',`${timelineH}px`);
}
function syncAnimationUi(){motionName.value=state.animation.name;inputs.animDuration.value=Math.round(state.animation.duration);animLoop.checked=!!state.animation.loop;syncTimelineReadout();animStatus.textContent=`${totalGroupKeyCount()} group key / ${state.groups.filter(g=>groupKeyTimes(g.id).length).length} group`;syncKeyEditUi();renderTrackList();timelineBody.hidden=!!state.animation.timelineCollapsed;timelineCollapseBtn.textContent=state.animation.timelineCollapsed?'+':'−';trackViewport.hidden=!!state.animation.tracksHidden;trackRowsToggleBtn.textContent=state.animation.tracksHidden?'トラックを表示':'トラックを隠す';if(onionSkinToggle)onionSkinToggle.checked=state.animation.onionSkin!==false;renderOnionSkins();requestAnimationFrame(updateChromeMetrics);}
function setAnimationTime(time,preview=true){stopAnimation(true);const t=clamp(num(time,0),0,state.animation.duration);if(preview)applyAnimationPreview(t,{renderTracks:true});else{state.animation.currentTime=t;syncTimelineReadout();renderTrackList();}}
function jumpKey(direction){
  let groupId=state.animation.selectedGroupId||state.activeGroupId;let items=groupKeyTimes(groupId).map(time=>({groupId,time}));
  if(!items.length)state.groups.forEach(g=>groupKeyTimes(g.id).forEach(time=>items.push({groupId:g.id,time})));items.sort((a,b)=>a.time-b.time);if(!items.length)return;
  const t=state.animation.currentTime;let target;if(direction<0)target=[...items].reverse().find(x=>x.time<t-1)||items[0];else target=items.find(x=>x.time>t+1)||items[items.length-1];selectGroupKey(target.groupId,target.time);
}
function startAnimation(){stopTest();disableIkMode(true);clearOnionLayers();if(totalTrackKeyCount()<2){animStatus.textContent='キーを2つ以上登録';return;}stopAnimation(true);let startTime=state.animation.currentTime;if(startTime>=state.animation.duration-1)startTime=0;state.animation.playing=true;state.animation.playStartedAt=performance.now();state.animation.playStartTime=startTime;document.body.classList.add('animation-playing');$('#playAnimBtn').classList.add('active');animStatus.textContent='再生中';const frame=now=>{if(!state.animation.playing)return;const elapsed=now-state.animation.playStartedAt;let t=state.animation.playStartTime+elapsed;if(state.animation.loop)t=t%Math.max(1,state.animation.duration);else if(t>=state.animation.duration){t=state.animation.duration;applyAnimationPreview(t);stopAnimation(true);renderTrackList();return;}applyAnimationPreview(t);renderTrackList();state.animation.raf=requestAnimationFrame(frame);};state.animation.raf=requestAnimationFrame(frame);}
function stopAnimation(keepPreview=true){if(state.animation.raf)cancelAnimationFrame(state.animation.raf);state.animation.raf=0;const was=state.animation.playing;state.animation.playing=false;document.body.classList.remove('animation-playing');$('#playAnimBtn')?.classList.remove('active');if(!keepPreview)clearAnimationPreview();if(was){animStatus.textContent=`${totalGroupKeyCount()} group key`;renderTrackList();}renderOnionSkins();}
function applyAnimationSnapshot(saved){const fresh=freshAnimation();const tracks={};Object.entries(saved?.tracks||{}).forEach(([id,t])=>tracks[id]=cloneTrack(t));state.animation={...fresh,name:saved?.name||fresh.name,duration:Math.max(100,num(saved?.duration,fresh.duration)),loop:saved?.loop!==false,currentTime:clamp(num(saved?.currentTime,0),0,Math.max(100,num(saved?.duration,fresh.duration))),tracks,areaKeys:Array.isArray(saved?.areaKeys)?saved.areaKeys.map(cloneAreaKey):[],selectedGroupId:saved?.selectedGroupId||null,selectedKeyTime:saved?.selectedKeyTime??null,keyDraftTime:saved?.keyDraftTime??null,keyDirty:!!saved?.keyDirty,timelineCollapsed:!!saved?.timelineCollapsed,tracksHidden:!!saved?.tracksHidden,onionSkin:saved?.onionSkin!==false};}

motionName.addEventListener('change',()=>{state.animation.name=motionName.value.trim()||'motion';markChanged('モーション名変更');});
animLoop.addEventListener('change',()=>{state.animation.loop=animLoop.checked;markChanged('ループ設定変更');});
timelineSlider.addEventListener('input',()=>{stopAnimation(true);clearKeySelection();applyAnimationPreview(num(timelineSlider.value,0),{renderTracks:true});});
$('#addKeyBtn').addEventListener('click',addNewKeyframe);overwriteKeyBtn.addEventListener('click',overwriteSelectedKeyframe);duplicateKeyBtn.addEventListener('click',duplicateSelectedKeyframe);deleteKeyBtn.addEventListener('click',deleteCurrentKeyframe);$('#prevKeyBtn').addEventListener('click',()=>jumpKey(-1));$('#nextKeyBtn').addEventListener('click',()=>jumpKey(1));$('#playAnimBtn').addEventListener('click',startAnimation);$('#stopAnimBtn').addEventListener('click',()=>stopAnimation(true));
timelineCollapseBtn.addEventListener('click',e=>{e.stopPropagation();state.animation.timelineCollapsed=!state.animation.timelineCollapsed;syncAnimationUi();});
trackRowsToggleBtn.addEventListener('click',()=>{state.animation.tracksHidden=!state.animation.tracksHidden;syncAnimationUi();});

trackViewport.addEventListener('wheel',e=>{e.stopPropagation();},{passive:true});
trackViewport.addEventListener('pointerdown',e=>{e.stopPropagation();});
trackViewport.addEventListener('touchstart',e=>{e.stopPropagation();},{passive:true});
trackViewport.addEventListener('touchmove',e=>{e.stopPropagation();},{passive:true});

onionSkinToggle?.addEventListener('change',()=>{state.animation.onionSkin=onionSkinToggle.checked;renderOnionSkins();markChanged(state.animation.onionSkin?'オニオンスキンON':'オニオンスキンOFF');});


function toggleActiveGroupVisibility() {
  const group=activeGroup(); if(!group) return;
  pushHistory();
  group.visible = group.visible === false;
  if (state.animation.previewActive && state.animation.previewPose) applyPreviewPose(state.animation.previewPose);
  else applyAllPartStyles();
  renderLayers();
  syncGroupLayerButtons();
  renderOnionSkins();
  markChanged(group.visible ? `グループ表示: ${group.name}` : `グループ非表示: ${group.name}`);
}

partGroupSelect.addEventListener('change',()=>switchActiveGroup(partGroupSelect.value));
layerGroupSelect.addEventListener('change',()=>switchActiveGroup(layerGroupSelect.value));
newGroupBtn.addEventListener('click',createGroupFromUi);
layerNewGroupBtn.addEventListener('click',createGroupFromUi);
groupBackBtn?.addEventListener('click',()=>moveActiveGroupLayer(-1));
groupFrontBtn?.addEventListener('click',()=>moveActiveGroupLayer(1));
groupVisibilityBtn?.addEventListener('click',toggleActiveGroupVisibility);
renameGroupBtn?.addEventListener('click', renameActiveGroup);
duplicateGroupBtn?.addEventListener('click', duplicateActiveGroup);
shiftGroupTimeBtn?.addEventListener('click', shiftActiveGroupKeys);
groupMoveBtn?.addEventListener('click', ()=>setGroupMoveMode(!state.groupMoveMode));
deleteGroupBtn?.addEventListener('click', deleteActiveGroup);

// ---------- history ----------
function snapshot() {
  return {
    stage: { ...state.stage },
    area: { ...state.area },
    parts: state.parts.map(p => ({ ...p })),
    groups: state.groups.map(g => ({ ...g })),
    activeGroupId: state.activeGroupId,
    boneVisible: !!state.boneVisible,
    selectedId: state.selectedId,
    animation: animationForSnapshot()
  };
}
function restoreSnapshot(snap) {
  stopTest();
  setGroupMoveMode(false);
  disableIkMode(true);
  state.stage = { ...snap.stage };
  state.area = { ...snap.area };
  state.parts = snap.parts.map(p => ({ ...p }));
  state.groups = (snap.groups || [{id:'group-default',name:'未分類'}]).map(g=>({...g}));
  state.activeGroupId = snap.activeGroupId || state.groups[0]?.id || 'group-default';
  state.boneVisible = !!snap.boneVisible;
  toggleBoneBtn?.classList.toggle('active',state.boneVisible);
  if(toggleBoneBtn){toggleBoneBtn.textContent=state.boneVisible?'ボーン表示中':'ボーン表示';toggleBoneBtn.setAttribute('aria-pressed',state.boneVisible?'true':'false');}
  ensureGroups();
  refreshGroupSelects();
  applyAnimationSnapshot(snap.animation || freshAnimation());
  state.selectedId = snap.selectedId && state.parts.some(p => p.id === snap.selectedId) ? snap.selectedId : (state.parts.at(-1)?.id || null);
  syncStage();
  syncArea();
  renderParts();
  syncAnimationUi();
  updateHistoryButtons();
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
  renderBoneOverlay(state.animation?.previewActive?state.animation.previewPose?.parts:null,null);
}

// ---------- rendering ----------
function applyPartStyle(part, node = getPartNode(part.id), offsets = null, cache = new Map()) {
  if (!node) return;
  const m = worldMatrix(part, offsets, cache);
  node.style.width = `${part.width}px`;
  node.style.transformOrigin = '0 0';
  node.style.transform = `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
  node.style.zIndex = String(effectiveZIndex(part));
  node.classList.toggle('hidden-layer', !part.visible || !isGroupVisible(part.groupId));
  const pivot = $('.pivot-cross', node);
  pivot.style.left = `${part.pivotX}px`;
  pivot.style.top = `${part.pivotY}px`;
  applyDeformVisual(node,part,null);
}
function applyAllPartStyles(offsets = null) {
  const cache = new Map();
  state.parts.forEach(part => applyPartStyle(part, getPartNode(part.id), offsets, cache));
  renderBoneOverlay(null,offsets);
}
function renderParts() {
  stopTest();
  stopAnimation(false);
  $$('.rig-part', characterArea).forEach(el => el.remove());
  [...state.parts].sort((a,b) => a.order - b.order).forEach(part => {
    const node = partTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = part.id;
    const img = $('.part-base-image', node);
    if (part.objectUrl) img.src = part.objectUrl;
    img.alt = part.name;
    characterArea.appendChild(node);
    node.addEventListener('pointerdown', onPartPointerDown);
    node.addEventListener('click', onPartClick);
    const cross = $('.pivot-cross', node);
    cross.addEventListener('pointerdown', onPivotPointerDown);
  });
  applyAllPartStyles();
  ensureGroups(); refreshGroupSelects();
  renderLayers();
  renderHierarchy();
  refreshParentSelect();
  syncInspector();
  refreshIkUi();
  updateIkTargetVisual();
  syncAnimationUi();
  renderOnionSkins();
}


// ---------- flat layer panel ----------
function renderLayers() {
  ensureGroups(); refreshGroupSelects(); layerList.innerHTML = '';
  const members = partsInGroup(state.activeGroupId);
  if (!members.length) { layerList.innerHTML = '<div class="layer-empty">このグループにはパーツがありません</div>'; return; }
  [...members].sort((a,b) => b.order - a.order).forEach(part => {
    const row = document.createElement('div');
    row.className = `layer-row${part.id === state.selectedId ? ' selected' : ''}`; row.dataset.id = part.id;
    row.innerHTML = `<button class="layer-eye" type="button" title="表示/非表示">${part.visible ? '👁' : '—'}</button><button class="layer-name" type="button" title="${escapeHtml(part.name)}">${escapeHtml(part.name)}</button><button class="layer-move layer-up" type="button" title="手前へ">↑</button><button class="layer-move layer-down" type="button" title="奥へ">↓</button>`;
    $('.layer-eye', row).addEventListener('click', e => { e.stopPropagation(); pushHistory(); part.visible=!part.visible; applyPartStyle(part); renderLayers(); markChanged(part.visible?'レイヤー表示':'レイヤー非表示'); });
    $('.layer-name', row).addEventListener('click', () => selectPart(part.id));
    $('.layer-up', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, 1); });
    $('.layer-down', row).addEventListener('click', e => { e.stopPropagation(); moveLayer(part.id, -1); });
    layerList.appendChild(row);
  });
}
function moveLayer(id, direction) {
  const part=partById(id); if(!part)return; const ordered=partsInGroup(part.groupId).sort((a,b)=>a.order-b.order); const i=ordered.findIndex(p=>p.id===id),j=i+direction; if(i<0||j<0||j>=ordered.length)return;
  pushHistory(); const a=ordered[i],b=ordered[j]; [a.order,b.order]=[b.order,a.order]; applyAllPartStyles(); renderLayers(); markChanged(direction>0?'グループ内で手前へ':'グループ内で奥へ');
}
function normalizeOrders() {
  [...state.parts].sort((a,b) => a.order - b.order).forEach((p,i) => p.order = i + 1);
}

// ---------- hierarchy tree ----------

function renderHierarchy() {
  hierarchyTree.innerHTML = '';
  ensureGroups();
  const group = activeGroup();
  if (hierarchyGroupName) hierarchyGroupName.textContent = group ? group.name : '選択グループのみ';
  const members = group ? partsInGroup(group.id) : [];
  if (!members.length) {
    hierarchyTree.innerHTML = '<div class="tree-empty">このグループにはパーツがありません</div>';
    return;
  }
  const memberIds = new Set(members.map(p => p.id));
  // If a part is parented to another group, it becomes a visual root here.
  // The external connection is shown as a small badge but the other-group part itself is not displayed.
  const roots = members.filter(p => !p.parentId || !memberIds.has(p.parentId));
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
    const externalParent = part.parentId && !memberIds.has(part.parentId) ? partById(part.parentId) : null;
    if (externalParent) {
      const badge = document.createElement('span');
      badge.className = 'tree-external-parent';
      badge.textContent = `親: ${externalParent.name}`;
      badge.title = `別グループの親: ${externalParent.name}`;
      row.appendChild(badge);
    }
    hierarchyTree.appendChild(row);
    members.filter(p => p.parentId === part.id)
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
  commitAnimationPreview();
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
  ['pivotX','pivotY','deformAmount'].forEach(key => inputs[key].disabled = disabled || state.testRunning);
  deformMode.disabled = disabled || state.testRunning; deformAnchor.disabled = disabled || state.testRunning;
  parentSelect.disabled = disabled || locked;
  ['areaX','areaY','areaW','areaH'].forEach(key => inputs[key].disabled = state.pivotMode || state.testRunning);
  document.body.classList.toggle('pivot-mode', state.pivotMode);
  document.body.classList.toggle('ik-mode', state.ikMode);
  $$('.rotate-btn', controlPanel).forEach(b => b.disabled = disabled || locked || state.ikMode);
  $$('.nudge-btn', controlPanel).forEach(b => b.disabled = disabled || state.testRunning);
  if (controlFlipIkBtn) controlFlipIkBtn.disabled = !state.ikMode || state.testRunning;
  controlModeText.textContent = state.groupMoveMode ? 'グループ全体移動 1px / ドラッグ可' : (state.ikMode ? 'IKターゲットをドラッグ / 末端パーツを掴んでIK' : (state.pivotMode ? 'ピボット移動 1px / 十字を直接ドラッグ可' : 'パーツ移動 1px / 回転 1°'));

  if (!part) {
    selectedCoord.textContent = '未選択';
    selectedName.textContent = 'レイヤー / 親子ツリーから選択';
    deformMode.value='none'; deformAnchor.value='top'; inputs.deformAmount.value='0';
    return;
  }
  const previewPart = state.animation.previewActive ? state.animation.previewPose?.parts?.get(part.id) : null;
  inputs.partX.value = Math.round(previewPart?.x ?? part.x);
  inputs.partY.value = Math.round(previewPart?.y ?? part.y);
  inputs.partW.value = Math.round(previewPart?.width ?? part.width);
  inputs.partRot.value = Math.round(previewPart?.rotation ?? part.rotation);
  inputs.pivotX.value = Math.round(part.pivotX);
  inputs.pivotY.value = Math.round(part.pivotY);
  deformMode.value = part.deformMode || 'none';
  deformAnchor.value = part.deformAnchor || 'top';
  inputs.deformAmount.value = Math.round(num(previewPart?.deformAmount,part.deformAmount||0));
  parentSelect.value = part.parentId || '';
  selectedCoord.textContent = `X ${Math.round(previewPart?.x ?? part.x)} / Y ${Math.round(previewPart?.y ?? part.y)}`;
  selectedName.textContent = part.name;
}
function selectPart(id) {
  if (!id || !partById(id)) return;
  stopTest(); const part=partById(id);
  if (hasSelectedGroupKey() && state.animation.selectedGroupId !== part.groupId) clearKeySelection(false);
  state.selectedId = id; state.activeGroupId = part.groupId || state.activeGroupId; refreshGroupSelects();
  if (state.ikMode && !currentIkChain()) state.ikMode = false;
  renderLayers(); renderHierarchy(); refreshParentSelect(); syncInspector(); refreshIkUi(); syncKeyEditUi(); renderTrackList(); renderBoneOverlay(state.animation.previewActive?state.animation.previewPose?.parts:null,null);
}


// ---------- IK (2-bone) ----------
function currentIkChain() {
  const end = selectedPart();
  const lower = end?.parentId ? partById(end.parentId) : null;
  const upper = lower?.parentId ? partById(lower.parentId) : null;
  if (!end || !lower || !upper) return null;
  return { upper, lower, end };
}
function refreshIkUi() {
  const chain = currentIkChain();
  inputs.ikRootName.value = chain?.upper?.name || '-';
  inputs.ikMidName.value = chain?.lower?.name || '-';
  inputs.ikEndName.value = chain?.end?.name || '-';
  inputs.ikBendName.value = state.ikBendDir > 0 ? '通常' : '反転';
  if (controlFlipIkBtn) {
    const reversed = state.ikBendDir < 0;
    controlFlipIkBtn.classList.toggle('reversed', reversed);
    controlFlipIkBtn.setAttribute('aria-pressed', reversed ? 'true' : 'false');
    const label = $('span', controlFlipIkBtn); if (label) label.textContent = reversed ? 'IK反転中' : 'IK反転';
  }
  const active = state.ikMode && !!chain;
  toggleIkBtn.classList.toggle('active', active);
  toggleIkBtn.textContent = active ? 'IKモード中' : 'IKモード';
  if (state.ikMode) {
    ikStatus.textContent = chain ? `${chain.end.name} をIK操作中` : '末端パーツを選択してください';
  } else {
    ikStatus.textContent = chain ? '準備完了' : '親+祖父親が必要';
  }
  updateIkTargetVisual();
}
function updateIkTargetVisual() {
  if (!state.ikMode || !currentIkChain()) {
    ikTarget.hidden = true;
    return;
  }
  ikTarget.hidden = false;
  ikTarget.style.left = `${state.ikTarget.x}px`;
  ikTarget.style.top = `${state.ikTarget.y}px`;
}
function setIkTargetToCurrentEffector() {
  const chain = currentIkChain();
  if (!chain) return;
  const p = worldPivot(chain.end);
  state.ikTarget.x = p.x;
  state.ikTarget.y = p.y;
  updateIkTargetVisual();
}
function disableIkMode(silent = false) {
  state.ikMode = false;
  ikTarget.hidden = true;
  if (!silent) markChanged('IKモード終了');
  refreshIkUi();
  syncInspector();
}
function enableIkMode() {
  stopTest();
  stopAnimation(true);
  commitAnimationPreview();
  const chain = currentIkChain();
  if (!chain) {
    state.ikMode = false;
    refreshIkUi();
    alert(`IKは「末端パーツ」に親と祖父親がある2関節チェーンで使えます。\n例: 足 → すね → 太腿`);
    return false;
  }
  state.pivotMode = false;
  $('#togglePivotBtn').classList.remove('active');
  $('#togglePivotBtn').textContent = 'ピボット設定';
  state.ikMode = true;
  setIkTargetToCurrentEffector();
  refreshIkUi();
  syncInspector();
  markChanged('IKモード開始');
  return true;
}
function solveIkTo(targetX, targetY) {
  const chain = currentIkChain();
  if (!chain) return false;
  const { upper, lower, end } = chain;
  const parentOfUpper = upper.parentId ? partById(upper.parentId) : null;
  const root = worldPivot(upper);
  const knee = worldPivot(lower);
  const tip = worldPivot(end);
  const l1 = Math.max(0.0001, dist(root, knee));
  const l2 = Math.max(0.0001, dist(knee, tip));
  const upperWorld = worldMatrix(upper);
  const lowerWorld = worldMatrix(lower);
  const endWorld = worldMatrix(end);
  const upperWorldRot = matrixRotationDeg(upperWorld);
  const lowerWorldRot = matrixRotationDeg(lowerWorld);
  const endWorldRot = matrixRotationDeg(endWorld);
  const upperBoneNow = Math.atan2(knee.y - root.y, knee.x - root.x);
  const lowerBoneNow = Math.atan2(tip.y - knee.y, tip.x - knee.x);
  const upperOffset = normalizeRad(upperBoneNow - degToRad(upperWorldRot));
  const lowerOffset = normalizeRad(lowerBoneNow - degToRad(lowerWorldRot));
  const target = { x: targetX, y: targetY };
  const dRaw = dist(root, target);
  const d = clamp(dRaw, Math.abs(l1 - l2) + 0.0001, l1 + l2 - 0.0001);
  const base = Math.atan2(target.y - root.y, target.x - root.x);
  const cosA = clamp((l1*l1 + d*d - l2*l2) / (2*l1*d), -1, 1);
  const angleA = Math.acos(cosA);
  const upperBone = base - state.ikBendDir * angleA;
  const cosK = clamp((l1*l1 + l2*l2 - d*d) / (2*l1*l2), -1, 1);
  const kneeInterior = Math.acos(cosK);
  const lowerBone = upperBone + state.ikBendDir * (Math.PI - kneeInterior);
  const desiredUpperWorldRot = radToDeg(upperBone - upperOffset);
  const desiredLowerWorldRot = radToDeg(lowerBone - lowerOffset);
  const parentUpperWorldRot = parentOfUpper ? matrixRotationDeg(worldMatrix(parentOfUpper)) : 0;
  upper.rotation = desiredUpperWorldRot - parentUpperWorldRot;
  lower.rotation = desiredLowerWorldRot - desiredUpperWorldRot;
  end.rotation = endWorldRot - desiredLowerWorldRot;
  state.ikTarget.x = targetX;
  state.ikTarget.y = targetY;
  applyAllPartStyles();
  syncInspector();
  updateIkTargetVisual();
  return true;
}
function startIkDrag(pointerId, startClientX, startClientY, sourceEl) {
  const chain = currentIkChain();
  if (!state.ikMode || !chain) return false;
  pushHistory();
  markSelectedKeyPoseDirty();
  const move = e => {
    const point = pointerToArea(e.clientX, e.clientY);
    solveIkTo(point.x, point.y);
    if (state.dragRaf) return;
    state.dragRaf = requestAnimationFrame(() => {
      state.dragRaf = 0;
      markChanged('IK移動');
    });
  };
  const end = () => {
    sourceEl.removeEventListener('pointermove', move);
    sourceEl.removeEventListener('pointerup', end);
    sourceEl.removeEventListener('pointercancel', end);
  };
  sourceEl.setPointerCapture?.(pointerId);
  sourceEl.addEventListener('pointermove', move);
  sourceEl.addEventListener('pointerup', end);
  sourceEl.addEventListener('pointercancel', end);
  const start = pointerToArea(startClientX, startClientY);
  solveIkTo(start.x, start.y);
  return true;
}

toggleIkBtn.addEventListener('click', () => {
  if (state.ikMode) disableIkMode();
  else enableIkMode();
});
$('#flipIkBtn').addEventListener('click', () => {
  state.ikBendDir *= -1;
  refreshIkUi();
  if (state.ikMode) {
    pushHistory();
    markSelectedKeyPoseDirty();
    solveIkTo(state.ikTarget.x, state.ikTarget.y);
    markChanged('IKの曲げ向きを反転');
  }
});
controlFlipIkBtn.addEventListener('click', () => $('#flipIkBtn').click());
$('#centerIkBtn').addEventListener('click', () => {
  if (!currentIkChain()) return;
  if (!state.ikMode) enableIkMode();
  setIkTargetToCurrentEffector();
  refreshIkUi();
  markChanged('IKターゲットを現在位置へ');
});
ikTarget.addEventListener('pointerdown', event => {
  if (!state.ikMode) return;
  event.preventDefault();
  event.stopPropagation();
  startIkDrag(event.pointerId, event.clientX, event.clientY, ikTarget);
});

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
    commitAnimationPreview();
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
  if (state.groupMoveMode && !state.testRunning) {
    event.preventDefault();
    stopAnimation(true); commitAnimationPreview(); pushHistory();
    const base = captureGroupTranslationBase(state.activeGroupId);
    const start = pointerToArea(event.clientX, event.clientY);
    node.setPointerCapture?.(event.pointerId);
    const moveGroup = e => {
      const p = pointerToArea(e.clientX, e.clientY);
      applyGroupTranslationBase(base, p.x-start.x, p.y-start.y);
      if (state.dragRaf) return;
      state.dragRaf = requestAnimationFrame(() => { state.dragRaf=0; markChanged('グループ全体移動'); });
    };
    const endGroup = () => {
      node.removeEventListener('pointermove', moveGroup);
      node.removeEventListener('pointerup', endGroup);
      node.removeEventListener('pointercancel', endGroup);
    };
    node.addEventListener('pointermove', moveGroup);
    node.addEventListener('pointerup', endGroup);
    node.addEventListener('pointercancel', endGroup);
    return;
  }
  if (state.ikMode && !state.testRunning) {
    const chain = currentIkChain();
    if (chain && chain.end.id === id) {
      event.preventDefault();
      startIkDrag(event.pointerId, event.clientX, event.clientY, node);
      return;
    }
  }
  if (state.pivotMode || state.testRunning) return;
  event.preventDefault();
  const part = selectedPart();
  if (!part) return;
  stopAnimation(true);
  commitAnimationPreview();
  pushHistory();
  markSelectedKeyPoseDirty();
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
  stopAnimation(true);
  commitAnimationPreview();
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
  stopAnimation(true);
  commitAnimationPreview();
  pushHistory();
  if (state.groupMoveMode) {
    translateGroupNowAndTimeline(state.activeGroupId, dx, dy);
    markChanged('グループ全体を1px移動');
    return;
  }
  if (state.ikMode) {
    markSelectedKeyPoseDirty();
    solveIkTo(state.ikTarget.x + dx, state.ikTarget.y + dy);
    markChanged(`IKターゲットを${Math.abs(dx)+Math.abs(dy)}px移動`);
    return;
  }
  if (!state.pivotMode) markSelectedKeyPoseDirty();
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
  stopAnimation(true);
  commitAnimationPreview();
  pushHistory();
  markSelectedKeyPoseDirty();
  part.rotation += delta;
  applyAllPartStyles(); syncInspector(); markChanged(`${delta > 0 ? '+' : ''}${delta}°回転`);
}
$$('.nudge-btn', controlPanel).forEach(button => button.addEventListener('click', () => nudgeSelected(Number(button.dataset.dx), Number(button.dataset.dy))));
$$('.rotate-btn', controlPanel).forEach(button => button.addEventListener('click', () => rotateSelected(Number(button.dataset.rotate))));

// ---------- character-area drag ----------
characterArea.addEventListener('pointerdown', event => {
  if (event.target !== characterArea && !event.target.classList.contains('character-area-label')) return;
  if (state.pivotMode || state.testRunning) return;
  event.preventDefault(); stopAnimation(true); commitAnimationPreview(); pushHistory(); markSelectedKeyPoseDirty();
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
      deformMode: 'none',
      deformAmount: 0,
      deformAnchor: 'top',
      pivotX: Math.round(natural.width / 2),
      pivotY: Math.round(natural.height / 2),
      parentId: '',
      visible: true,
      order: state.parts.length + 1,
      groupId: partGroupSelect.value || state.activeGroupId || state.groups[0]?.id
    };
    state.parts.push(part);
    state.selectedId = part.id;
  }
  state.activeGroupId = partGroupSelect.value || state.activeGroupId;
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
  stopAnimation(true);
  if (!state.pivotMode) commitAnimationPreview();
  if (!state.pivotMode && state.ikMode) disableIkMode(true);
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
  stopTest(); stopAnimation(true); commitAnimationPreview(); pushHistory();
  // Children keep their current world pose when detached to root.
  const children = state.parts.filter(p => p.parentId === part.id);
  children.forEach(child => reparentPreserveWorld(child, ''));
  state.parts = state.parts.filter(p => p.id !== part.id);
  delete state.animation.tracks[part.id];
  if (hasSelectedGroupKey() && state.animation.selectedGroupId === part.groupId && !partsInGroup(part.groupId).length) clearKeySelection(false);
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
  if (id === 'selectedKeyTime') { setSelectedKeyDraftTime(v); return; }
  if (id === 'animTime') { clearKeySelection(); setAnimationTime(v, true); return; }
  if (id === 'animDuration') {
    stopAnimation(true); pushHistory();
    state.animation.duration = Math.max(100, Math.abs(v));
    state.animation.currentTime = clamp(state.animation.currentTime,0,state.animation.duration);
    Object.values(state.animation.tracks).forEach(track => {
      track.keys.forEach(k => k.time = clamp(k.time,0,state.animation.duration));
      const dedup = new Map(); track.keys.sort((a,b)=>a.time-b.time).forEach(k=>dedup.set(Math.round(k.time),k));
      track.keys = [...dedup.values()].sort((a,b)=>a.time-b.time);
    });
    state.animation.areaKeys.forEach(k => k.time = clamp(k.time,0,state.animation.duration));
    const areaDedup = new Map(); state.animation.areaKeys.sort((a,b)=>a.time-b.time).forEach(k=>areaDedup.set(Math.round(k.time),k));
    state.animation.areaKeys = [...areaDedup.values()].sort((a,b)=>a.time-b.time);
    syncAnimationUi();
    if (totalTrackKeyCount()) applyAnimationPreview(state.animation.currentTime,{renderTracks:true});
    markChanged('アニメーション長変更'); return;
  }
  if (id === 'stageWidth' || id === 'stageHeight') return;
  if (id.startsWith('area')) {
    if (state.pivotMode || state.testRunning) return;
    stopAnimation(true); commitAnimationPreview(); pushHistory(); markSelectedKeyPoseDirty();
    state.area.x = id === 'areaX' ? v : state.area.x;
    state.area.y = id === 'areaY' ? v : state.area.y;
    state.area.width = id === 'areaW' ? Math.max(40, v) : state.area.width;
    state.area.height = id === 'areaH' ? Math.max(40, v) : state.area.height;
    syncArea(); markChanged(); return;
  }
  const part = selectedPart();
  if (!part || state.testRunning) return;
  stopAnimation(true); commitAnimationPreview();
  const map = { partX:'x', partY:'y', partW:'width', partRot:'rotation', pivotX:'pivotX', pivotY:'pivotY', deformAmount:'deformAmount' };
  const key = map[id];
  if (!key) return;
  if (state.pivotMode && !['pivotX','pivotY'].includes(key)) return;
  pushHistory();
  if (!['pivotX','pivotY'].includes(key)) markSelectedKeyPoseDirty();
  if (key === 'pivotX') setPivotPreservePose(part, v, part.pivotY);
  else if (key === 'pivotY') setPivotPreservePose(part, part.pivotX, v);
  else if (key === 'deformAmount') part[key] = clamp(v,-100,100);
  else part[key] = key === 'width' ? Math.max(1, v) : v;
  applyAllPartStyles(); syncInspector(); markChanged();
}


// ---------- v19 bone + simple deformation controls ----------
toggleBoneBtn?.addEventListener('click',()=>{
  state.boneVisible=!state.boneVisible;
  toggleBoneBtn.classList.toggle('active',state.boneVisible);
  toggleBoneBtn.setAttribute('aria-pressed',state.boneVisible?'true':'false');
  toggleBoneBtn.textContent=state.boneVisible?'ボーン表示中':'ボーン表示';
  renderBoneOverlay(state.animation.previewActive?state.animation.previewPose?.parts:null,null);
  markChanged(state.boneVisible?'ボーン表示ON':'ボーン表示OFF');
});
[deformMode,deformAnchor].forEach(control=>control?.addEventListener('change',()=>{
  const part=selectedPart(); if(!part||state.testRunning)return;
  stopAnimation(true); commitAnimationPreview(); pushHistory();
  if(control===deformMode) part.deformMode=deformMode.value;
  if(control===deformAnchor) part.deformAnchor=deformAnchor.value;
  applyAllPartStyles(); syncInspector(); renderOnionSkins();
  markChanged(control===deformMode?'簡易変形変更':'変形の根元変更');
}));

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
    if (event.target.closest('button')) return;
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
  stopAnimation(false);
  disableIkMode(true);
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
    version: 19,
    stage: { ...state.stage },
    characterArea: { ...state.area },
    groups: state.groups.map(g => ({ id:g.id, name:g.name, visible:g.visible !== false })),
    activeGroupId: state.activeGroupId,
    boneVisible: !!state.boneVisible,
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
      deformMode: p.deformMode || 'none',
      deformAmount: Math.round(num(p.deformAmount,0)*1000)/1000,
      deformAnchor: p.deformAnchor || 'top',
      pivotX: Math.round(p.pivotX),
      pivotY: Math.round(p.pivotY),
      parentId: p.parentId,
      parentFileName: p.parentId ? (partById(p.parentId)?.fileName || '') : '',
      visible: p.visible,
      order: p.order,
      groupId: p.groupId,
      groupName: groupById(p.groupId)?.name || '',
      duplicateSourceFileName: p.duplicateSourceFileName || ''
    })),
    animation: {
      name: state.animation.name,
      duration: Math.round(state.animation.duration),
      loop: state.animation.loop,
      onionSkin: state.animation.onionSkin !== false,
      currentTime: Math.round(state.animation.currentTime),
      trackFormat: 2,
      displayMode: 'groups',
      tracks: Object.values(state.animation.tracks).filter(track => track.keys?.length).map(track => ({
        partId: track.partId,
        groupId: partById(track.partId)?.groupId || '',
        fileName: track.fileName,
        name: track.name,
        keys: sortedTrackKeys(track).map(key => ({
          id:key.id, time:Math.round(key.time),
          x:Math.round(key.x), y:Math.round(key.y), width:Math.round(key.width), rotation:Math.round(key.rotation*1000)/1000, deformAmount:Math.round(num(key.deformAmount,0)*1000)/1000
        }))
      })),
      areaKeys: [...state.animation.areaKeys].sort((a,b)=>a.time-b.time).map(key => ({
        id:key.id, time:Math.round(key.time), x:Math.round(key.x), y:Math.round(key.y)
      }))
    }
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
function requestedJsonFileName() {
  let name = String(jsonFileName?.value || 'character-coordinates').trim() || 'character-coordinates';
  name = name.replace(/[\\/:*?"<>|]+/g, '_');
  if (!/\.json$/i.test(name)) name += '.json';
  return name;
}
async function saveJsonWithDestination() {
  const fileName = requestedJsonFileName();
  const text = jsonText();
  const blob = new Blob([text], { type: 'application/json' });

  // Chromium on PC: native save picker lets the user choose folder + filename.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'JSON ファイル',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      statusText.textContent = '指定先へ座標保存済み';
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        statusText.textContent = '保存をキャンセル';
        return;
      }
      console.warn('showSaveFilePicker failed; trying share/download fallback.', error);
    }
  }

  // iPad/iPhone Safari: invoke the native share sheet.
  // Choosing 「ファイルに保存」 there lets the user pick a folder in Files.
  try {
    const file = new File([text], fileName, { type: 'application/json' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ files: [file] });
      statusText.textContent = '共有/保存先を選択済み';
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      statusText.textContent = '保存をキャンセル';
      return;
    }
    console.warn('Web Share failed; using download fallback.', error);
  }

  // Last-resort fallback for browsers without either API.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  statusText.textContent = '標準ダウンロードで座標保存済み';
}
$('#downloadJsonBtn').addEventListener('click', saveJsonWithDestination);

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


function importAnimationData(savedAnimation, matches) {
  const fresh = freshAnimation();
  if (!savedAnimation) { state.animation = fresh; return; }
  const duration = Math.max(100,num(savedAnimation.duration,1000));
  const lookup = new Map();
  matches.forEach(({saved,current}) => {
    if (saved.fileName) lookup.set(`file:${String(saved.fileName).toLocaleLowerCase()}`, current);
    if (saved.name) lookup.set(`name:${String(saved.name)}`, current);
  });
  const tracks = {};
  const addTrackKey = (current, raw) => {
    if (!current) return;
    if (!tracks[current.id]) tracks[current.id] = { partId:current.id,fileName:current.fileName,name:current.name,keys:[] };
    const track=tracks[current.id];
    const t=clamp(num(raw.time,0),0,duration);
    const existing=track.keys.find(k=>Math.abs(k.time-t)<=0.5);
    const key={id:raw.id||`key-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,time:t,x:num(raw.x,current.x),y:num(raw.y,current.y),width:Math.max(1,num(raw.width,current.width)),rotation:num(raw.rotation,current.rotation),deformAmount:num(raw.deformAmount,current.deformAmount||0)};
    if(existing)Object.assign(existing,key);else track.keys.push(key);
  };

  // v11 track format
  if (Array.isArray(savedAnimation.tracks)) {
    savedAnimation.tracks.forEach(savedTrack => {
      const exact = savedTrack.partId != null
        ? matches.find(({saved}) => String(saved.id) === String(savedTrack.partId))?.current
        : null;
      const current = exact ||
        (savedTrack.fileName&&lookup.get(`file:${String(savedTrack.fileName).toLocaleLowerCase()}`)) ||
        (savedTrack.name&&lookup.get(`name:${String(savedTrack.name)}`));
      (savedTrack.keys||[]).forEach(k=>addTrackKey(current,k));
    });
  } else if (Array.isArray(savedAnimation.keyframes)) {
    // v9/v10 full-pose format -> split into independent part tracks.
    savedAnimation.keyframes.forEach(frame => {
      (frame.parts||[]).forEach(fp => {
        const current=(fp.fileName&&lookup.get(`file:${String(fp.fileName).toLocaleLowerCase()}`))||(fp.name&&lookup.get(`name:${String(fp.name)}`));
        addTrackKey(current,{...fp,time:frame.time,id:`${frame.id||'old'}-${current?.id||'part'}`});
      });
    });
  }
  Object.values(tracks).forEach(t=>t.keys.sort((a,b)=>a.time-b.time));
  const areaKeys = Array.isArray(savedAnimation.areaKeys)
    ? savedAnimation.areaKeys.map(k=>({id:k.id||`area-${Date.now()}`,time:clamp(num(k.time,0),0,duration),x:num(k.x,state.area.x),y:num(k.y,state.area.y)}))
    : Array.isArray(savedAnimation.keyframes)
      ? savedAnimation.keyframes.map(frame=>({id:`area-${frame.id||Math.random()}`,time:clamp(num(frame.time,0),0,duration),x:num(frame.area?.x,state.area.x),y:num(frame.area?.y,state.area.y)}))
      : [];
  state.animation={...fresh,name:savedAnimation.name||'motion',duration,loop:savedAnimation.loop!==false,onionSkin:savedAnimation.onionSkin!==false,currentTime:clamp(num(savedAnimation.currentTime,0),0,duration),tracks,areaKeys};
}
function importCoordinateData(data) {
  if (!data || !Array.isArray(data.parts)) throw new Error('parts配列がありません');
  if (!state.parts.length) throw new Error('先にパーツ画像を読み込んでください');

  stopTest();
  pushHistory();

  if (Array.isArray(data.groups) && data.groups.length) { state.groups = data.groups.map(g=>({id:String(g.id||makeGroupId()),name:String(g.name||'グループ'),visible:g.visible!==false})); }
  else ensureGroups();
  state.activeGroupId = data.activeGroupId && state.groups.some(g=>g.id===data.activeGroupId) ? data.activeGroupId : state.groups[0].id;
  state.boneVisible = !!data.boneVisible;
  toggleBoneBtn?.classList.toggle('active',state.boneVisible);
  if(toggleBoneBtn){toggleBoneBtn.textContent=state.boneVisible?'ボーン表示中':'ボーン表示';toggleBoneBtn.setAttribute('aria-pressed',state.boneVisible?'true':'false');}
  refreshGroupSelects();

  const unusedIds = new Set(state.parts.map(p => p.id));
  const matches = [];
  const missing = [];
  const savedIdToCurrentId = new Map();

  data.parts.forEach(saved => {
    let current = findCurrentPartForSaved(saved, unusedIds);
    // A duplicated group can contain another instance of the same source PNG.
    // If the user loaded that PNG only once, create another in-memory instance automatically.
    if (!current && saved.fileName) {
      const lower = String(saved.fileName).toLocaleLowerCase();
      const source = state.parts.find(p => String(p.fileName || '').toLocaleLowerCase() === lower);
      if (source) {
        current = {
          ...source,
          id: uid(),
          name: saved.name || source.name,
          parentId: '',
          groupId: source.groupId,
          duplicateSourceId: source.id,
          duplicateSourceFileName: saved.duplicateSourceFileName || saved.fileName
        };
        state.parts.push(current);
        unusedIds.add(current.id);
      }
    }
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
    current.deformMode = saved.deformMode || current.deformMode || 'none';
    current.deformAmount = num(saved.deformAmount,current.deformAmount||0);
    current.deformAnchor = saved.deformAnchor || current.deformAnchor || 'top';
    current.pivotX = num(saved.pivotX, current.pivotX);
    current.pivotY = num(saved.pivotY, current.pivotY);
    current.visible = saved.visible !== false;
    current.order = num(saved.order, current.order);
    const savedGroup = (saved.groupId && state.groups.find(g=>g.id===saved.groupId)) || (saved.groupName && state.groups.find(g=>g.name===saved.groupName));
    if (savedGroup) current.groupId = savedGroup.id;
    current.duplicateSourceFileName = saved.duplicateSourceFileName || current.duplicateSourceFileName || '';
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

  importAnimationData(data.animation, matches);
  normalizeOrders();
  if (!state.parts.some(p => p.id === state.selectedId)) state.selectedId = matches[0].current.id;
  syncStage();
  syncArea();
  renderParts();
  syncAnimationUi();
  if (totalTrackKeyCount()) applyAnimationPreview(state.animation.currentTime,{renderTracks:true});

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
  state.parts = []; state.groups=[{id:'group-default',name:'未分類',visible:true}]; state.activeGroupId='group-default'; state.selectedId = null; state.groupMoveMode=false; state.pivotMode = false; state.ikMode = false; state.boneVisible=false; state.animation = freshAnimation(); refreshGroupSelects();
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.backgroundUrl = '';
  backgroundImage.hidden = true; backgroundImage.removeAttribute('src'); stageEmpty.hidden = false;
  jsonPreview.value = '';
  $('#togglePivotBtn').classList.remove('active'); $('#togglePivotBtn').textContent = 'ピボット設定';
  toggleIkBtn.classList.remove('active'); toggleIkBtn.textContent = 'IKモード';
  toggleBoneBtn?.classList.remove('active'); if(toggleBoneBtn){toggleBoneBtn.textContent='ボーン表示';toggleBoneBtn.setAttribute('aria-pressed','false');}
  syncStage(); syncArea(); renderParts(); syncAnimationUi(); markChanged('初期化済み');
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
  stopAnimation(false);
  if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
  state.liveObjectUrls.forEach(url => URL.revokeObjectURL(url));
});

// ---------- v7: prevent accidental browser gestures in the editor ----------
// CSS touch-action handles normal double-tap zoom. These event guards cover
// Safari long-press callouts/text selection and older edge cases.
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('selectstart', event => event.preventDefault());
document.addEventListener('dragstart', event => event.preventDefault());
document.addEventListener('dblclick', event => event.preventDefault(), { passive: false });

syncStage(); syncArea(); renderParts(); syncAnimationUi(); updateHistoryButtons();

window.addEventListener('resize',updateChromeMetrics);
requestAnimationFrame(updateChromeMetrics);
