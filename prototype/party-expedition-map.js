(function (root) {
  'use strict';

  const WIDTH = 520;
  const LANES = [95, 260, 425];
  const ROW_GAP = 78;
  const LABELS = Object.freeze({
    start: '출발', battle: '전투', elite: '강적', camp: '정박지',
    shop: '상점', event: '사건', boss: '최심부'
  });
  const MARKS = Object.freeze({
    start: '<path d="M12 3v15m-4-3 4 4 4-4M6 21h12M12 4l7 4-7 4"/>',
    battle: '<path d="m5 3 14 16m0-16L5 19M3 17l4 4m-4 0 4-4m10 0 4 4m-4 0 4-4M4 3l1 4 3-3-4-1zm16 0-1 4-3-3 4-1z"/>',
    elite: '<path d="m5 3 14 16m0-16L5 19M3 17l4 4m-4 0 4-4m10 0 4 4m-4 0 4-4"/><path d="m8 3 4-2 4 2-1 4h-6z"/>',
    camp: '<path d="m12 3-8 15h16L12 3zm0 8-4 7h8l-4-7zM2 21h20"/><path d="m3 6 2-2m14 0 2 2"/>',
    shop: '<path d="M4 9h16v12H4zM3 9l2-6h14l2 6M8 3v6m8-6v6M9 21v-7h6v7"/><path d="M3 9c1 3 3 3 4 0 1 3 4 3 5 0 1 3 4 3 5 0 1 3 3 3 4 0"/>',
    event: '<path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2zM19 17v5m-2-2.5h4"/>',
    boss: '<path d="m12 2 8 5v10l-8 5-8-5V7l8-5zM8 9h8v5l-4 3-4-3V9zM12 5v4m0 8v2M6 8l2 2m8 0 2-2M6 16l2-2m8 0 2 2"/>'
  });

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function typeOf(node) {
    return Object.prototype.hasOwnProperty.call(LABELS, node.type) ? node.type : 'event';
  }

  function icon(type) {
    const safeType = Object.prototype.hasOwnProperty.call(MARKS, type) ? type : 'event';
    return '<svg class="map-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + MARKS[safeType] + '</svg>';
  }

  function rowOf(node) {
    if (node.type === 'start') return 0;
    if(node.entry)return node.floor*2+1;
    const floor = Math.max(0, Number.isFinite(Number(node.floor)) ? Number(node.floor) : 0);
    return floor * 2 + (['camp', 'shop', 'event'].includes(node.type) ? 2 : 1);
  }

  function render(view, options) {
    options = options || {};
    view = view || {};
    const nodes = Array.isArray(view.nodes) ? view.nodes : [];
    const edges = Array.isArray(view.edges) ? view.edges : [];
    const trail = Array.isArray(view.trail) ? view.trail.map(String) : [];
    const visited = new Set(trail);
    const available = new Set((Array.isArray(view.available) ? view.available : []).map(String));
    const current = String(view.current == null ? '' : view.current);
    const selected = String(options.selected == null ? '' : options.selected);
    const maxRow = Math.max(1, ...nodes.map(rowOf));
    const height = 112 + maxRow * ROW_GAP;
    const coords = new Map(nodes.map(node => [String(node.id), {
      x: node.type === 'start' || node.type === 'boss' ? 260 : LANES[Math.max(0, Math.min(2, Math.round(Number(node.lane) || 0)))],
      y: 56 + (maxRow - rowOf(node)) * ROW_GAP,
      row: rowOf(node)
    }]));
    const currentPoint = coords.get(current);
    const traversed = new Set(trail.slice(1).map((id, index) => JSON.stringify([trail[index], id])));

    const routeMarkup = edges.map(edge => {
      const from = coords.get(String(edge.from)), to = coords.get(String(edge.to));
      if (!from || !to) return '';
      const middle = (from.y + to.y) / 2;
      const used = traversed.has(JSON.stringify([String(edge.from), String(edge.to)]));
      const next = String(edge.from) === current && available.has(String(edge.to)) && !options.readOnly;
      const past = currentPoint && to.row <= currentPoint.row && !used && !next;
      const classes = 'map-route' + (used ? ' is-traveled' : next ? ' is-next' : past ? ' is-bypassed' : '');
      return '<path class="' + classes + '" d="M' + from.x + ' ' + from.y + 'C' + from.x + ' ' + middle + ' ' + to.x + ' ' + middle + ' ' + to.x + ' ' + to.y + '"/>';
    }).join('');

    const contours = '<path d="M-55 140C190 3 415 89 574 234M-40 175C198 44 396 127 560 259M-35 220C142 130 397 137 568 300M-50 ' + (height - 245) + 'C138 ' + (height - 460) + ' 380 ' + (height - 352) + ' 558 ' + (height - 190) + 'M-40 ' + (height - 195) + 'C144 ' + (height - 413) + ' 392 ' + (height - 296) + ' 560 ' + (height - 155) + 'M-18 ' + (height - 148) + 'C139 ' + (height - 350) + ' 397 ' + (height - 247) + ' 570 ' + (height - 105) + '"/>';
    const nodeMarkup = nodes.map(node => {
      const id = String(node.id), type = typeOf(node), point = coords.get(id);
      const isCurrent = id === current, isVisited = visited.has(id), isAvailable = available.has(id);
      const isBypassed = currentPoint && point.row <= currentPoint.row && !isVisited && !isCurrent && !isAvailable;
      const classes = ['map-node', 'map-node-' + type];
      if (isCurrent) classes.push('is-current');
      if (isVisited) classes.push('is-visited');
      if (isAvailable && !options.readOnly) classes.push('is-available');
      if (isBypassed) classes.push('is-bypassed');
      const state = isCurrent ? '현재 위치' : isVisited ? '지난 경로' : isAvailable && !options.readOnly ? '진입 가능' : isBypassed ? '지나친 경로' : '후속 경로';
      const name = LABELS[type] + (node.label && node.label !== LABELS[type] ? ' · ' + node.label : '');
      const badge = isCurrent ? '<span class="map-node-badge current">현재</span>' : isVisited ? '<span class="map-node-badge visited" aria-hidden="true">✓</span>' : '';
      return '<button type="button" class="' + classes.join(' ') + '" data-map-node="' + escape(id) + '" data-map-floor="' + escape(node.floor) + '" data-map-row="' + point.row + '" style="left:' + (point.x / WIDTH * 100).toFixed(3) + '%;top:' + point.y + 'px" aria-label="' + escape(name + ', ' + state) + '" aria-pressed="' + (id === selected ? 'true' : 'false') + '" title="' + escape(name) + '">' + icon(type) + '<span class="map-node-label">' + LABELS[type] + '</span>' + badge + '</button>';
    }).join('');
    const depthMarkup = Array.from({ length: Math.ceil(maxRow / 2) }, (_, floor) => {
      const row = floor * 2 + 1;
      if (row > maxRow) return '';
      return '<span class="map-depth" style="top:' + (56 + (maxRow - row) * ROW_GAP) + 'px">' + String(floor + 1).padStart(2, '0') + '</span>';
    }).join('');
    const legend = ['battle', 'elite', 'camp', 'shop', 'event', 'boss'].map(type => '<span>' + icon(type) + LABELS[type] + '</span>').join('');

    return '<section class="expedition-map" data-map-current="' + escape(current) + '" aria-label="심층 원정 지도"><div class="map-scroll" tabindex="0" role="region" aria-label="원정 경로. 아래에서 위로 진행하며, 장소를 선택하면 상세 정보를 확인합니다."><div class="map-chart" style="height:' + height + 'px"><div class="map-direction" aria-hidden="true">↑ 심층으로</div><svg class="map-lines" viewBox="0 0 ' + WIDTH + ' ' + height + '" preserveAspectRatio="none" fill="none" aria-hidden="true"><g class="map-contours">' + contours + '</g><path class="map-meridian" d="M260 0V' + height + '"/>' + routeMarkup + '</svg>' + depthMarkup + nodeMarkup + '</div></div><div class="map-legend" aria-label="지도 기호">' + legend + '</div></section>';
  }

  const api = Object.freeze({ render, icon });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PartyExpeditionMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
