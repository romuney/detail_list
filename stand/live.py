"""Живой стенд вкладки «Детальных списков»: борд из двух чартов (панель фильтров слева, список справа) поверх chdb.

    python3 stand/live.py [порт]        # http://127.0.0.1:8766/?user=a.user&mode=us

Страница повторяет Proteus: каждый чарт — в <iframe sandbox="allow-scripts"> (хост
[_echarts_instance_], массив data, applyCrossFilter); родитель — борд:
  • кросс-фильтры по областям, как в JSON-метаданных поставки: панель фильтров → только списку,
    список → только себе; маски эмиттеров, в область которых входит чарт, складываются и уходят в
    его датасет как filter_values (носители с суффиксом вкладки '_f' / '_kf'); чарт перезапускается
    в том же окне iframe (состояние живёт), только если его фильтры изменились;
  • канал скриншотов: ECHARTS_UPDATE_DATA_URL кладёт dataUrl в img.echarts-plugin рядом с iframe,
    CSS борда — файл 9 поставки (id чартов подставлены): панель фильтров разворачивается вправо поверх списка.
?user= — логин (current_username): a.user, hr.super, p.lead, nobody; ?mode=us|kp — вкладка (у КП в чартах
ns 'dlk' / 'dlkf', как в файлах поставки); ?w= — ширина борда, px; ?pw= — ширина панели фильтров
(по умолчанию 340), ?h= — высота ряда; ?selfoff=flt|list — чарт не фильтрует сам себя (проверка
предупреждения); ?delay= — задержка ответа, мс.
Счётчики для проверок (у родителя): window.__runs = {flt, list}, window.__masks = {flt, list} (эмиты),
window.__ms / __bytes = {flt: [], list: []} (время и размер ответов), window.__runMs (время скрипта).
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
CHARTS = {'list': os.path.join(ROOT, 'proteus', 'detail-list.chart.js'),
          'flt': os.path.join(ROOT, 'proteus', 'detail-list-filters.chart.js')}
CSS = os.path.join(ROOT, 'Поставка — Детальные списки', '9. CSS борда.css')
IDS = {('us', 'list'): '000000', ('kp', 'list'): '111111', ('us', 'flt'): '222222', ('kp', 'flt'): '333333'}
LOCK = threading.Lock()   # сессия chdb — одна на процесс, запросы по очереди

# Страница внутри iframe: чарт запускается сообщением RUN от родителя в том же окне (как в Proteus).
INNER = r'''<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff}</style></head>
<body><div _echarts_instance_="ec_1" style="width:100%;height:100%;position:relative"><canvas></canvas></div>
<script>
var SRC = '', NAME = '__NAME__', option = null;
function applyCrossFilter(f) { parent.postMessage({ type: 'ECHARTS_APPLY_CROSS_FILTER', chart: NAME, filters: f }, '*'); }
window.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'SRC') { SRC = d.src; return; }
  if (d.type !== 'RUN') return;
  var t0 = performance.now();
  window.data = d.rows;
  try { (new Function('data', 'applyCrossFilter', SRC + '\n;return typeof option !== "undefined" ? option : null;'))(d.rows, applyCrossFilter); }
  catch (er) { parent.postMessage({ type: 'STAND_ERR', chart: NAME, err: String(er) }, '*'); }
  parent.postMessage({ type: 'STAND_RUN', chart: NAME, ms: Math.round(performance.now() - t0) }, '*');
});
parent.postMessage({ type: 'STAND_READY', chart: NAME }, '*');
</script></body></html>'''

PAGE = r'''<!doctype html><html><head><meta charset="utf-8"><title>Детальные списки · стенд борда</title>
<style>html,body{margin:0;background:#f4f5f7;font:13px Arial}
.dashboard-grid{padding:16px}
.grid-row{display:flex;gap:16px}.grid-column{position:relative;flex:0 0 auto}.grid-column.list{flex:1 1 auto;min-width:0}
.dashboard-component-chart-holder{position:relative;height:100%}
.dashboard-chart,.chart-container,.slice_container,.react_sanbbox,[id^="chart-id-"]{width:100%;height:100%}
.react_sanbbox iframe{border:0;width:100%;height:100%;display:block}
img.echarts-plugin{display:none}
__CSS__</style></head>
<body><div class="dashboard-grid" id="grid"></div>
<script>
var Q = new URLSearchParams(location.search);
var USER = Q.get('user') || 'a.user', MODE = Q.get('mode') === 'kp' ? 'kp' : 'us', DELAY = +(Q.get('delay') || 150);
var SELFOFF = Q.get('selfoff') || '', IDS = __IDS__, INNER = __INNER__;
var grid = document.getElementById('grid');
if (Q.get('w')) grid.style.width = Q.get('w') + 'px';
var H = +(Q.get('h') || Math.max(640, innerHeight - 32)), PW = +(Q.get('pw') || 340);
// Области кросс-фильтров — как в JSON-метаданных поставки (п. 4 инструкции).
var SCOPE = { flt: ['list'], list: ['list'] };
if (SELFOFF) SCOPE[SELFOFF] = SCOPE[SELFOFF].filter(function (c) { return c !== SELFOFF; });
var MASKS = { flt: [], list: [] }, LAST = { flt: null, list: null }, FR = {}, SRCS = {};
window.__runs = { flt: 0, list: 0 }; window.__masks = { flt: [], list: [] }; window.__ms = { flt: [], list: [] };
window.__bytes = { flt: [], list: [] }; window.__runMs = { flt: [], list: [] }; window.__errs = []; window.__req = { flt: 0, list: 0 };
var row = document.createElement('div');
row.className = 'grid-row';
row.style.height = H + 'px';
grid.appendChild(row);
['flt', 'list'].forEach(function (c) {
  var id = IDS[c], col = document.createElement('div');
  col.className = 'grid-column' + (c === 'list' ? ' list' : '');
  if (c === 'flt') col.style.width = PW + 'px';
  col.innerHTML = '<div class="dashboard-component-chart-holder"><div class="dashboard-chart dashboard-chart-id-' + id + '">'
    + '<div class="chart-container"><div class="slice_container"><div id="chart-id-' + id + '"><div class="react_sanbbox">'
    + '<iframe sandbox="allow-scripts" name="' + c + '"></iframe></div></div><img class="echarts-plugin"></div></div></div></div>';
  row.appendChild(col);
  FR[c] = col.querySelector('iframe');
  FR[c].srcdoc = INNER.replace('__NAME__', c);
});
function incoming(c) {
  var out = [];
  ['flt', 'list'].forEach(function (e) { if (SCOPE[e].indexOf(c) > -1) out = out.concat(MASKS[e]); });
  return out;
}
function load(c) {
  var mask = incoming(c), key = JSON.stringify(mask);
  if (key === LAST[c]) return;
  LAST[c] = key;
  var t0 = Date.now();
  window.__req[c]++;
  setTimeout(function () {
    fetch('/data?user=' + encodeURIComponent(USER) + '&mode=' + MODE + '&view=' + (c === 'flt' ? 'filters' : 'list') + '&mask=' + encodeURIComponent(key))
      .then(function (r) { return r.text(); })
      .then(function (t) {
        if (LAST[c] !== key) return;   // пришёл устаревший ответ — Proteus его тоже не покажет
        window.__ms[c].push(Date.now() - t0); window.__bytes[c].push(t.length);
        FR[c].contentWindow.postMessage({ type: 'RUN', rows: JSON.parse(t) }, '*');
      });
  }, LAST[c + ':first'] ? DELAY : 0);
  LAST[c + ':first'] = 1;
}
window.addEventListener('message', function (e) {
  var d = e.data || {}, c = d.chart;
  if (!c) { ['flt', 'list'].forEach(function (x) { if (FR[x].contentWindow === e.source) c = x; }); }
  if (d.type === 'STAND_READY') {
    fetch('/chart.js?mode=' + MODE + '&kind=' + c).then(function (r) { return r.text(); }).then(function (t) {
      FR[c].contentWindow.postMessage({ type: 'SRC', src: t }, '*');
      load(c);
    });
  } else if (d.type === 'STAND_RUN') { window.__runs[c]++; window.__runMs[c].push(d.ms); }
  else if (d.type === 'STAND_ERR') { window.__errs.push(c + ': ' + d.err); }
  else if (d.type === 'ECHARTS_APPLY_CROSS_FILTER') {
    window.__masks[c].push(d.filters);
    MASKS[c] = d.filters || [];
    SCOPE[c].forEach(load);
  } else if (d.type === 'ECHARTS_UPDATE_DATA_URL' && c) {
    FR[c].parentNode.parentNode.parentNode.querySelector('img.echarts-plugin').src = d.dataUrl;
  }
});
</script></body></html>'''


def chart_source(mode, kind):
    """Файлы поставки КП отличаются строкой ns: так и здесь."""
    src = open(CHARTS[kind], encoding='utf-8').read()
    ns = {'list': ("  ns: 'dl',\n", "  ns: 'dlk',\n"), 'flt': ("  ns: 'dlf',\n", "  ns: 'dlkf',\n")}[kind]
    assert ns[0] in src
    return src.replace(ns[0], ns[1], 1) if mode == 'kp' else src


def page(mode):
    css = open(CSS, encoding='utf-8').read()
    ids = {}
    for (m, kind), cid in IDS.items():
        if m == mode:
            ids[kind] = cid
    return (PAGE.replace('__CSS__', css).replace('__IDS__', json.dumps(ids))
            .replace('__INNER__', json.dumps(INNER).replace('</', '<\\/')))


def rows_for(mask, user, mode, view):
    """Маска кросс-фильтра → фильтры датасета (колонка → значения), как filter_values."""
    flt = {}
    for f in mask or []:
        flt.setdefault(f['column'], []).extend(f['value'])
    with LOCK:
        rows, _ = ch.dataset(flt, user, mode, raw_carriers=True, view=view)
    return rows


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        b = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype + '; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        mode = 'kp' if q.get('mode') == ['kp'] else 'us'
        if u.path == '/':
            return self.send(200, page(mode), 'text/html')
        if u.path == '/chart.js':
            return self.send(200, chart_source(mode, 'flt' if q.get('kind') == ['flt'] else 'list'), 'application/javascript')
        if u.path == '/data':
            try:
                t0 = time.time()
                view = 'filters' if q.get('view') == ['filters'] else 'list'
                rows = rows_for(json.loads(q.get('mask', ['[]'])[0]), q.get('user', ['a.user'])[0], mode, view)
                body = json.dumps(rows, ensure_ascii=True)
                print('%s %s %s %d строк %.2f с %.2f МБ' % (mode, view, q.get('user', ['a.user'])[0], len(rows), time.time() - t0,
                                                         len(body) / 1e6), flush=True)
                return self.send(200, body, 'application/json')
            except Exception as e:  # noqa: BLE001 — стенд: ошибку показать, не упасть
                return self.send(500, json.dumps({'error': str(e)[:2000]}, ensure_ascii=False), 'application/json')
        return self.send(404, 'not found', 'text/plain')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print('стенд: http://127.0.0.1:%d/?user=a.user&mode=us  (КП — &mode=kp)' % port, flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
