"""Живой стенд чартов «Детальные списки»: страница с виджетом поверх датасета в chdb.

    python3 stand/live.py [порт]        # http://127.0.0.1:8766/?user=a.user&mode=us

Страница повторяет контракт Proteus: хост [_echarts_instance_], массив data,
applyCrossFilter(mask). Маска уходит в датасет как есть — носители с суффиксом чарта
('_f' у «Детальных списков», '_kf' у КП), как filter_values в бою; запрос идёт в chdb
(ch.dataset), скрипт чарта перезапускается с новыми строками — так Proteus ведёт себя
после кросс-фильтра с включённым самовлиянием.
?user= — логин (current_username): a.user (частичный доступ), hr.super, p.lead, nobody;
?mode=us|kp — чарт и датасет (у КП в чарте ns 'dlk', как в файле поставки);
?w= — ширина ячейки дашборда в px, ?h= — высота; ?selfoff=1 — самовлияние выключено:
эмит уходит, ответа нет (проверка предупреждения); ?delay= — задержка ответа, мс.
Счётчики для проверок: window.__runs (перезапуски скрипта), window.__masks (эмиты),
window.__ms (время запросов датасета, мс), window.__bytes (размер ответов, байт),
window.__runMs (время скрипта чарта: разбор ответа + разметка, мс).
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
CHART = os.path.join(HERE, '..', 'proteus', 'detail-list.chart.js')
LOCK = threading.Lock()   # сессия chdb — одна на процесс, запросы по очереди

PAGE = r'''<!doctype html><html><head><meta charset="utf-8"><title>Детальные списки · стенд</title>
<style>html,body{margin:0;height:100%;background:#e9ebef;font:13px Arial}
#cell{position:absolute;left:0;top:0;background:#fff}</style></head>
<body><div id="cell"><div _echarts_instance_="ec_1" style="width:100%;height:100%;position:relative"><canvas></canvas></div></div>
<script>
var Q = new URLSearchParams(location.search);
var USER = Q.get('user') || 'a.user', MODE = Q.get('mode') === 'kp' ? 'kp' : 'us', SELFOFF = Q.get('selfoff') === '1';
var DELAY = +(Q.get('delay') || 150);
var cell = document.getElementById('cell');
cell.style.width = Q.get('w') ? Q.get('w') + 'px' : '100%';
cell.style.height = Q.get('h') ? Q.get('h') + 'px' : '100%';
var SRC = null, MASK = JSON.parse(Q.get('mask') || '[]');
window.__masks = []; window.__runs = 0; window.__ms = []; window.__bytes = []; window.__runMs = [];
function run(rows) {
  window.data = rows; window.__runs++;
  var t0 = performance.now();
  (new Function('data', 'applyCrossFilter', SRC + '\n;return typeof option !== "undefined" ? option : null;'))(rows, applyCrossFilter);
  window.__runMs.push(Math.round(performance.now() - t0));
}
function load() {
  var t0 = Date.now();
  return fetch('/data?user=' + encodeURIComponent(USER) + '&mode=' + MODE + '&mask=' + encodeURIComponent(JSON.stringify(MASK)))
    .then(function (r) { return r.text(); })
    .then(function (t) { window.__ms.push(Date.now() - t0); window.__bytes.push(t.length); return JSON.parse(t); });
}
function applyCrossFilter(mask) {
  window.__masks.push(mask);
  if (SELFOFF) return;
  MASK = mask || [];
  setTimeout(function () { load().then(run); }, DELAY);
}
fetch('/chart.js?mode=' + MODE).then(function (r) { return r.text(); }).then(function (t) { SRC = t; return load(); }).then(run);
</script></body></html>'''


def chart_source(mode):
    """Файл поставки КП отличается строкой ns: так и здесь."""
    src = open(CHART, encoding='utf-8').read()
    if mode == 'kp':
        assert "  ns: 'dl',\n" in src
        src = src.replace("  ns: 'dl',\n", "  ns: 'dlk',\n", 1)
    return src


def rows_for(mask, user, mode):
    """Маска кросс-фильтра → фильтры датасета (колонка → значения), как filter_values."""
    flt = {}
    for f in mask or []:
        flt.setdefault(f['column'], []).extend(f['value'])
    with LOCK:
        rows, _ = ch.dataset(flt, user, mode, raw_carriers=True)
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
            return self.send(200, PAGE, 'text/html')
        if u.path == '/chart.js':
            return self.send(200, chart_source(mode), 'application/javascript')
        if u.path == '/data':
            try:
                t0 = time.time()
                rows = rows_for(json.loads(q.get('mask', ['[]'])[0]), q.get('user', ['a.user'])[0], mode)
                body = json.dumps(rows, ensure_ascii=True)
                print('%s %s %d строк %.2f с %.2f МБ' % (mode, q.get('user', ['a.user'])[0], len(rows), time.time() - t0, len(body) / 1e6), flush=True)
                return self.send(200, body, 'application/json')
            except Exception as e:  # noqa: BLE001 — стенд: ошибку показать, не упасть
                return self.send(500, json.dumps({'error': str(e)[:2000]}, ensure_ascii=False), 'application/json')
        return self.send(404, 'not found', 'text/plain')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print('стенд: http://127.0.0.1:%d/?user=a.user&mode=us  (КП — &mode=kp)' % port, flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
