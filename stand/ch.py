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
decode()   — разбор ответа нового датасета: meta, фасеты, узлы, найденное, строки.

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
            if r.get('role') in ('r', 'T', 'F'):
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


def decode(rows):
    """Ответ нового датасета → {'meta', 'f', 'fq', 't', 'q', 's', 'rows', 'cols', 'roles'}; узлы T — в 't'."""
    res = {'meta': None, 'f': {}, 'fq': {}, 't': {}, 'q': {}, 's': {}, 'rows': [], 'cols': [], 'roles': set()}
    chunks, tree_chunks = [], {}
    for r in rows:
        role = r['role']
        res['roles'].add(role)
        if role == 'meta':
            res['meta'] = json.loads(r['j'])
            res['meta']['n'] = int(r['n'])
        elif role == 'f':
            a, nv = r['j'].split('\t')
            res['f'].setdefault(r['k'], {})[r['v']] = (int(r['n']), int(a), int(nv))
        elif role == 'fq':
            res['fq'].setdefault(r['k'], {})[r['v']] = (int(r['n']), int(r['j']))
        elif role in ('t', 'q', 's'):
            # уровень, родитель, имя, всего, есть дети, путь, узлов в дереве (у t)
            parts = r['j'].split('\t')
            assert len(parts) == 7, (role, r['j'])
            node = {'id': r['v'], 'n': int(r['n']), 'lvl': int(parts[0]), 'pid': parts[1], 'name': parts[2], 'all': int(parts[3]),
                    'hk': int(parts[4]), 'path': parts[5], 'nodes': int(parts[6]) if parts[6] else None}
            res[role].setdefault(r['k'], []).append(node)
        elif role == 'F':
            # атрибут одной строкой: «значение\tсотрудников» по строке, в значении \ \t \n \r экранированы
            nv = int(r['v'])
            text = base64.b64decode(r['j']).decode('utf-8') if r['j'] else ''
            for line in text.split('\n'):
                if line == '':
                    continue
                v, n = line.rsplit('\t', 1)
                v = re.sub(r'\\(.)', lambda m: {'t': '\t', 'n': '\n', 'r': '\r'}.get(m.group(1), m.group(1)), v)
                res['f'].setdefault(r['k'], {})[v] = (int(n), None, nv)
        elif role == 'T':
            # пачки узлов в порядке обхода в глубину: УС / ЮС — «rk, уровень, при остальных, есть дети, имя»,
            # КП — «уровень, при остальных, есть дети, имя»; родитель — ближайший выше узел меньшего уровня
            tree_chunks.setdefault(r['k'], []).append((int(r['v'].split(':')[0]), int(r['v'].split(':')[1]), r['j']))
        elif role == 'r':
            chunks.append((int(r['k']), r['j']))
    for tk, parts in tree_chunks.items():
        stack, out = [], []
        for _, nodes, j in sorted(parts):
            for line in (base64.b64decode(j).decode('utf-8') if j else '').split('\n'):
                if line == '':
                    continue
                p = line.split('\t')
                if tk == 'kp':
                    lvl, n, hk, name = int(p[0]), int(p[1]), int(p[2]), p[3]
                else:
                    rid, lvl, n, hk, name = p[0], int(p[1]), int(p[2]), int(p[3]), p[4]
                while stack and stack[-1]['lvl'] >= lvl:
                    stack.pop()
                par = stack[-1] if stack else None
                node = {'n': n, 'lvl': lvl, 'name': name, 'all': None, 'hk': hk, 'nodes': nodes}
                if tk == 'kp':
                    node['path'] = (par['path'] + '\x1f' if par else '') + name
                    node['id'] = hashlib.md5(node['path'].encode('utf-8')).hexdigest()[:12]
                    node['pid'] = par['id'] if par else ''
                else:
                    node.update({'id': rid, 'pid': par['id'] if par else '', 'path': ''})
                stack.append(node)
                out.append(node)
        res['t'][tk] = out
    res['cols'] = res['meta']['a']['cols'] if res['meta'] else []
    for _, j in sorted(chunks):
        text = base64.b64decode(j).decode('utf-8') if j else ''
        for line in text.split('\n'):
            if line != '':
                res['rows'].append(line.split('\t'))
    return res


def size(rows):
    """JSON-ответ Proteus: записи, кириллица экранирована (simplejson по умолчанию)."""
    return len(json.dumps({'result': [{'data': rows}]}, ensure_ascii=True))
