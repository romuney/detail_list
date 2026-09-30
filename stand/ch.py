"""Датасеты «Детальных списков» в chdb (ClickHouse 24.8): рендер Jinja как в Proteus и запуск.

    from ch import dataset, current, decode
    rows = dataset({'flt_f': ['emp_stream_desc=…']}, user='a.user', mode='us')

render()   — Jinja с filter_values / get_filters / current_username / where_in, как в Proteus;
             always_true=True — как при сохранении датасета (filter_values → AlwaysTrueObject).
dataset()  — новый датасет proteus/detail-list.data.sql (mode 'us' | 'kp'), обёрнутый так же,
             как Proteus оборачивает чарт: SELECT измерений FROM (датасет) GROUP BY … LIMIT.
             Носители передаются основой с '_f'; у КП они уходят как '_kf' (так их шлёт чарт КП),
             raw_carriers=True — как есть; reprinted=True — запрос перепечатан sqlglot, как его
             может перепечатать Proteus (Superset 4.1+ форматирует SQL чарта sqlglot).
current()  — прежний датасет из выгрузки (mdm_employee_d_detail_echarts / …functional_echarts) —
             оракул проверок: те же сотрудники и те же значения полей.
decode()   — разбор ответа нового датасета: meta, строки (list); словари, деревья и куб (filters).
cube_count() — счётчики панели по кубу, как их считает чарт (для сверки с независимым расчётом).

В chdb 2.1.1 нет base64Encode: ClickHouse отдаёт строку, base64 делает Python —
размер ответа тот же, что в бою.
"""
import base64
import hashlib
import json
import os
import re
import time

import jinja2
import jinja2.sandbox
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATASET = os.path.join(ROOT, 'proteus', 'detail-list.data.sql')
ORACLE = {'us': os.path.join(ROOT, 'datasets', 'Proteus_CROSS', 'mdm_employee_d_detail_echarts.yaml'),
          'kp': os.path.join(ROOT, 'datasets', 'Proteus_CROSS', 'mdm_employee_d_detail_functional_echarts.yaml')}
DB = os.environ.get('DL_DB') or os.path.join(HERE, '.db')
MEASURES = ['role', 'k', 'v', 'n', 'j']
ROW_LIMIT = 50000

_S = None


def session():
    global _S
    if _S is None:
        from chdb import session as chs
        _S = chs.Session(DB)
    return _S


class AlwaysTrue(object):
    """Как AlwaysTrueObject Proteus при сохранении датасета: истинный, итерация пустая."""
    def __bool__(self):
        return True

    def __iter__(self):
        return iter(())

    def __str__(self):
        return ''


class Flt(object):
    def __init__(self, col, val):
        self.col, self.val, self.op = col, val, 'IN'


def where_in(values, mark="'"):
    def q(v):
        return mark + v.replace("'", "''") + mark if isinstance(v, str) else str(v)
    return '(' + ', '.join(q(v) for v in values) + ')'


def render(text, flt=None, user='a.user', always_true=False):
    flt = flt or {}
    env = jinja2.sandbox.SandboxedEnvironment(extensions=['jinja2.ext.do'])
    env.filters['where_in'] = where_in

    def filter_values(col, default=None, remove_filter=False):
        if always_true:
            return AlwaysTrue()
        v = flt.get(col)
        if v is None:
            return [] if default is None else [default]
        return list(v) if isinstance(v, (list, tuple)) else [v]

    def get_filters(col, remove_filter=False):
        if always_true:
            return []
        v = flt.get(col)
        return [Flt(col, list(v))] if v else []

    def current_username(add_to_cache_keys=True):
        return user
    return env.from_string(text).render(filter_values=filter_values, get_filters=get_filters,
                                        current_username=current_username)


def source(mode='us'):
    text = open(DATASET, encoding='utf-8').read()
    assert "{% set MODE = 'us' %}" in text and "{% set VIEW = 'list' %}" in text
    return text.replace("{% set MODE = 'us' %}", "{% set MODE = '" + mode + "' %}")


def sql(flt=None, user='a.user', mode='us', always_true=False, view='list'):
    """view: list — датасет чарта списка, filters — датасет строки фильтров."""
    return render(source(mode).replace("{% set VIEW = 'list' %}", "{% set VIEW = '" + view + "' %}"), flt, user, always_true)


def _run(q, settings=''):
    t0 = time.time()
    r = session().query(q + ('\nSETTINGS ' + settings if settings else ''), 'JSONEachRow')
    dt = time.time() - t0
    rows = [json.loads(x) for x in r.bytes().decode('utf-8').splitlines() if x]
    return rows, dt


