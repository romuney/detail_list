"""Мок для smoke скилла: ответ датасета со всеми частями (строки, значения фильтров, деревья).

    python3 stand/mock.py        # proteus/detail-list.mock.json (live.py остановить: chdb держит каталог)

Пользователь a.user (частичный доступ — есть маски warden), режим us, все колонки (как
в ответе датасета), 500 строк — одна пачка: smoke видит таблицу, поповеры и тултипы
с настоящими данными, без эмита.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ch  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'proteus', 'detail-list.mock.json')
if __name__ == '__main__':
    rows, _ = ch.dataset({'pt_f': ['r', 'f', 'mu', 'lu', 'kp']}, 'a.user', 'us')
    out, n = [], 0
    for r in rows:
        # 500 сотрудников (одна пачка) со всеми колонками — мок не раздувается
        if r['role'] == 'r' and int(r['k']) > 0:
            continue
        out.append(r)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print('%s: %d строк, %.0f КБ' % (os.path.relpath(OUT), len(out), os.path.getsize(OUT) / 1024))
