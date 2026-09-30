"""Папка поставки: копии исходников «что куда вставлять».

    python3 stand/pack.py           # обновить файлы 1–8 и 10 из proteus/
    python3 stand/pack.py --check   # только сверить: копии == исходники (код 1 — разошлись)

Исходники — источник правды: proteus/detail-list.data.sql, proteus/detail-list.chart.js (список) и
proteus/detail-list-filters.chart.js (строка фильтров). Датасеты отличаются строками MODE (вкладка) и
VIEW (чарт), JS — строкой ns (свои состояние, стили и тултип у каждого чарта на дашборде).
Файл 10 — проверка на бою одним запросом (stand/diag.py, собирается из того же SQL).
Файлы 0 и 9 папки пишутся руками и здесь не трогаются.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import diag  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PACK = os.path.join(ROOT, 'Поставка — Детальные списки')
SQL = os.path.join(ROOT, 'proteus', 'detail-list.data.sql')
JS = os.path.join(ROOT, 'proteus', 'detail-list.chart.js')
JSF = os.path.join(ROOT, 'proteus', 'detail-list-filters.chart.js')


def one_line(text, old, new):
    assert text.count(old) == 1, 'в исходнике должна быть ровно одна строка: ' + old.strip()
    return text.replace(old, new)


def sql_for(sql, mode, view):
    return one_line(one_line(sql, "{% set MODE = 'us' %}\n", "{% set MODE = '" + mode + "' %}\n"),
                    "{% set VIEW = 'list' %}\n", "{% set VIEW = '" + view + "' %}\n")


def copies():
    sql = open(SQL, encoding='utf-8').read()
    js = open(JS, encoding='utf-8').read()
    jsf = open(JSF, encoding='utf-8').read()
    return [
        ('1. Датасет «Детальные списки».sql', sql_for(sql, 'us', 'list')),
        ('2. Датасет «Детальные списки КП».sql', sql_for(sql, 'kp', 'list')),
        ('3. Датасет «Детальные списки: фильтры».sql', sql_for(sql, 'us', 'filters')),
        ('4. Датасет «Детальные списки КП: фильтры».sql', sql_for(sql, 'kp', 'filters')),
        ('5. Чарт «Детальные списки».js', one_line(js, "  ns: 'dl',\n", "  ns: 'dl',\n")),
        ('6. Чарт «Детальные списки КП».js', one_line(js, "  ns: 'dl',\n", "  ns: 'dlk',\n")),
        ('7. Чарт «Детальные списки: фильтры».js', one_line(jsf, "  ns: 'dlf',\n", "  ns: 'dlf',\n")),
        ('8. Чарт «Детальные списки КП: фильтры».js', one_line(jsf, "  ns: 'dlf',\n", "  ns: 'dlkf',\n")),
        (os.path.basename(diag.OUT), diag.build()),
    ]


if __name__ == '__main__':
    check = '--check' in sys.argv
    bad = 0
    os.makedirs(PACK, exist_ok=True)
    for name, text in copies():
        path = os.path.join(PACK, name)
        same = os.path.exists(path) and open(path, encoding='utf-8').read() == text
        if check:
            print(('ok     ' if same else 'РАЗНЫЕ ') + name)
            bad += 0 if same else 1
        elif not same:
            open(path, 'w', encoding='utf-8').write(text)
            print('→ ' + name)
    sys.exit(1 if bad else 0)