def stand_sql(text):
    """chdb без base64Encode: строку отдаёт ClickHouse, base64 — Python (decode/dataset)."""
    return re.sub(r'(?i)\bbase64Encode\(', '(', text)


def sqlglot_reprint(text):
    """Как Proteus (Superset 4.1+): разбор sqlglot диалектом clickhouse и печать им же."""
    import sqlglot
    return sqlglot.transpile(text, read='clickhouse', write='clickhouse')[0]


def carriers(flt, mode):
    """Носители чарта: основа + '_f' у «Детальных списков», + '_kf' у КП."""
    if mode != 'kp':
        return dict(flt or {})
    return {(k[:-2] + '_kf' if k.endswith('_f') else k): v for k, v in (flt or {}).items()}


def dataset(flt=None, user='a.user', mode='us', settings='', always_true=False, raw=False, raw_carriers=False,
            reprinted=False, view='list'):
    """Как Proteus: SELECT измерений FROM (датасет) AS virtual_table GROUP BY измерений LIMIT."""
    inner = sql(flt if raw_carriers else carriers(flt, mode), user, mode, always_true, view)
    q = ('SELECT %s FROM (%s) AS virtual_table GROUP BY %s LIMIT %d'
         % (', '.join(MEASURES), inner, ', '.join(MEASURES), ROW_LIMIT))
    q = stand_sql(sqlglot_reprint(q) if reprinted else q)
    rows, dt = _run(q, settings)
    if not raw:
        for r in rows:
            if r.get('role') in ('r', 'T', 'D'):
                r['j'] = base64.b64encode(r['j'].encode('utf-8')).decode('ascii')
    return rows, dt


def current(flt=None, user='a.user', mode='us', limit=None, settings=''):
    """Прежний датасет (выгрузка из корня репозитория) как есть; LIMIT можно снять для сверки."""
    d = yaml.safe_load(open(ORACLE[mode], encoding='utf-8'))
    text = render(d['sql'], flt, user)
    if limit is not None:
        text = re.sub(r'limit \d+\s*$', 'limit %d' % limit, text.rstrip(), flags=re.I)
    q = ('SELECT mdm_employee_rk, packed_b64, total_cnt, warden_first_nm FROM (%s) AS virtual_table '
         'GROUP BY mdm_employee_rk, packed_b64, total_cnt, warden_first_nm LIMIT %d' % (stand_sql(text), 10 ** 7))
    rows, dt = _run(q, settings)
    out = {}
    for r in rows:
        out[int(r['mdm_employee_rk'])] = json.loads('[' + r['packed_b64'] + ']')
    return out, rows, dt


def _unesc(v):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 'r': '\r'}.get(m.group(1), m.group(1)), v)


def _fixed(txt, w, A):
    out = []
    for p in range(0, len(txt) - w + 1, w):
        v = 0
        for ch in txt[p:p + w]:
            v = v * 64 + A[ch]
        out.append(v)
    return out


