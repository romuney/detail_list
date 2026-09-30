{#- ============================================================================
    detail_list — датасеты «Детальных списков»: MODE — вкладка (us — «Детальные списки»,
    kp — «Детальные списки КП»), VIEW — чарт (list — список, filters — строка фильтров над ним).
    Четыре датасета поставки отличаются только строками MODE и VIEW ниже.

    Вкладка — два чарта: строка фильтров и список. Фильтры эмитит строка фильтров (себе и
    списку), список — только себе сортировку, лимит и колонки. Оба запроса идут параллельно.
      list     meta и строки: первые 5 000 сотрудников, колонки — закреплённые и запрошенные
               (по умолчанию MasterID и дата найма). Страницы, поиск по таблице, сортировка
               загруженного, группировка и «Копировать» — в чарте, без запроса.
      filters  meta, все значения фильтров и деревья УС / ЮС / КП целиком, счётчики — при
               ОСТАЛЬНЫХ фильтрах (влияние фильтра на фильтр); открыть фильтр — без запроса.
               Поиск (q) — только если значений или узлов больше, чем приходит сразу.

    Строки различаются колонкой role:
      meta  всегда, 1 строка: k — режим (us | kp), n — сотрудников под фильтрами, j — JSON
            {"m": итоги и эхо одиночных параметров, "a": эхо списков, "dates": даты «Периода»
            (только filters)}
      f     filters — значения фильтров: k — атрибут, v — значение, n — сотрудников при
            ОСТАЛЬНЫХ фильтрах, j — «всего без фильтров\tзначений у атрибута». У атрибута —
            до FACET_TOP значений по численности и все выбранные, остальные — поиском (fq)
      fq    значения атрибута по q = 'f:атрибут=текст': j — всего без фильтров
      T     filters — узлы деревьев УС / ЮС / КП пачками по TREE_CHUNK: k — дерево, v — номер
            пачки, j — base64 от UTF-8, узел в строке: «id\tсотрудников при остальных
            фильтрах\tуровень\tродитель\tимя\tвсего\tесть дети\tпуть КП\tузлов в дереве»
            (id — rk; у КП — 12 знаков md5 пути). Дерево до TREE_FULL_MAX узлов — целиком,
            больше — верхние TREE_TOP уровня, путь до выбранного и дети выбранного
      q     узлы по q = 'mu|lu|kp=текст' (имя на любом уровне, до SEARCH_TOP) или 'mu|lu>rk',
            'kp>путь' (дети узла, до CHILD_TOP): v — id, j — «уровень\tродитель\tимя\tвсего\t
            есть дети\tпуть\t», путь — имена предков через ' › ' (у КП — путь узла)
      s     filters — выбранные узлы УС / ЮС (если выбраны): уровень, имя и путь для подписи
      r     list — строки списка пачками по CHUNK: k — номер пачки, j — base64 от UTF-8, поля
            через табуляцию в порядке эха cols, строки через перевод строки; скрытое warden —
            '⛔'. У КП — строка на аллокацию, если среди колонок есть аллокация или уровень КП
            (поля сотрудника, кроме MasterID, — только в первой строке сотрудника), иначе
            строка на сотрудника

    Носители в SELECT не выводятся. Имя носителя — основа плюс CF: у вкладки «Детальные
    списки» '_f', у КП '_kf' — фильтр одной вкладки не попадает в датасеты другой. Основы:
      строка фильтров: per (last | date), dt (YYYY-MM-DD), emp (Юридическая | Активная),
        tcr (тип ЮЛ), flt ('атрибут=значение'), mu / lu (rk узлов УС / ЮС), kp (путь узла КП
        именами через \x1F), id ('rk|login|tab|siebel=значение'), q (поиск), frq (метка);
      список: sort ('ключ:asc|desc'), lim (5000 | 10000 | 25000), cols (ключи колонок),
        rq (метка). Метки возвращаются в эхе meta.

    Сначала отобрать, потом упаковать: id сотрудников — ORDER BY … LIMIT по отфильтрованной
    таблице, маски warden и упаковка — только для них. Значения фильтров и деревья — из той
    же таблицы: справочники структур и датасеты нативных фильтров не нужны.

    Доступ — как в прежнем датасете: warden_access_array_cross по current_username()
    маскирует персональные данные, грейд, сеньорность и оценку; без строки в warden
    приходит только meta (ok = 0). ClickHouse 24.8: без SETTINGS, ifNull на каждом выходе.

    Proteus разбирает отрендеренный SQL парсером sqlglot ещё до ClickHouse (сохранение
    датасета падает «Некорректный SQL запрос») и может перепечатать его им же. Поэтому: без
    алиасов в GROUP BY (номер пачки — колонкой подзапроса), без \x-экранов в строках — '\x1F'
    перепечатается как '\\x1F' (четыре знака): разделитель пути КП — char(31). Проверка —
    stand/parse.py (разбор) и круг sqlglot в stand/check.py (перепечатанный SQL отдаёт то же).
============================================================================ -#}
{% set MODE = 'us' %}
{% set VIEW = 'list' %}
{% set KP = MODE == 'kp' %}
{#- Вид: list — чарт списка (meta + строки); filters — чарт фильтров (meta + все значения и деревья). -#}
{% set FLTV = VIEW == 'filters' %}
{#- Носители кросс-фильтра: основа + CF. -#}
{% set CF = '_kf' if KP else '_f' %}
{% set LIM_DEFAULT = 5000 %}
{% set LIM_ALLOWED = [5000, 10000, 25000] %}
{% set CHUNK = 500 %}
{#- Чарт фильтров получает всё сразу: у атрибута — до FACET_TOP значений (по численности + выбранные),
    дерево до TREE_FULL_MAX узлов — целиком; больше — верх и окрестность выбранного, остальное — поиском. -#}
{% set FACET_TOP = 5000 %}
{% set TREE_FULL_MAX = 40000 %}
{#- Узлы дерева — пачками по TREE_CHUNK строк (иначе десятки тысяч строк ответа против лимита строк чарта). -#}
{% set TREE_CHUNK = 2000 %}
{% set TREE_TOP = 3 %}
{% set SEARCH_TOP = 60 %}
{% set CHILD_TOP = 1000 %}
{% set MASK = "'⛔'" %}

{#- ---- реестр полей: ключ чарта → колонка источника ---- -#}
{% set PERSONAL = ['last_nm', 'first_nm', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'has_children_flg',
                   'employee_document_type_desc', 'citizenship_country_desc', 'registration_state_nm', 'registration_city_nm',
                   'marital_status_desc', 'hr_head_nm', 'management_head_nm', 'hrbp_nm', 'contact_main_phone_no',
                   'prs_email_address_txt', 'residential_full_address_txt', 'registration_full_address_txt'] %}
{% set GRADE = ['grade', 'change_grade_dt_text'] %}
{% set SENIORITY = ['seniority'] %}
{% set REVIEW = ['summary_score'] %}
{% set SRCCOL = {'master_id': 'mdm_employee_rk', 'hiredate': 'company_hire_dt', 'my_link': 'employee_link', 'alloc': 'allocation_prt_norm',
                 'kp1': 'lvl1_functional_unit_nm', 'kp2': 'lvl2_functional_unit_nm', 'kp3': 'lvl3_functional_unit_nm',
                 'kp4': 'lvl4_functional_unit_nm', 'kp5': 'lvl5_functional_unit_nm', 'kp6': 'lvl6_functional_unit_nm',
                 'kp7': 'lvl7_functional_unit_nm', 'kp8': 'lvl8_functional_unit_nm', 'kp9': 'lvl9_functional_unit_nm',
                 'kp10': 'lvl10_functional_unit_nm', 'kp11': 'lvl11_functional_unit_nm', 'kp12': 'lvl12_functional_unit_nm'} %}
{% set NUMERIC = ['master_id', 'birth_day', 'birth_month', 'mdm_employee_age', 'has_children_flg', 'work_experience_year', 'grade',
                  'hr_head_mdm_employee_rk', 'legal_head_flg', 'management_head_flg', 'management_head_mdm_employee_rk',
                  'hrbp_mdm_employee_rk', 'hrap_mdm_employee_rk', 'alloc'] %}
{% set DATES = ['hiredate', 'birth_dt', 'company_fire_dt', 'change_management_head_dt', 'legal_hire_dt', 'legal_fire_dt',
                'employee_main_contract_end_dt'] %}
{% set EMP_KEYS = ['master_id', 'hiredate', 'my_link', 'last_nm', 'first_nm', 'full_nm', 'birth_dt', 'birth_day', 'birth_month',
                   'mdm_employee_age', 'age_generation_nm', 'contact_main_phone_no', 'prs_email_address_txt',
                   'employee_document_type_desc', 'citizenship_country_desc', 'registration_state_nm', 'registration_city_nm',
                   'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt',
                   'doc_city_nm', 'marital_status_desc', 'gender_desc', 'education_degree_unique_max', 'education_spec_nm',
                   'has_children_flg', 'location_type', 'macroregion_nm', 'office_desc', 'ad_login', 'wo_employee_login',
                   'wrk_email_address_txt', 'clothes_size_code', 'party_id', 'company_fire_dt', 't_education_desc',
                   'work_experience_year', 'experience_group_nm', 'active_type_nm', 'seniority', 'grade', 'change_grade_dt_text',
                   'change_specialization_dt_text', 'change_management_unit_dt_text', 'change_management_head_dt',
                   'summary_score', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc',
                   'legal_position_nm', 'employee_main_work_no', 'legal_hire_dt', 'legal_fire_dt', 'lvl1_legal_unit_nm',
                   'lvl2_legal_unit_nm', 'lvl3_legal_unit_nm', 'lvl4_legal_unit_nm', 'lvl5_legal_unit_nm', 'lvl6_legal_unit_nm',
                   'lvl7_legal_unit_nm', 'hr_head_nm', 'regional_hr_login', 'hr_head_mdm_employee_rk', 'code_1c',
                   'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_head_flg',
                   'employee_main_schedule_nm', 'emp_contract_no', 'lvl3_mapped_management_unit_nm',
                   'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm',
                   'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm',
                   'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm',
                   'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc',
                   'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'head_wo_employee_login',
                   'head_wrk_email_address_txt', 'management_head_mdm_employee_rk', 'hrbp_nm', 'hrbp_login',
                   'hrbp_mdm_employee_rk', 'hrap_login', 'hrap_mdm_employee_rk', 'subordination_lvl'] %}
{% set ALLOC_KEYS = ['alloc', 'kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8', 'kp9', 'kp10', 'kp11', 'kp12'] if KP else [] %}
{% set LOCKED = ['master_id', 'hiredate'] if not KP else ['master_id'] %}
{#- Атрибуты фильтров (значения — из самой таблицы). regional_hr_login — по массиву login_reg_hr_list, '-' — пустой. -#}
{% set FACETS = ['active_type_nm', 'employment_relation_type_desc', 'employee_contract_type_desc', 'employee_main_contract_type_nm',
                 'residential_state_nm', 'office_desc', 'emp_specialization_oper_code', 'emp_specialization_it_code',
                 'emp_stream_desc', 'emp_specialization_desc', 'management_head_flg', 'head_lvl_segment', 'subordination_lvl',
                 'hrbp_login', 'regional_hr_login', 'legal_position_nm', 'mapping_channel_name', 'respond_source_nm',
                 'location_type', 'macroregion_nm', 'city_nm', 'tcr_exist_flg', 't_education_desc', 'company_fire_flg',
                 'rb_flg', 'rb_migration_flg'] %}

{#- ---- экранирование ---- -#}
{#- Строковый литерал ClickHouse: обратный слэш и кавычка экранируются. -#}
{% macro qs(v) -%}'{{ v|string|replace('\\', '\\\\')|replace("'", "\\'") }}'{%- endmacro %}
{#- Массив строк для has()/hasAny(); пустой — типизированный. -#}
{% macro qa(values) -%}
{%- if values|length == 0 -%}CAST([], 'Array(String)'){%- else -%}[{% for v in values %}{{ qs(v) }}{% if not loop.last %}, {% endif %}{% endfor %}]{%- endif -%}
{%- endmacro %}
{#- Кортеж для IN (не пустой): проверка — по множеству, как у IN со списком, а не перебором массива. -#}
{% macro qt(values) -%}({% for v in values %}{{ qs(v) }}{% if not loop.last %}, {% endif %}{% endfor %}){%- endmacro %}

{#- ---- носители кросс-фильтра. Списки собираются циклом: при сохранении датасета Proteus отдаёт
    вместо списка AlwaysTrueObject — у него нет длины, итерация пустая, остаются значения по умолчанию. ---- -#}
{% set me = (current_username() or '')|string|trim|lower %}
{#- Метки запроса: rq — чарта списка (сортировка, лимит, колонки), frq — чарта фильтров (фильтры, поиск);
    обе возвращаются в эхе — по ним чарты снимают «Загружаю…». -#}
{% set RQ = [] %}{% for v in (filter_values('rq' ~ CF) or []) %}{% if RQ|length < 1 %}{% set _ = RQ.append((v|string)[:40]) %}{% endif %}{% endfor %}
{% set FRQ = [] %}{% for v in (filter_values('frq' ~ CF) or []) %}{% if FRQ|length < 1 %}{% set _ = FRQ.append((v|string)[:40]) %}{% endif %}{% endfor %}
{% set PER_L = [] %}{% for v in (filter_values('per' ~ CF) or []) %}{% set _ = PER_L.append(v|string) %}{% endfor %}
{% set PER = 'date' if 'date' in PER_L else 'last' %}
{% set DT_L = [] %}{% for v in (filter_values('dt' ~ CF) or []) %}{% if DT_L|length < 1 %}{% set _ = DT_L.append((v|string|trim)[:10]) %}{% endif %}{% endfor %}
{% set DT = DT_L|first if (PER == 'date' and DT_L) else '' %}
{% set EMP_L = [] %}{% for v in (filter_values('emp' ~ CF) or []) %}{% set _ = EMP_L.append(v|string) %}{% endfor %}
{% set EMP = 'Активная' if 'Активная' in EMP_L else 'Юридическая' %}
{% set TCR_L = [] %}{% for v in (filter_values('tcr' ~ CF) or []) %}{% set _ = TCR_L.append(v|string) %}{% endfor %}
{% set TCR = TCR_L|first if (TCR_L and TCR_L|first in ['ТЦР РФ', 'ТЦР СНГ', 'ТЦР РФ + ТЦР СНГ']) else '' %}
{#- Значений атрибутов — до 200 у атрибута и до FLT_MAX всего: списки и эхо держат запрос меньше max_query_size. -#}
{% set FLT_MAX = 500 %}{% set F = {} %}{% set FLT_ECHO = [] %}
{% for v in (filter_values('flt' ~ CF) or []) %}{% set s = v|string %}{% if '=' in s %}{% set a = s.split('=', 1)[0] %}{% set x = s.split('=', 1)[1] %}{% if a in FACETS %}{% if a not in F %}{% set _ = F.update({a: []}) %}{% endif %}{% if F[a]|length < 200 and FLT_ECHO|length < FLT_MAX and x not in F[a] %}{% set _ = F[a].append(x) %}{% set _ = FLT_ECHO.append(s) %}{% endif %}{% endif %}{% endif %}{% endfor %}
{% set RHR = [] %}{% for x in F.get('regional_hr_login', []) %}{% if x != '-' %}{% set _ = RHR.append(x) %}{% endif %}{% endfor %}
{% set MU = [] %}{% for v in (filter_values('mu' ~ CF) or []) %}{% set s = v|string|trim %}{% if s and s|length <= 64 and s.isalnum() and MU|length < 50 and s not in MU %}{% set _ = MU.append(s) %}{% endif %}{% endfor %}
{% set LU = [] %}{% for v in (filter_values('lu' ~ CF) or []) %}{% set s = v|string|trim %}{% if s and s|length <= 64 and s.isalnum() and LU|length < 50 and s not in LU %}{% set _ = LU.append(s) %}{% endif %}{% endfor %}
{% set KPP = [] %}{% for v in (filter_values('kp' ~ CF) or []) %}{% set s = v|string %}{% if s and s|length <= 3000 and KPP|length < 20 and s not in KPP %}{% set _ = KPP.append(s) %}{% endif %}{% endfor %}
{% set IDS = {'rk': [], 'login': [], 'tab': [], 'siebel': []} %}{% set ID_ECHO = [] %}
{% for v in (filter_values('id' ~ CF) or []) %}{% set s = v|string %}{% if '=' in s and ID_ECHO|length < 2000 %}{% set kd = s.split('=', 1)[0] %}{% set x = (s.split('=', 1)[1]|trim|lower) if s.split('=', 1)[0] == 'login' else s.split('=', 1)[1]|trim %}{% if kd in IDS and x and (kd != 'rk' or x.isdigit()) and x not in IDS[kd] %}{% set _ = IDS[kd].append(x) %}{% set _ = ID_ECHO.append(kd ~ '=' ~ x) %}{% endif %}{% endif %}{% endfor %}
{#- Поиск: 'f:атрибут=текст', 'mu|lu|kp=текст' (от 2 знаков); дети узла: 'mu|lu>rk', 'kp>путь'. -#}
{% set Q = {'t': '', 'op': '', 'x': ''} %}{% set Q_ECHO = [] %}
{% for v in (filter_values('q' ~ CF) or []) %}{% set s = v|string %}{% if not Q['t'] %}
{%- if s[:2] == 'f:' and '=' in s %}{% set t = s.split('=', 1)[0] %}{% set x = s.split('=', 1)[1]|trim %}{% if t[2:] in FACETS and x|length >= 2 %}{% set _ = Q.update({'t': t, 'op': '=', 'x': x[:60]}) %}{% endif %}
{%- elif s[:2] in ['mu', 'lu', 'kp'] and s[2:3] == '=' %}{% set x = s[3:]|trim %}{% if x|length >= 2 %}{% set _ = Q.update({'t': s[:2], 'op': '=', 'x': x[:60]}) %}{% endif %}
{%- elif s[:2] in ['mu', 'lu'] and s[2:3] == '>' %}{% set x = s[3:]|trim %}{% if x and x|length <= 64 and x.isalnum() %}{% set _ = Q.update({'t': s[:2], 'op': '>', 'x': x}) %}{% endif %}
{%- elif s[:3] == 'kp>' %}{% set x = s[3:] %}{% if x and x|length <= 3000 %}{% set _ = Q.update({'t': 'kp', 'op': '>', 'x': x}) %}{% endif %}
{%- endif %}{% if Q['t'] %}{% set _ = Q_ECHO.append(Q['t'] ~ Q['op'] ~ Q['x']) %}{% endif %}{% endif %}{% endfor %}
{#- Части ответа по виду: list — строки (r); filters — значения (f) и деревья (mu / lu / kp) всегда, поиск (q) — если
    значений или узлов больше, чем приходит сразу. Носитель pt больше не нужен. -#}
{% set PT = ['f', 'mu', 'lu', 'kp'] + (['q'] if Q['t'] else []) if FLTV else ['r'] %}
{#- Колонки списка — закреплённые и запрошенные (носитель cols), по умолчанию DEFAULT_COLS: открытие — лёгкое. -#}
{% set DEFAULT_COLS = ['master_id', 'hiredate'] %}
{% set COLS = [] %}{% for c in LOCKED %}{% set _ = COLS.append(c) %}{% endfor %}
{% set COLS_REQ = [] %}{% for v in (filter_values('cols' ~ CF) or []) %}{% set _ = COLS_REQ.append(v|string) %}{% endfor %}
{% for c in (COLS_REQ if COLS_REQ else DEFAULT_COLS) %}{% if (c in EMP_KEYS or c in ALLOC_KEYS) and c not in COLS and COLS|length < 130 %}{% set _ = COLS.append(c) %}{% endif %}{% endfor %}
{#- У КП строка на аллокацию — только если запрошена колонка аллокации или уровня КП; тогда порядок —
    MasterID, поля сотрудника (EMPC), поля аллокации (ACOLS): поля сотрудника — только в первой строке. -#}
{% set EMPC = [] %}{% set ACOLS = [] %}
{% for c in COLS %}{% if c in ALLOC_KEYS %}{% set _ = ACOLS.append(c) %}{% elif c != 'master_id' %}{% set _ = EMPC.append(c) %}{% endif %}{% endfor %}
{% set ALLOC_ON = KP and ACOLS|length > 0 %}
{% if ALLOC_ON %}{% set COLS = ['master_id'] + EMPC + ACOLS %}{% endif %}
{% set SORT_L = [] %}{% for v in (filter_values('sort' ~ CF) or []) %}{% if SORT_L|length < 1 %}{% set _ = SORT_L.append(v|string) %}{% endif %}{% endfor %}
{% set SK = (SORT_L|first).split(':')[0] if SORT_L else 'master_id' %}
{% set SK = SK if SK in EMP_KEYS else 'master_id' %}
{% set SD = 'DESC' if (SORT_L and (SORT_L|first).endswith(':desc')) else 'ASC' %}
{% set LIM_L = [] %}{% for v in (filter_values('lim' ~ CF) or []) %}{% if LIM_L|length < 1 and (v|string).isdigit() %}{% set _ = LIM_L.append((v|string)|int) %}{% endif %}{% endfor %}
{% set LIM = LIM_L|first if (LIM_L and LIM_L|first in LIM_ALLOWED) else LIM_DEFAULT %}

{#- ---- источник ---- -#}
{% set T_EMP = ('prod_proteus.mdm_employee_d_detail_period' if PER == 'date' else 'prod_proteus.mdm_employee_d_detail_last_day') ~ ('_functional' if KP else '') %}
{% set EMP_COL = 'active_employee_flg' if EMP == 'Активная' else 'legal_employee_flg' %}
{% set TCR_COL = {'ТЦР РФ': 'rus_tcr_flg', 'ТЦР СНГ': 'foreign_tcr_flg', 'ТЦР РФ + ТЦР СНГ': 'tcr_flg'}.get(TCR, '') %}
{% macro glob() -%}
{{ EMP_COL }} = 1{% if PER == 'date' %} AND business_dt = toDateOrNull({{ qs(DT) }}){% endif %}{% if TCR_COL %} AND {{ TCR_COL }} = 1{% endif %}
{%- endmacro %}
{#- Вселенная — сотрудник одной строкой: у КП таблица — аллокации, берём строку на сотрудника
    (атрибуты сотрудника в его аллокациях одинаковые). -#}
{% macro universe() -%}
{%- if KP -%}(SELECT * FROM {{ T_EMP }} PREWHERE {{ glob() }} LIMIT 1 BY mdm_employee_rk)
{%- else -%}{{ T_EMP }} PREWHERE {{ glob() }}
{%- endif -%}
{%- endmacro %}

{#- ---- пути структур в строке сотрудника ---- -#}
{% set MU_ROOT = 3 %}
{% macro mu_rks() -%}[{% for i in range(1, 13) %}ifNull(lvl{{ i }}_mapped_management_unit_rk, ''){% if not loop.last %}, {% endif %}{% endfor %}]{%- endmacro %}
{% macro mu_nms() -%}['', ''{% for i in range(3, 13) %}, ifNull(lvl{{ i }}_mapped_management_unit_nm, ''){% endfor %}]{%- endmacro %}
{% macro lu_rks() -%}[{% for i in range(1, 8) %}ifNull(lvl{{ i }}_legal_unit_rk, ''){% if not loop.last %}, {% endif %}{% endfor %}]{%- endmacro %}
{% macro lu_nms() -%}[{% for i in range(1, 8) %}ifNull(lvl{{ i }}_legal_unit_nm, ''){% if not loop.last %}, {% endif %}{% endfor %}]{%- endmacro %}
{#- КП — из строки всех аллокаций сотрудника «уровень1<>…<>уровень12<>доля;…»: путь аллокации — имена
    уровней через \x1F без пустых ('' и '-'); как фильтры уровней КП прежнего датасета. -#}
{% macro kp_levels() -%}
arrayMap(x -> arrayFilter(y -> y != '' AND y != '-', arraySlice(splitByString('<>', x), 1, 12)), splitByString(';', ifNull(functional_lvl_all_array, '')))
{%- endmacro %}
{% macro kp_paths() -%}arrayFilter(p -> p != '', arrayMap(a -> arrayStringConcat(a, char(31)), {{ kp_levels() }})){%- endmacro %}
{% macro kp_nodes() -%}
arrayDistinct(arrayFlatten(arrayMap(a -> arrayMap(i -> arrayStringConcat(arraySlice(a, 1, i), char(31)), range(1, length(a) + 1)), {{ kp_levels() }})))
{%- endmacro %}
{#- Узлы, у которых есть дети: собственные префиксы путей аллокаций (без полного пути). -#}
{% macro kp_parents() -%}
arrayDistinct(arrayFlatten(arrayMap(a -> arrayMap(i -> arrayStringConcat(arraySlice(a, 1, i), char(31)), range(1, length(a))), {{ kp_levels() }})))
{%- endmacro %}
{% macro kp_id(p) -%}substring(lower(hex(MD5({{ p }}))), 1, 12){%- endmacro %}

{#- ---- условия фильтров; skip — фильтр, для которого считаются счётчики (фасет «при остальных») ---- -#}
{% macro fcond(a) -%}
{%- if a == 'regional_hr_login' -%}
({% if RHR %}hasAny(dl_rhr, login_reg_hr_list){% else %}0{% endif %}{% if '-' in F[a] %} OR empty(login_reg_hr_list){% endif %})
{%- else -%}
ifNull(toString({{ a }}), '') IN dl_f_{{ a }}
{%- endif -%}
{%- endmacro %}
{% macro cond(skip='') -%}
1
{%- for a in FACETS -%}{%- if a != skip and a in F and F[a] %} AND {{ fcond(a) }}{% endif -%}{%- endfor -%}
{%- if skip != 'mu' and MU %} AND hasAny(dl_mu, {{ mu_rks() }}){% endif -%}
{%- if skip != 'lu' and LU %} AND hasAny(dl_lu, {{ lu_rks() }}){% endif -%}
{%- if skip != 'kp' and KPP %} AND arrayExists(p -> arrayExists(s -> startsWith(concat(p, char(31)), concat(s, char(31))), dl_kp), {{ kp_paths() }}){% endif -%}
{%- if IDS['rk'] or IDS['login'] or IDS['tab'] or IDS['siebel'] %} AND (0
{%- if IDS['rk'] %} OR mdm_employee_rk IN dl_rk{% endif -%}
{%- if IDS['login'] %} OR lower(ifNull(ad_login, '')) IN dl_login{% endif -%}
{%- if IDS['tab'] %} OR ifNull(employee_main_work_no, '') IN dl_tab{% endif -%}
{%- if IDS['siebel'] %} OR ifNull(party_id, '') IN dl_siebel{% endif -%}
){%- endif -%}
{%- endmacro %}

{#- ---- доступ: флаги warden — логика прежнего датасета слово в слово ---- -#}
{% macro f_personal() -%}
if (
    warden_array.5=1
    or
      case when warden_array.2 in ('an.a.sokolova','r.dorofeev') then active_type_nm = 'Стажеры' else 1!=1 end --доступ в рамках задачи CROSS-8440 и CROSS-15151
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      case when warden_array.25 =1 then employment_relation_type_desc != 'Штатный сотрудник' else 1!=1 end --доступ для команды учета исполнителей
    or
    hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.6, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.7, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.8, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.9, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.10, mdm_employee_rk_list)))
    ,1,0)
{%- endmacro %}
{% macro f_grade() -%}
if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
      case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
            or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
            or
      (hasAny([warden_array.2], login_reg_hr_list)
      and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
      (
    (
      (
      hasAny(warden_array.11, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.12, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.13, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.14, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.15, mdm_employee_rk_list)))
    ,1,0)
{%- endmacro %}
{% macro f_seniority() -%}
if (
    warden_array.5=1
    or
      hasAny(warden_array.26, profession_nm_array_new) --варден для лидеров профессий
    or
       case when warden_array.2 in ('v.larionova', 'a.tumanik','k.a.chernova','i.lelyuk', 'i.s.verbitskaya','k.samolyuk', 'e.tyazheva') then tcr_flg = 1 else 1!=1 end --доступ в рамках задачи CROSS-9940
    or
      warden_array.2 in ('v.poljakov') and v_poljakov_access_flg = 1 --доступ в рамках задачи CROSS-16526
    or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
          ((
        (
        hasAny(warden_array.16, mapped_management_unit_rk_list)
        and (not hasAny(warden_array.17, mapped_management_unit_rk_list))
        )
      or
        (
        hasAny(warden_array.18, legal_unit_rk_list)
        )
        )
      and (not hasAny(warden_array.19, mdm_employee_rk_list)))
    ,1,0)
{%- endmacro %}
{% macro f_review() -%}
if (
    warden_array.5=1
        or
    (hasAny([warden_array.2], login_reg_hr_list)
    and lvl3_mapped_management_unit_rk != 'c10fb1ad1295902238dba3019d92ce41')
      or
    (
    (
      (
      hasAny(warden_array.20, mapped_management_unit_rk_list)
      and (not hasAny(warden_array.21, mapped_management_unit_rk_list))
      )
    or
      (hasAny(warden_array.22, legal_unit_rk_list)
      )
    or
      (hasAny(warden_array.23, functional_unit_rk_list))
    )
    and (not hasAny(warden_array.24, mdm_employee_rk_list)))
    ,1,0)
{%- endmacro %}
{% macro flag_of(key) -%}
{%- if key in PERSONAL -%}wpf{%- elif key in GRADE -%}wgf{%- elif key in SENIORITY -%}wsf{%- elif key in REVIEW -%}wrf{%- endif -%}
{%- endmacro %}
{% macro flag_expr(key) -%}
{%- if key in PERSONAL -%}{{ f_personal() }}{%- elif key in GRADE -%}{{ f_grade() }}{%- elif key in SENIORITY -%}{{ f_seniority() }}{%- elif key in REVIEW -%}{{ f_review() }}{%- endif -%}
{%- endmacro %}
{#- Значение поля в ответе: скрытое — маркер, как в прежнем датасете (там — текст «⛔️ Нет доступа к данным»). -#}
{% macro raw(key) -%}
{%- if key == 'birth_dt' -%}toDateTime64(birth_dt_text, 0)
{%- elif key == 'registration_city_nm' -%}coalesce(registration_city_nm, registration_settlement_nm)
{%- else -%}{{ SRCCOL.get(key, key) }}
{%- endif -%}
{%- endmacro %}
{% macro out(key) -%}
{%- set fl = flag_of(key) -%}
{%- if not fl -%}{{ raw(key) }}
{%- elif key == 'birth_dt' -%}if({{ fl }} = 1, {{ raw(key) }}, NULL)
{%- elif key in ['mdm_employee_age', 'has_children_flg', 'grade'] -%}if({{ fl }} = 1, toString({{ key }}), {{ MASK }})
{%- else -%}if({{ fl }} = 1, {{ raw(key) }}, {{ MASK }})
{%- endif -%}
{%- endmacro %}
{#- Ключ сортировки: тип поля (числа — числом, даты — датой), скрытое — NULL, пустая строка — NULL (в конец). -#}
{% macro sortkey(key, inline) -%}
{%- set fl = flag_of(key) -%}
{%- set v = raw(key) if key in NUMERIC or key in DATES else "nullIf(toString(" ~ raw(key) ~ "), '')" -%}
{%- if fl -%}if(({{ flag_expr(key) if inline else fl }}) = 1, {{ v }}, NULL){%- else -%}{{ v }}{%- endif -%}
{%- endmacro %}
{#- id сотрудников ответа — первые LIM по сортировке среди отфильтрованных. -#}
{% macro sel_ids() -%}
SELECT mdm_employee_rk
FROM {{ universe() }}
WHERE warden_n > 0 AND {{ cond() }}
ORDER BY {{ sortkey(SK, true) }} {{ SD }} NULLS LAST, mdm_employee_rk
LIMIT {{ LIM }}
{%- endmacro %}
{#- Строки выбранных сотрудников с флагами warden (флаг считается, только если его читают). -#}
{% macro flagged() -%}
SELECT *,
            {{ f_personal() }} AS wpf,
            {{ f_grade() }} AS wgf,
            {{ f_seniority() }} AS wsf,
            {{ f_review() }} AS wrf
          FROM {{ T_EMP }}
          PREWHERE {{ glob() }} AND mdm_employee_rk IN ({{ sel_ids() }})
{%- endmacro %}
{% macro clean(x) -%}
replaceRegexpAll(replaceAll(replaceAll(replaceAll(ifNull(toString({{ x }}), ''), unhex('E280A8'), ' '), unhex('E280A9'), ' '), unhex('EFBBBF'), ' '), '[[:cntrl:]]', ' ')
{%- endmacro %}

WITH
  arrayElement((
    SELECT groupArray((mdm_employee_rk, ad_login, first_nm, management_unit_nm, warden_cross_data_flg,
      personal_management_unit_rk_list, personal_exception_management_unit_rk_list, personal_legal_unit_rk_list,
      personal_functional_unit_rk_list, personal_exception_mdm_employee_rk_list,
      grade_management_unit_rk_list, grade_exception_management_unit_rk_list, grade_legal_unit_rk_list,
      grade_functional_unit_rk_list, grade_exception_mdm_employee_rk_list,
      seniority_management_unit_rk_list, seniority_exception_management_unit_rk_list, seniority_legal_unit_rk_list,
      seniority_exception_mdm_employee_rk_list,
      review_management_unit_rk_list, review_exception_management_unit_rk_list, review_legal_unit_rk_list,
      review_functional_unit_rk_list, review_exception_mdm_employee_rk_list,
      warden_support_gph_flg, profession_array_nm))
    FROM prod_proteus.warden_access_array_cross
    WHERE ad_login = {{ qs(me) }}
  ), 1) AS warden_array,
  (SELECT count() FROM prod_proteus.warden_access_array_cross WHERE ad_login = {{ qs(me) }}) AS warden_n,
  {#- списки фильтров — константами, один раз на весь текст запроса #}
  {{ qa(MU) }} AS dl_mu, {{ qa(LU) }} AS dl_lu, {{ qa(KPP) }} AS dl_kp
  {%- for a in FACETS if a in F and F[a] %},
  {{ qt(F[a]) }} AS dl_f_{{ a }}{% endfor %}
  {%- if RHR %},
  {{ qa(RHR) }} AS dl_rhr{% endif %}
  {%- if IDS['rk'] %},
  ({{ IDS['rk']|join(', ') }}) AS dl_rk{% endif %}
  {%- for kd in ['login', 'tab', 'siebel'] if IDS[kd] %},
  {{ qt(IDS[kd]) }} AS dl_{{ kd }}{% endfor %}
SELECT ifNull(role, '') AS role, ifNull(k, '') AS k, ifNull(v, '') AS v, toInt64(ifNull(n, 0)) AS n, ifNull(j, '') AS j
FROM (
  {# meta: итоги, эхо применённого, даты — всегда #}
  SELECT 'meta' AS role, '{{ MODE }}' AS k, {{ qs(RQ|first if RQ else '') }} AS v, toInt64(if(warden_n > 0, countIf({{ cond() }}), 0)) AS n,
    concat('{"m":', toJSONString(map(
        'ver', '3', 'mode', '{{ MODE }}', 'view', '{{ VIEW }}', 'cf', '{{ CF }}', 'ok', toString(warden_n > 0), 'first_nm', ifNull(toString(warden_array.3), ''),
        'total', toString(if(warden_n > 0, countIf({{ cond() }}), 0)), 'all', toString(if(warden_n > 0, count(), 0)),
        'data_dt', ifNull(toString(max(business_dt)), ''), 'per', '{{ PER }}', 'dt', {{ qs(DT) }}, 'emp', {{ qs(EMP) }},
        'tcr', {{ qs(TCR) }}, 'sort', {{ qs(SK ~ ':' ~ SD|lower) }}, 'lim', '{{ LIM }}', 'chunk', '{{ CHUNK }}',
        'facet_top', '{{ FACET_TOP }}', 'tree_full_max', '{{ TREE_FULL_MAX }}', 'search_top', '{{ SEARCH_TOP }}',
        'child_top', '{{ CHILD_TOP }}', 'rq', {{ qs(RQ|first if RQ else '') }}, 'frq', {{ qs(FRQ|first if FRQ else '') }})),
      ',"a":', toJSONString(map('flt', {{ qa(FLT_ECHO) }}, 'mu', {{ qa(MU) }}, 'lu', {{ qa(LU) }}, 'kp', {{ qa(KPP) }},
        'id', {{ qa(ID_ECHO) }}, 'cols', {{ qa(COLS) }}, 'q', {{ qa(Q_ECHO) }}, 'pt', {{ qa(PT) }})),
      {%- if FLTV %}
      ',"dates":', toJSONString((SELECT groupArray(d) FROM (SELECT DISTINCT toString(toDate(business_dt_detail)) AS d
        FROM prod_proteus.mdm_employee_d_business_dt_detail WHERE business_dt_detail IS NOT NULL ORDER BY d DESC LIMIT 400))),
      {%- endif %}
      '}') AS j
  FROM {{ universe() }}
{%- if 'f' in PT %}

  UNION ALL
  {# значения фильтров: счётчик — при остальных фильтрах; первые FACET_TOP по численности и выбранные.
     Атрибут — одной строкой (роль F): v — значений у атрибута всего, j — base64 строк «значение\tсотрудников»
     по убыванию численности; в значении \ \t \n \r экранированы обратным слэшем #}
  SELECT 'F' AS role, fk AS k, toString(any(nv)) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((rn, concat(
      replaceAll(replaceAll(replaceAll(replaceAll(fv, '\\', '\\\\'), '\t', '\\t'), '\n', '\\n'), char(13), '\\r'),
      '\t', toString(fn)))))), '\n')) AS j
  FROM (
    SELECT kv.1 AS fk, kv.2 AS fv, sum(kv.3) AS fn, count() AS fa,
      row_number() OVER (PARTITION BY fk ORDER BY fn DESC, fv) AS rn, count() OVER (PARTITION BY fk) AS nv
    FROM (
      SELECT arrayJoin(arrayConcat([
        {%- for a in FACETS if a != 'regional_hr_login' %}
        ('{{ a }}', ifNull(toString({{ a }}), ''), toUInt8({{ cond(a) }})){% if not loop.last %},{% endif %}
        {%- endfor %}],
        arrayMap(x -> ('regional_hr_login', x, toUInt8({{ cond('regional_hr_login') }})),
                 if(empty(login_reg_hr_list), ['-'], login_reg_hr_list)))) AS kv
      FROM {{ universe() }}
      WHERE warden_n > 0
    )
    GROUP BY fk, fv
  )
  WHERE rn <= {{ FACET_TOP }}{% for a in F %}{% if F[a] %} OR (fk = '{{ a }}' AND fv IN dl_f_{{ a }}){% endif %}{% endfor %}
  GROUP BY fk
{%- endif %}
{%- for tk, root, nlev, rks, nms, sel in [('mu', MU_ROOT, 12, mu_rks(), mu_nms(), MU), ('lu', 1, 7, lu_rks(), lu_nms(), LU)] if tk in PT %}

  UNION ALL
  {# дерево УС / ЮС: узел — rk уровня; целиком до TREE_FULL_MAX узлов, иначе верх, путь до выбранного и его дети;
     есть дети — у кого-то из людей узла заполнен следующий уровень. Узлы — в порядке обхода в глубину (путь rk от
     корня), пачками по TREE_CHUNK (роль T, v — «пачка:узлов в дереве»); строка — «rk\tуровень\tсотрудников при
     остальных фильтрах\tесть дети\tимя»: родитель — ближайший выше узел уровнем меньше (чарт восстанавливает сам) #}
  SELECT 'T' AS role, '{{ tk }}' AS k, concat(toString(tc), ':', toString(any(nodes))) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((ix, line)))), '\n')) AS j
  FROM (
  SELECT intDiv(ix - 1, {{ TREE_CHUNK }}) AS tc, ix, nodes, line
  FROM (
  SELECT row_number() OVER (ORDER BY tpath) AS ix, nodes,
    concat(tv, '\t', toString(td), '\t', toString(tn), '\t', toString(hk), '\t', replaceRegexpAll(tnm, '[[:cntrl:]]', ' ')) AS line
  FROM (
    SELECT rks[d] AS tv, d AS td, any(arraySlice(rks, {{ root }}, d - {{ root }} + 1)) AS tpath, any(nms[d]) AS tnm, sum(ok) AS tn,
      max(d < {{ nlev }} AND rks[d + 1] != '') AS hk, max(si > 0 AND d <= si + 1) AS near, count() OVER () AS nodes
    FROM (
      SELECT {{ rks }} AS rks, {{ nms }} AS nms, toUInt8({{ cond(tk) }}) AS ok, arrayFirstIndex(x -> has(dl_{{ tk }}, x), rks) AS si
      FROM {{ universe() }}
      WHERE warden_n > 0
    )
    ARRAY JOIN arrayFilter(i -> rks[i] != '', range({{ root }}, {{ nlev + 1 }})) AS d
    GROUP BY tv, td
  )
  WHERE nodes <= {{ TREE_FULL_MAX }} OR td < {{ root + TREE_TOP }} OR near
  )
  )
  GROUP BY tc
{%- endfor %}
{%- if 'kp' in PT %}

  UNION ALL
  {# дерево КП: узел — путь именами, сотрудник в узле — один раз. Есть дети — следующий путь по возрастанию
     начинается с «путь\x1F» (\x1F меньше любого знака имени). Порядок путей по возрастанию — обход в глубину:
     строка — «уровень\tсотрудников при остальных фильтрах\tесть дети\tимя», путь (он же значение фильтра)
     чарт собирает из имён предков #}
  SELECT 'T' AS role, 'kp' AS k, concat(toString(tc), ':', toString(any(nodes))) AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((ix, line)))), '\n')) AS j
  FROM (
  SELECT intDiv(ix - 1, {{ TREE_CHUNK }}) AS tc, ix, nodes, line
  FROM (
  SELECT row_number() OVER (ORDER BY kpath) AS ix, nodes,
    concat(toString(td), '\t', toString(tn), '\t', toString(startsWith(nxt, concat(kpath, char(31)))), '\t',
      replaceAll(replaceAll(parts[td], '\t', ' '), '\n', ' ')) AS line
  FROM (
    SELECT kpath, length(splitByString(char(31), kpath)) AS td, splitByString(char(31), kpath) AS parts, sum(ok) AS tn,
      count() OVER () AS nodes, leadInFrame(kpath) OVER (ORDER BY kpath ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) AS nxt
    FROM (
      SELECT {{ kp_nodes() }} AS kn, toUInt8({{ cond('kp') }}) AS ok
      FROM {{ universe() }}
      WHERE warden_n > 0
    )
    ARRAY JOIN kn AS kpath
    GROUP BY kpath
  )
  WHERE nodes <= {{ TREE_FULL_MAX }} OR td <= {{ TREE_TOP }}
    OR arrayExists(s -> startsWith(concat(s, char(31)), concat(kpath, char(31))), dl_kp)
    OR has(dl_kp, arrayStringConcat(arraySlice(parts, 1, td - 1), char(31)))
  )
  )
  GROUP BY tc
{%- endif %}
{%- for tk, root, rks, nms, sel in [('mu', MU_ROOT, mu_rks(), mu_nms(), MU), ('lu', 1, lu_rks(), lu_nms(), LU)] if sel and FLTV %}

  UNION ALL
  {# выбранные узлы УС / ЮС: имя и путь — подпись фильтра без дерева #}
  SELECT 's' AS role, '{{ tk }}' AS k, sid AS v, toInt64(0) AS n, concat(toString(sd), '\t', sp, '\t', snm, '\t0\t0\t', spath, '\t') AS j
  FROM (
    SELECT sid, any(indexOf(rks, sid)) AS sd, any(if(indexOf(rks, sid) > {{ root }}, rks[indexOf(rks, sid) - 1], '')) AS sp,
      any(nms[indexOf(rks, sid)]) AS snm, any(arrayStringConcat(arraySlice(nms, {{ root }}, greatest(indexOf(rks, sid) - {{ root }}, 0)), ' › ')) AS spath
    FROM (
      SELECT {{ rks }} AS rks, {{ nms }} AS nms
      FROM {{ universe() }}
      WHERE warden_n > 0 AND hasAny(dl_{{ tk }}, rks)
    )
    {#- литерал, а не константа WITH: ARRAY JOIN по алиасу WITH старый анализатор 24.8 не принимает (Code 206); rk до 50 #}
    ARRAY JOIN {{ qa(sel) }} AS sid
    WHERE has(rks, sid)
    GROUP BY sid
  )
{%- endfor %}
{%- if 'q' not in PT %}
{%- elif Q['t'] in ['mu', 'lu'] %}
{%- set root = MU_ROOT if Q['t'] == 'mu' else 1 %}{%- set nlev = 12 if Q['t'] == 'mu' else 7 %}

  UNION ALL
  {# поиск узла по имени на любом уровне (до SEARCH_TOP, с путём) или дети узла (до CHILD_TOP, по имени) #}
  SELECT 'q' AS role, '{{ Q['t'] }}' AS k, qv AS v, toInt64(qn) AS n,
    concat(toString(qd), '\t', qp, '\t', qnm, '\t', toString(qa), '\t', toString(qk), '\t', qpath, '\t') AS j
  FROM (
    SELECT rks[d] AS qv, d AS qd, any(if(d > {{ root }}, rks[d - 1], '')) AS qp, any(nms[d]) AS qnm, sum(ok) AS qn, count() AS qa,
      max(d < {{ nlev }} AND rks[d + 1] != '') AS qk, any(arrayStringConcat(arraySlice(nms, {{ root }}, d - {{ root }}), ' › ')) AS qpath
    FROM (
      SELECT {{ mu_rks() if Q['t'] == 'mu' else lu_rks() }} AS rks, {{ mu_nms() if Q['t'] == 'mu' else lu_nms() }} AS nms,
        toUInt8({{ cond(Q['t']) }}) AS ok
      FROM {{ universe() }}
      WHERE warden_n > 0{% if Q['op'] == '>' %} AND has(rks, {{ qs(Q['x']) }}){% endif %}
    )
    ARRAY JOIN arrayFilter(i -> rks[i] != '' AND {% if Q['op'] == '=' %}positionCaseInsensitiveUTF8(nms[i], {{ qs(Q['x']) }}) > 0{% else %}i > {{ root }} AND rks[i - 1] = {{ qs(Q['x']) }}{% endif %}, range({{ root }}, {{ nlev + 1 }})) AS d
    GROUP BY qv, qd
    ORDER BY {% if Q['op'] == '=' %}qn DESC, qa DESC, qnm{% else %}qnm, qv{% endif %}
    LIMIT {{ SEARCH_TOP if Q['op'] == '=' else CHILD_TOP }}
  )
{%- elif Q['t'] == 'kp' %}

  UNION ALL
  {# КП: поиск по имени узла или дети узла; есть дети — узел среди префиксов путей сотрудника (флаг — до ARRAY JOIN:
     массив путей по строкам узлов не размножается) #}
  SELECT 'q' AS role, 'kp' AS k, {{ kp_id('kpath') }} AS v, toInt64(qn) AS n,
    concat(toString(qd), '\t', if(qd > 1, substring(lower(hex(MD5(arrayStringConcat(arraySlice(parts, 1, qd - 1), char(31))))), 1, 12), ''), '\t',
      parts[qd], '\t', toString(qa), '\t', toString(qk), '\t', kpath, '\t') AS j
  FROM (
    SELECT kt.1 AS kpath, length(splitByString(char(31), kpath)) AS qd, splitByString(char(31), kpath) AS parts, sum(ok) AS qn, count() AS qa,
      max(kt.2) AS qk
    FROM (
      SELECT arrayMap(p -> (p, has(dp, p)), kn) AS kts, ok
      FROM (
        SELECT {{ kp_nodes() }} AS kn, {{ kp_parents() }} AS dp, toUInt8({{ cond('kp') }}) AS ok
        FROM {{ universe() }}
        {#- без искомого текста (у детей — без имени самого узла) в строке аллокаций находок у сотрудника нет #}
        WHERE warden_n > 0 AND {% if Q['op'] == '=' %}positionCaseInsensitiveUTF8(ifNull(functional_lvl_all_array, ''), {{ qs(Q['x']) }}) > 0
          {%- else %}position(ifNull(functional_lvl_all_array, ''), arrayElement(splitByString(char(31), {{ qs(Q['x']) }}), -1)) > 0{% endif %}
      )
    )
    ARRAY JOIN kts AS kt
    WHERE {% if Q['op'] == '=' %}positionCaseInsensitiveUTF8(arrayElement(splitByString(char(31), kt.1), -1), {{ qs(Q['x']) }}) > 0
      {%- else %}startsWith(kt.1, concat({{ qs(Q['x']) }}, char(31))) AND position(substring(kt.1, length({{ qs(Q['x']) }}) + 2), char(31)) = 0{% endif %}
    GROUP BY kpath
    ORDER BY {% if Q['op'] == '=' %}qn DESC, qa DESC, kpath{% else %}kpath{% endif %}
    LIMIT {{ SEARCH_TOP if Q['op'] == '=' else CHILD_TOP }}
  )
{%- elif Q['t'][:2] == 'f:' %}
{%- set qa_ = Q['t'][2:] %}

  UNION ALL
  {# поиск значения атрибута, у которого значений больше FACET_TOP #}
  SELECT 'fq' AS role, '{{ qa_ }}' AS k, qv AS v, toInt64(qn) AS n, toString(qa) AS j
  FROM (
    SELECT qv, sum(ok) AS qn, count() AS qa
    FROM (
      SELECT {% if qa_ == 'regional_hr_login' %}arrayJoin(if(empty(login_reg_hr_list), ['-'], login_reg_hr_list)){% else %}ifNull(toString({{ qa_ }}), ''){% endif %} AS qv,
        toUInt8({{ cond(qa_) }}) AS ok
      FROM {{ universe() }}
      WHERE warden_n > 0
    )
    WHERE positionCaseInsensitiveUTF8(qv, {{ qs(Q['x']) }}) > 0
    GROUP BY qv
    ORDER BY qn DESC, qa DESC, qv
    LIMIT 200
  )
{%- endif %}
{%- if 'r' in PT %}

  UNION ALL
  {# строки: id сотрудников — ORDER BY … LIMIT по отфильтрованной таблице; маски и упаковка — только для них.
     Строка собирается до оконных функций: окна сортируют ключ и готовую строку, а не ~110 колонок.
     Номер пачки — колонкой подзапроса: алиас в GROUP BY (GROUP BY выражение AS ch) ClickHouse принимает,
     а разбор SQL в Proteus (sqlglot) при сохранении датасета — нет #}
  SELECT 'r' AS role, toString(ch) AS k, '' AS v, toInt64(count()) AS n,
    base64Encode(arrayStringConcat(arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((rn, line)))), '\n')) AS j
  FROM (
  SELECT intDiv(rn - 1, {{ CHUNK }}) AS ch, rn, line
  FROM (
{%- if not ALLOC_ON %}
    {#- строка на сотрудника (у КП без колонок аллокации — одна строка из его аллокаций) #}
    SELECT row_number() OVER (ORDER BY sk {{ SD }} NULLS LAST, mdm_employee_rk) AS rn, line
    FROM (
      SELECT mdm_employee_rk, {{ sortkey(SK, false) }} AS sk,
        concat({% for c in COLS %}{{ clean(out(c)) }}{% if not loop.last %}, '\t', {% endif %}{% endfor %}) AS line
      FROM ({{ flagged() }}{% if KP %}
      LIMIT 1 BY mdm_employee_rk{% endif %})
    )
{%- else %}
    {#- КП: строка на аллокацию — MasterID, поля сотрудника, поля аллокации. Поля сотрудника считаются один раз
        на сотрудника и стоят только в первой строке его блока (по порядку rn), в остальных — пустые #}
    SELECT rn, concat(rks{% if EMPC %}, '\t', if(rn = rn0, ifNull(eline, ''), repeat('\t', {{ EMPC|length - 1 }})){% endif %}, '\t', aline) AS line
    FROM (
      SELECT mdm_employee_rk, rks, aline, rn, min(rn) OVER (PARTITION BY mdm_employee_rk) AS rn0
      FROM (
        SELECT mdm_employee_rk, rks, aline,
          row_number() OVER (ORDER BY sk {{ SD }} NULLS LAST, mdm_employee_rk, alloc DESC, kp_sort) AS rn
        FROM (
          SELECT mdm_employee_rk, {{ clean(out('master_id')) }} AS rks, {{ sortkey(SK, false) }} AS sk,
            ifNull(allocation_prt_norm, 0) AS alloc,
            arrayStringConcat([{% for i in range(1, 13) %}ifNull(lvl{{ i }}_functional_unit_nm, ''){% if not loop.last %}, {% endif %}{% endfor %}], char(31)) AS kp_sort,
            concat({% for c in ACOLS %}{{ clean(out(c)) }}{% if not loop.last %}, '\t', {% endif %}{% endfor %}) AS aline
          FROM ({{ flagged() }})
        )
      )
    ) AS a
    {%- if EMPC %}
    ANY LEFT JOIN (
      SELECT mdm_employee_rk,
        concat({% for c in EMPC %}{{ clean(out(c)) }}{% if not loop.last %}, '\t', {% endif %}{% endfor %}) AS eline
      FROM ({{ flagged() }}
      LIMIT 1 BY mdm_employee_rk)
    ) AS e USING (mdm_employee_rk)
    {%- endif %}
{%- endif %}
  )
  )
  GROUP BY ch
{%- endif %}
)
