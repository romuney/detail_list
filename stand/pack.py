"""Папка поставки: копии исходников «что куда вставлять».

    python3 stand/pack.py           # обновить файлы 1–4 из proteus/
    python3 stand/pack.py --check   # только сверить: копии == исходники (код 1 — разошлись)

Исходники — источник правды: proteus/detail-list.data.sql и proteus/detail-list.chart.js.
Файл КП отличается от исходника одной строкой: в SQL — MODE = 'kp', в JS — ns 'dlk'
(свои состояние, стили и тултип у второго чарта на том же дашборде). Файлы 0 и 5 папки
пишутся руками и здесь не трогаются.
"""
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PACK = os.path.join(ROOT, 'Поставка — Детальные списки')
SQL = os.path.join(ROOT, 'proteus', 'detail-list.data.sql')
JS = os.path.join(ROOT, 'proteus', 'detail-list.chart.js')


def one_line(text, old, new):
    assert text.count(old) == 1, 'в исходнике должна быть ровно одна строка: ' + old.strip()
    return text.replace(old, new)


def copies():
    sql = open(SQL, encoding='utf-8').read()
    js = open(JS, encoding='utf-8').read()
    return [
        ('1. Датасет «Детальные списки».sql', one_line(sql, "{% set MODE = 'us' %}\n", "{% set MODE = 'us' %}\n")),
        ('2. Датасет «Детальные списки КП».sql', one_line(sql, "{% set MODE = 'us' %}\n", "{% set MODE = 'kp' %}\n")),
        ('3. Чарт «Детальные списки».js', one_line(js, "  ns: 'dl',\n", "  ns: 'dl',\n")),
        ('4. Чарт «Детальные списки КП».js', one_line(js, "  ns: 'dl',\n", "  ns: 'dlk',\n")),
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