def decode(rows):
    """Ответ нового датасета → {'meta', 'rows', 'cols', 'roles', 'dict', 'trees', 'cube', 'N'}.

    trees[tk] — узлы в порядке обхода: {'id', 'lvl', 'own', 'name', 'par', 'end', 'path'}; у КП id = путь через \\x1f.
    cube[k] — список на сотрудника: код словаря (атрибут), номер узла или -1 (mu / lu), список кодов / узлов
    (regional_hr_login / kp)."""
    res = {'meta': None, 'rows': [], 'cols': [], 'roles': set(), 'dict': {}, 'trees': {}, 'cube': {}, 'N': 0}
    chunks, tree_chunks, cube_chunks = [], {}, {}
    for r in rows:
        role = r['role']
        res['roles'].add(role)
        if role == 'meta':
            res['meta'] = json.loads(r['j'])
            res['meta']['n'] = int(r['n'])
        elif role == 'D':
            text = base64.b64decode(r['j']).decode('utf-8') if r['j'] else ''
            res['dict'][r['k']] = [_unesc(v) for v in text.split('\n')] if int(r['v']) else []
        elif role == 'T':
            c, nodes = r['v'].split(':')
            tree_chunks.setdefault(r['k'], []).append((int(c), int(nodes), r['j']))
        elif role == 'C':
            c, w, m = r['v'].split(':')
            cube_chunks.setdefault(r['k'], []).append((int(c), int(w), m == '1', int(r['n']), r['j']))
        elif role == 'r':
            chunks.append((int(r['k']), r['j']))
    for tk, parts in tree_chunks.items():
        stack, out, leaf = [], [], [None]
        for _, nodes, j in sorted(parts):
            for line in (base64.b64decode(j).decode('utf-8') if j else '').split('\n'):
                if line == '':
                    continue
                p = line.split('\t')
                if tk == 'kp':
                    lvl, own, name, rid = int(p[0]), p[1] == '1', p[2], None
                else:
                    rid, lvl, own, name = p[0], int(p[1]), p[2] == '1', p[3]
                while stack and out[stack[-1]]['lvl'] >= lvl:
                    out[stack.pop()]['end'] = len(out) - 1
                par = stack[-1] if stack else -1
                node = {'lvl': lvl, 'own': own, 'name': name, 'par': par, 'nodes': nodes}
                node['path'] = ((out[par]['path'] + '\x1f') if par >= 0 else '') + name
                node['id'] = node['path'] if tk == 'kp' else rid
                stack.append(len(out))
                out.append(node)
                if own:
                    leaf.append(len(out) - 1)
        while stack:
            out[stack.pop()]['end'] = len(out) - 1
        res['trees'][tk] = out
        res['trees'][tk + ':leaf'] = leaf
    if res['meta'] and cube_chunks:
        A = {c: i for i, c in enumerate(res['meta']['m']['alph'])}
        res['N'] = sum(x[3] for x in cube_chunks.get('emp', []))
        for k, parts in cube_chunks.items():
            leaf = res['trees'].get(k + ':leaf')
            vals = []
            for _, w, multi, n, j in sorted(parts):
                if multi:
                    emps = j.split('.')
                    assert len(emps) == n, (k, len(emps), n)
                    for e in emps:
                        codes = _fixed(e, w, A)
                        vals.append([leaf[c] for c in codes] if leaf else codes)
                else:
                    codes = _fixed(j, w, A)
                    assert len(codes) == n, (k, len(codes), n)
                    vals.extend([(leaf[c] if c else -1) for c in codes] if leaf else codes)
            assert len(vals) == res['N'], (k, len(vals), res['N'])
            res['cube'][k] = vals
    res['cols'] = res['meta']['a']['cols'] if res['meta'] else []
    for _, j in sorted(chunks):
        text = base64.b64decode(j).decode('utf-8') if j else ''
        for line in text.split('\n'):
            if line != '':
                res['rows'].append(line.split('\t'))
    return res


EMP_BIT = {'Юридическая': 1, 'Активная': 2}
TCR_BIT = {'ТЦР РФ': 1, 'ТЦР СНГ': 2, 'ТЦР РФ + ТЦР СНГ': 4}


def cube_count(d, sel, skip=None):
    """Как чарт: сотрудники куба под выбором sel = {'flt': {атрибут: [значения]}, 'mu'|'lu'|'kp': [id узлов],
    'emp': 'Юридическая'|'Активная', 'tcr': ''|…}, кроме фильтра skip. Возвращает список номеров сотрудников."""
    tests = []
    emp = sel.get('emp') or 'Юридическая'
    if skip != 'emp':
        dv = d['dict']['emp']
        tests.append(lambda e, b=EMP_BIT[emp]: int(dv[d['cube']['emp'][e]]) & b)
    if sel.get('tcr') and skip != 'tcr':
        dt = d['dict']['tcr']
        tests.append(lambda e, b=TCR_BIT[sel['tcr']]: int(dt[d['cube']['tcr'][e]]) & b)
    for a, vals in (sel.get('flt') or {}).items():
        if a == skip or not vals:
            continue
        codes = set(i for i, v in enumerate(d['dict'][a]) if v in vals)
        col = d['cube'][a]
        if a == 'regional_hr_login':
            tests.append(lambda e, col=col, codes=codes: any(c in codes for c in col[e]))
        else:
            tests.append(lambda e, col=col, codes=codes: col[e] in codes)
    for tk in ('mu', 'lu', 'kp'):
        ids = sel.get(tk) or []
        if not ids or tk == skip:
            continue
        T = d['trees'][tk]
        cov = set()
        for i, x in enumerate(T):
            if x['id'] in ids:
                cov.update(range(i, x['end'] + 1))
        col = d['cube'][tk]
        if tk == 'kp':
            tests.append(lambda e, col=col, cov=cov: any(c in cov for c in col[e]))
        else:
            tests.append(lambda e, col=col, cov=cov: col[e] in cov)
    return [e for e in range(d['N']) if all(t(e) for t in tests)]


def size(rows):
    """JSON-ответ Proteus: записи, кириллица экранирована (simplejson по умолчанию)."""
    return len(json.dumps({'result': [{'data': rows}]}, ensure_ascii=True))
