"""Синтетический мир «Детальных списков» в chdb (ClickHouse 24.8) — как prod_proteus в бою.

    python3 stand/world.py [N]      # N сотрудников, по умолчанию 100 000 (DL_N)

Таблицы — те, что читают текущий датасет (mdm_employee_d_detail_echarts, он же оракул
проверок) и новый (proteus/detail-list.data.sql), все скалярные колонки Nullable, как
после gp_to_click; массивы — Array(String):

  mdm_employee_d_detail_last_day            сотрудник на последний день
  mdm_employee_d_detail_period              сотрудник × дата (две даты: D0 и D1 = последний день)
  mdm_employee_d_detail_last_day_functional аллокация сотрудника в КП (1–3 на сотрудника)
  mdm_employee_d_detail_period_functional   то же × дата
  mdm_employee_d_business_dt_detail         даты для «Пользовательской даты»
  warden_access_array_cross                 доступ: a.user — персоналка двух веток УС, hr.super — всё,
                                            p.lead — лидер профессии; nobody — строки нет
  cross_filter_{management,legal,functional}_structure — справочники старого кросс-фильтра
                                            (нужны только оракулу)

УС — уровни 1…13 (rk и имя; в пути сотрудника от 4 до 13 уровней), ЮС — 1…7, КП —
до 12 уровней. Значения выдуманы, длины и кардинальности правдоподобные.
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get('DL_DB') or os.path.join(HERE, '.db')
D1, D0 = '2026-09-28', '2026-08-31'

LAST = ['Иванов', 'Смирнова', 'Кузнецов', 'Попова', 'Васильев', 'Петрова', 'Соколов', "О'Коннор", 'Новиков', 'Фёдорова',
        'Морозов', 'Волкова', 'Алексеев', 'Лебедева', 'Семёнов', 'Егорова', 'Павлов', 'Козлова', 'Степанов', 'Николаева']
FIRST = ['Александр', 'Анна', 'Дмитрий', 'Мария', 'Сергей', 'Елена', 'Андрей', 'Ольга', 'Алексей', 'Наталья', 'Максим',
         'Екатерина', 'Иван', 'Татьяна', 'Михаил', 'Юлия', 'Артём', 'Ирина', 'Никита', 'Светлана']
MIDDLE = ['Александрович', 'Сергеевна', 'Дмитриевич', 'Андреевна', 'Игоревич', 'Владимировна', 'Олегович', 'Николаевна']
CITIES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара',
          'Омск', 'Ростов-на-Дону', 'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград', 'Краснодар', 'Саратов', 'Тюмень',
          'Ижевск', 'Барнаул', 'Ульяновск', 'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Томск', 'Оренбург']
STREETS = ['ул. Ленина', 'пр-т Мира', 'ул. Гагарина', 'ул. Советская', 'ул. Пушкина', 'Садовая ул.', 'ул. Лесная', 'Школьная ул.']
WORDS = ['платёжных сервисов', 'кредитных продуктов', 'клиентского опыта', 'данных и аналитики', 'инфраструктуры',
         'мобильной разработки', 'розничного бизнеса', 'малого и среднего бизнеса', 'инвестиций', 'страхования',
         'безопасности', 'маркетинга', 'контакт-центра', 'управления персоналом', 'бухгалтерии', 'логистики',
         'рисков и скоринга', 'процессинга', 'продаж', 'поддержки партнёров']
KINDS = ['Департамент', 'Дирекция', 'Отдел', 'Управление', 'Центр', 'Команда', 'Группа', 'Сектор', 'Кластер', 'Трайб']
KP_KINDS = ['Бизнес-линия', 'Продукт', 'Направление', 'Стрим', 'Команда', 'Кластер', 'Платформа', 'Сервис']
SPECS = ['Backend-разработчик', 'Frontend-разработчик', 'Аналитик данных', 'Системный аналитик', 'Продуктовый менеджер',
         'QA-инженер', 'DevOps-инженер', 'Специалист контакт-центра', 'Менеджер по продажам', 'Дизайнер',
         'Руководитель проектов', 'Бизнес-аналитик', 'Data Scientist', 'Юрист', 'Бухгалтер', 'HR бизнес-партнёр',
         'Рекрутер', 'Специалист поддержки', 'Риск-аналитик', 'Инженер по безопасности']


def arr(xs):
    return '[' + ', '.join("'" + x.replace('\\', '\\\\').replace("'", "\\'") + "'" for x in xs) + ']'


class Gen(object):
    """Выражения колонок от номера сотрудника E (и номера аллокации A у КП)."""

    def __init__(self, E):
        self.E = E

    def h(self, k):
        return 'cityHash64(%s, %d)' % (self.E, k)

    def u(self, k):
        return '((%s %% 1000003) / 1000003.)' % self.h(k)

    def zipf(self, k, n, p=2.0):
        return 'toUInt32(least(%d, floor(%d * pow(%s, %s))))' % (n - 1, n, self.u(k), p)

    def pick(self, k, xs, p=2.0):
        return '%s[1 + %s]' % (arr(xs), self.zipf(k, len(xs), p))

    def labeled(self, k, prefix, n, p=2.0):
        return "concat(%s, ' ', toString(%s))" % (prefix, self.zipf(k, n, p))


def tree(leaf, seed, nlev, fan, first_depth, kinds, words, tag):
    """Путь листа leaf массивами (имена, rk) длины nlev: узел уровня d — префикс цифр листа, имя и rk —
    от префикса; глубина пути first_depth…nlev, уровни глубже — ''."""
    digits = '[%s]' % ', '.join('cityHash64(%s, %d) %% %d' % (leaf, seed + i, f) for i, f in enumerate(fan))
    depth = '(%d + cityHash64(%s, %d) %% %d)' % (first_depth, leaf, seed + 99, nlev - first_depth + 1)
    keys = ("arrayMap(d -> concat('%s:', arrayStringConcat(arrayMap(x -> toString(x), arraySlice(%s, 1, d)), '.')), range(1, %d))"
            % (tag, digits, nlev + 1))
    names = ("arrayMap((k, d) -> if(d <= %s, concat(%s[1 + cityHash64(k) %% %d], ' ', %s[1 + cityHash64(k, 7) %% %d], ' ', "
             "toString(cityHash64(k) %% 997)), ''), %s, range(1, %d))" % (depth, arr(kinds), len(kinds), arr(words), len(words), keys, nlev + 1))
    rks = "arrayMap((k, d) -> if(d <= %s, lower(hex(MD5(k))), ''), %s, range(1, %d))" % (depth, keys, nlev + 1)
    return names, rks


def aliases(E):
    """Пути деревьев сотрудника E — считаются один раз во внутреннем подзапросе (иначе запрос длиннее max_query_size)."""
    g = Gen(E)
    mu_n, mu_rk = tree('toUInt64(%s)' % g.zipf(300, 9000, 1.3), 300, 13, [2, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2], 4, KINDS, WORDS, 'mu')
    lu_n, lu_rk = tree('toUInt64(%s)' % g.zipf(400, 1500, 1.3), 400, 7, [6, 4, 4, 3, 3, 3, 2], 3, KINDS, WORDS, 'lu')
    return [(mu_n, '_mu_nm'), (mu_rk, '_mu_rk'), (lu_n, '_lu_nm'), (lu_rk, '_lu_rk'), (kp_allocs(E), '_kpa')]


def employee_columns(E):
    """Колонки сотрудника: {имя: (выражение, тип)}; E — выражение номера сотрудника."""
    g = Gen(E)
    h, pick, labeled, zipf = g.h, g.pick, g.labeled, g.zipf
    C = {}

    def c(name, expr, typ='String'):
        C[name] = (expr, typ)

    c('mdm_employee_rk', 'toInt32(100000 + %s)' % E, 'Int32')
    c('active_employee_flg', 'toInt16(%s %% 100 < 93)' % h(1), 'Int16')
    c('legal_employee_flg', 'toInt16(%s %% 100 < 85)' % h(2), 'Int16')
    c('rus_tcr_flg', 'toInt16(%s %% 100 < 8)' % h(3), 'Int16')
    c('foreign_tcr_flg', 'toInt16(%s %% 100 >= 97)' % h(3), 'Int16')
    c('tcr_flg', 'toInt16(%s %% 100 < 8 OR %s %% 100 >= 97)' % (h(3), h(3)), 'Int16')
    c('v_poljakov_access_flg', 'toInt16(%s %% 50 = 0)' % h(4), 'Int16')
    c('last_nm', pick(5, LAST, 1.0))
    c('first_nm', pick(6, FIRST, 1.0))
    c('full_nm', "concat(%s, ' ', %s, ' ', %s)" % (pick(5, LAST, 1.0), pick(6, FIRST, 1.0), pick(7, MIDDLE, 1.0)))
    c('birth_dt_text', "toString(toDate('1965-01-01') + toUInt32(%s %% 14600))" % h(8))
    c('birth_day', 'toInt16(toDayOfMonth(toDate(\'1965-01-01\') + toUInt32(%s %% 14600)))' % h(8), 'Int16')
    c('birth_month', 'toInt16(toMonth(toDate(\'1965-01-01\') + toUInt32(%s %% 14600)))' % h(8), 'Int16')
    c('mdm_employee_age', 'toInt16(61 - intDiv(%s %% 14600, 365))' % h(8), 'Int16')
    c('age_generation_nm', pick(10, ['Поколение Z', 'Миллениалы', 'Поколение X', 'Бумеры']))
    c('has_children_flg', 'toInt16(%s %% 2)' % h(11), 'Int16')
    c('contact_main_phone_no', "concat('+7 9', toString(10 + %s %% 90), ' ', toString(100 + %s %% 900), '-', toString(10 + %s %% 90), '-', toString(10 + %s %% 90))" % (h(12), h(13), h(14), h(15)))
    c('prs_email_address_txt', "concat('user', toString(%s), '@mail.ru')" % E)
    c('employee_document_type_desc', pick(16, ['Паспорт гражданина РФ', 'Вид на жительство', 'Паспорт иностранного гражданина'], 3.0))
    c('citizenship_country_desc', pick(17, ['Российская Федерация', 'Казахстан', 'Беларусь', 'Армения', 'Узбекистан'], 4.0))
    c('registration_state_nm', labeled(18, "'Регион'", 85))
    c('registration_city_nm', "if(%s %% 20 = 0, NULL, %s)" % (h(19), pick(19, CITIES, 2.0)))
    c('registration_settlement_nm', "if(%s %% 20 = 0, 'пос. Рабочий', NULL)" % h(19))
    c('registration_full_address_txt', "concat('Российская Федерация, ', %s, ', ', %s, ', д. ', toString(1 + %s %% 120), ', кв. ', toString(1 + %s %% 300))" % (pick(19, CITIES, 2.0), pick(20, STREETS, 1.0), h(21), h(22)))
    c('residential_state_nm', labeled(23, "'Регион'", 85))
    c('city_nm', pick(24, CITIES, 2.5))
    c('residential_city_nm', pick(24, CITIES, 2.5))
    c('residential_full_address_txt', "concat('Российская Федерация, ', %s, ', ', %s, ', д. ', toString(1 + %s %% 120), ', кв. ', toString(1 + %s %% 300))" % (pick(24, CITIES, 2.5), pick(25, STREETS, 1.0), h(26), h(27)))
    c('doc_city_nm', pick(28, CITIES, 2.5))
    c('marital_status_desc', pick(29, ['Женат/Замужем', 'Холост/Не замужем', 'Разведён(а)', 'Вдовец/Вдова']))
    c('gender_desc', pick(30, ['Мужской', 'Женский'], 1.0))
    c('education_degree_unique_max', pick(31, ['Высшее', 'Магистратура', 'Бакалавриат', 'Среднее профессиональное', 'Кандидат наук']))
    c('education_spec_nm', labeled(32, "'Специальность по диплому'", 300))
    c('location_type', pick(33, ['Москва', 'Санкт-Петербург', 'Регионы', 'СНГ']))
    c('macroregion_nm', labeled(34, "'Макрорегион'", 10))
    c('office_desc', "if(%s %% 50 = 0, NULL, %s)" % (h(35), labeled(35, "'Офис'", 150)))
    c('ad_login', "concat(%s[1 + %s %% 10], '.user', toString(%s))" % (arr(['a', 'b', 'c', 'd', 'e', 'k', 'm', 'n', 'o', 's']), h(86), E))
    c('wo_employee_login', "concat('wo_user', toString(%s))" % E)
    c('wrk_email_address_txt', "concat('user', toString(%s), '@tbank.ru')" % E)
    c('clothes_size_code', pick(36, ['XS', 'S', 'M', 'L', 'XL', 'XXL'], 1.0))
    c('party_id', "toString(1000000 + %s * 7)" % E)
    c('company_fire_dt', "if(%s %% 100 < 5, toDate('2026-01-01') + toUInt32(%s %% 270), NULL)" % (h(37), h(38)), 'Date')
    c('company_fire_flg', "toInt16(%s %% 100 < 5)" % h(37), 'Int16')
    c('company_hire_dt', "toDate('2010-01-01') + toUInt32(%s %% 6100)" % h(39), 'Date')
    c('t_education_desc', pick(40, ['Нет', 'T-Старт', 'Финтех', 'T-образование другое'], 3.0))
    c('work_experience_year', "toDecimal64(round((%s %% 1600) / 100., 2), 2)" % h(39), 'Decimal(23, 2)')
    c('experience_group_nm', pick(41, ['до 3 мес', '3–6 мес', '6–12 мес', '1–3 года', '3–5 лет', 'более 5 лет']))
    c('active_type_nm', pick(42, ['Активная', 'Декрет', 'Длительный отпуск', 'Стажеры', 'Не выведен'], 3.0))
    c('seniority', pick(43, ['Intern', 'Junior', 'Middle', 'Senior', 'Lead', 'Head', 'Director', 'C-level']))
    c('grade', 'toInt16(1 + %s %% 20)' % h(44), 'Int16')
    c('change_grade_dt_text', "toString(toDate('2020-01-01') + toUInt32(%s %% 2400))" % h(45))
    c('change_specialization_dt_text', "toString(toDate('2020-01-01') + toUInt32(%s %% 2400))" % h(46))
    c('change_management_unit_dt_text', "toString(toDate('2020-01-01') + toUInt32(%s %% 2400))" % h(47))
    c('change_management_head_dt', "toDate('2020-01-01') + toUInt32(%s %% 2400)" % h(48), 'Date')
    c('summary_score', pick(49, ['A', 'B+', 'B', 'C', 'D', 'нет оценки']))
    c('employment_relation_type_desc', pick(50, ['Штатный сотрудник', 'ГПХ', 'Самозанятый', 'Совместитель'], 4.0))
    c('employee_status_desc', pick(51, ['Работает', 'Отпуск', 'Декрет', 'Больничный'], 4.0))
    c('employee_contract_type_desc', pick(52, ['Бессрочный', 'Срочный', 'Ученический', 'Совместительство'], 3.0))
    c('legal_position_nm', "concat(%s, ', должность ', toString(%s))" % (pick(54, SPECS), zipf(53, 100)))
    c('employee_main_work_no', "concat('T', toString(500000 + %s))" % E)
    c('legal_hire_dt', "toDate('2010-01-01') + toUInt32(%s %% 6100)" % h(39), 'Date')
    c('legal_fire_dt', "if(%s %% 100 < 5, toDate('2026-01-01') + toUInt32(%s %% 270), NULL)" % (h(37), h(38)), 'Date')
    for i in range(7):
        c('lvl%d_legal_unit_nm' % (i + 1), "nullIf(_lu_nm[%d], '')" % (i + 1))
        c('lvl%d_legal_unit_rk' % (i + 1), "nullIf(_lu_rk[%d], '')" % (i + 1))
    c('legal_unit_rk_list', "arrayFilter(x -> x != '', _lu_rk)", 'Array')
    c('hr_head_nm', "concat(%s, ' ', %s)" % (pick(55, LAST, 1.0), pick(56, FIRST, 1.0)))
    c('regional_hr_login', "if(%s %% 10 = 0, NULL, concat('rhr.user', toString(%s %% 200)))" % (h(57), h(57)))
    c('login_reg_hr_list', "if(%s %% 10 = 0, CAST([] AS Array(String)), if(%s %% 7 = 0, [concat('rhr.user', toString(%s %% 200)), concat('rhr.user', toString((%s + 1) %% 200))], [concat('rhr.user', toString(%s %% 200))]))" % (h(57), h(57), h(57), h(57), h(57)), 'Array')
    c('hr_head_mdm_employee_rk', 'toInt32(100000 + %s %% 100000)' % h(58), 'Int32')
    c('code_1c', "concat('1C-', toString(%s))" % E)
    c('employee_main_contract_type_nm', pick(59, ['Трудовой договор', 'Срочный трудовой договор', 'Договор ГПХ'], 3.0))
    c('employee_main_contract_end_dt', "if(%s %% 10 = 0, toDate('2027-01-01') + toUInt32(%s %% 700), NULL)" % (h(60), h(61)), 'Date')
    c('legal_head_flg', 'toInt16(%s %% 20 = 0)' % h(62), 'Int16')
    c('employee_main_schedule_nm', labeled(63, "'График'", 12))
    c('emp_contract_no', "concat('ТД-', toString(%s))" % E)
    for i in range(13):
        c('lvl%d_mapped_management_unit_nm' % (i + 1), "nullIf(_mu_nm[%d], '')" % (i + 1))
        c('lvl%d_mapped_management_unit_rk' % (i + 1), "nullIf(_mu_rk[%d], '')" % (i + 1))
    c('mapped_management_unit_nm', "arrayElement(arrayFilter(x -> x != '', _mu_nm), -1)")
    c('mapped_management_unit_rk_list', "arrayFilter(x -> x != '', _mu_rk)", 'Array')
    c('emp_specialization_oper_code', pick(66, ['HQ', 'Line', 'Support'], 1.5))
    c('emp_specialization_it_code', pick(67, ['IT', 'non-IT'], 1.0))
    c('emp_stream_desc', "concat(%s, ' · стрим ', toString(%s))" % (pick(68, SPECS), zipf(69, 3)))
    c('emp_specialization_desc', "concat(%s, ' ', toString(%s))" % (pick(70, SPECS, 1.5), zipf(71, 20)))
    c('management_head_flg', 'toInt32(%s %% 12 = 0)' % h(72), 'Int32')
    c('head_lvl_segment', pick(73, ['Не руководитель', 'Линейный руководитель', 'Руководитель без подчиненных', 'Лид лидов', 'Middle management', 'C-level'], 3.0))
    c('management_head_nm', "concat(%s, ' ', %s, ' ', %s)" % (pick(74, LAST, 1.0), pick(75, FIRST, 1.0), pick(76, MIDDLE, 1.0)))
    c('head_login', "concat('h.user', toString(%s %% 9000))" % h(74))
    c('head_wo_employee_login', "concat('wo_h', toString(%s %% 9000))" % h(74))
    c('head_wrk_email_address_txt', "concat('h.user', toString(%s %% 9000), '@tbank.ru')" % h(74))
    c('management_head_mdm_employee_rk', 'toInt32(100000 + %s %% 100000)' % h(74), 'Int32')
    c('hrbp_nm', "concat(%s, ' ', %s)" % (pick(77, LAST, 1.0), pick(78, FIRST, 1.0)))
    c('hrbp_login', "concat('hrbp.user', toString(%s %% 200))" % h(77))
    c('hrbp_mdm_employee_rk', 'toInt32(100000 + %s %% 200)' % h(77), 'Int32')
    c('hrap_login', "concat('hrap.user', toString(%s %% 300))" % h(79))
    c('hrap_mdm_employee_rk', 'toInt32(100000 + %s %% 300)' % h(79), 'Int32')
    c('subordination_lvl', pick(80, ['Сотрудник', 'N-1', 'N-2', 'N-3', 'N-4']))
    c('employee_link', "concat('https://mighty.tbank.ru/profile/', toString(100000 + %s))" % E)
    c('mapping_channel_name', labeled(81, "'Канал'", 30))
    c('respond_source_nm', labeled(82, "'Источник отклика'", 200))
    c('rb_flg', 'toInt16(%s %% 20 = 0)' % h(83), 'Int16')
    c('rb_migration_flg', 'toInt16(%s %% 40 = 0)' % h(84), 'Int16')
    c('tcr_exist_flg', 'toInt16(%s %% 4 = 0)' % h(85), 'Int16')
    c('profession_nm_array_new', '[%s]' % pick(65, SPECS), 'Array')
    c('mdm_employee_rk_list', '[toString(100000 + %s)]' % E, 'Array')
    # КП сотрудника: 1–3 аллокации; строка всех путей («уровень<>…<>уровень 12<>доля», аллокации через «;»)
    c('functional_lvl_all_array', "arrayStringConcat(arrayMap(a -> arrayStringConcat(arrayConcat(a.1, [toString(a.3)]), '<>'), _kpa), ';')")
    c('array_functional_unit_rk', "arrayStringConcat(arrayDistinct(arrayFlatten(arrayMap(a -> arrayFilter(x -> x != '', a.2), _kpa))), ';')")
    c('functional_unit_rk_list', "arrayDistinct(arrayFlatten(arrayMap(a -> arrayFilter(x -> x != '', a.2), _kpa)))", 'Array')
    return C


def kp_alloc_count(E):
    return '(1 + cityHash64(%s, 501) %% 3)' % E


def kp_path(E, A):
    """Путь аллокации A сотрудника E: (имена 12 уровней, rk 12 уровней), пустые уровни — ''."""
    leaf = 'toUInt64(least(3999, floor(4000 * pow((cityHash64(%s, 502 + %s) %% 1000003) / 1000003., 1.3))))' % (E, A)
    return tree(leaf, 500, 12, [3, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2], 3, KP_KINDS, WORDS, 'kp')


def kp_allocs(E):
    """Массив аллокаций сотрудника: (имена, rk, доля); доли в сумме 1."""
    items = []
    for a in range(3):
        nm, rk = kp_path(E, str(a))
        items.append('(%s, %s, round(1 / %s, 2))' % (nm, rk, kp_alloc_count(E)))
    return 'arraySlice([%s], 1, %s)' % (', '.join(items), kp_alloc_count(E))


def coltype(typ):
    return 'Array(String)' if typ == 'Array' else 'Nullable(%s)' % typ


def build(n=None, path=None, log=True):
    from chdb import session
    n = int(n or os.environ.get('DL_N') or 100000)
    s = session.Session(path or DB)
    t0 = time.time()
    s.query('CREATE DATABASE IF NOT EXISTS prod_proteus')
    emp = employee_columns('number')
    names = list(emp.keys())
    ddl = ', '.join('`%s` %s' % (k, coltype(emp[k][1])) for k in names)
    sel = ', '.join('%s AS `%s`' % (emp[k][0], k) for k in names)

    def src(E, n_rows, where=''):
        inner = ', '.join('%s AS %s' % (e, a) for e, a in aliases(E))
        return '(SELECT number, %s FROM numbers(%d)%s)' % (inner, n_rows, where)
    for t in ['mdm_employee_d_detail_last_day', 'mdm_employee_d_detail_period']:
        s.query('DROP TABLE IF EXISTS prod_proteus.%s' % t)
        s.query('CREATE TABLE prod_proteus.%s (business_dt Nullable(Date), %s) ENGINE = MergeTree ORDER BY tuple()' % (t, ddl))
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_last_day SELECT toDate('%s') AS business_dt, %s FROM %s" % (D1, sel, src('number', n)))
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_period SELECT * FROM prod_proteus.mdm_employee_d_detail_last_day")
    # D0: без каждого 30-го (наняты позже) и у каждого 20-го — другой стрим
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_period SELECT * REPLACE (toDate('%s') AS business_dt, "
            "if(mdm_employee_rk %% 20 = 0, 'Стрим прошлого месяца', emp_stream_desc) AS emp_stream_desc) "
            "FROM prod_proteus.mdm_employee_d_detail_last_day WHERE mdm_employee_rk %% 30 != 0" % D0)
    # аллокации КП: строка на аллокацию, колонки сотрудника те же
    fe = employee_columns('intDiv(number, 3)')
    kp_nm = 'arrayElement(arrayMap(a -> a.1, _kpa), toUInt32(number % 3 + 1))'
    fsel = ', '.join('%s AS `%s`' % (fe[k][0], k) for k in names)
    fsel += ", round(1 / %s, 2) AS allocation_prt_norm" % kp_alloc_count('intDiv(number, 3)')
    fsel += ', ' + ', '.join("nullIf(%s[%d], '') AS lvl%d_functional_unit_nm" % (kp_nm, i, i) for i in range(1, 13))
    fddl = ddl + ', allocation_prt_norm Nullable(Float64), ' + ', '.join('lvl%d_functional_unit_nm Nullable(String)' % i for i in range(1, 13))
    for t in ['mdm_employee_d_detail_last_day_functional', 'mdm_employee_d_detail_period_functional']:
        s.query('DROP TABLE IF EXISTS prod_proteus.%s' % t)
        s.query('CREATE TABLE prod_proteus.%s (business_dt Nullable(Date), %s) ENGINE = MergeTree ORDER BY tuple()' % (t, fddl))
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_last_day_functional SELECT toDate('%s') AS business_dt, %s "
            "FROM %s" % (D1, fsel, src('intDiv(number, 3)', n * 3, ' WHERE number %% 3 < %s' % kp_alloc_count('intDiv(number, 3)'))))
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_period_functional SELECT * FROM prod_proteus.mdm_employee_d_detail_last_day_functional")
    s.query("INSERT INTO prod_proteus.mdm_employee_d_detail_period_functional SELECT * REPLACE (toDate('%s') AS business_dt, "
            "if(mdm_employee_rk %% 20 = 0, 'Стрим прошлого месяца', emp_stream_desc) AS emp_stream_desc) "
            "FROM prod_proteus.mdm_employee_d_detail_last_day_functional WHERE mdm_employee_rk %% 30 != 0" % D0)
    s.query('DROP TABLE IF EXISTS prod_proteus.mdm_employee_d_business_dt_detail')
    s.query("CREATE TABLE prod_proteus.mdm_employee_d_business_dt_detail ENGINE = MergeTree ORDER BY tuple() AS "
            "SELECT CAST(d AS Nullable(Date)) AS business_dt_detail FROM (SELECT arrayJoin([toDate('%s'), toDate('%s')]) AS d)" % (D1, D0))
    warden(s)
    structures(s, n)
    if log:
        print(s.query("SELECT 'сотрудников' AS t, count() AS n FROM prod_proteus.mdm_employee_d_detail_last_day UNION ALL "
                      "SELECT 'аллокаций КП', count() FROM prod_proteus.mdm_employee_d_detail_last_day_functional UNION ALL "
                      "SELECT 'строк периода', count() FROM prod_proteus.mdm_employee_d_detail_period UNION ALL "
                      "SELECT 'юнитов УС', count() FROM prod_proteus.cross_filter_management_structure UNION ALL "
                      "SELECT 'юнитов ЮС', count() FROM prod_proteus.cross_filter_legal_structure UNION ALL "
                      "SELECT 'юнитов КП', count() FROM prod_proteus.cross_filter_functional_structure", 'PrettyCompactNoEscapes'))
        print('мир собран за %.0f с: %s' % (time.time() - t0, path or DB))
    return s


def warden(s):
    """warden_access_array_cross: колонки и порядок — как в скаляре текущего датасета."""
    s.query('DROP TABLE IF EXISTS prod_proteus.warden_access_array_cross')
    arrays = ['personal_management_unit_rk_list', 'personal_exception_management_unit_rk_list', 'personal_legal_unit_rk_list',
              'personal_functional_unit_rk_list', 'personal_exception_mdm_employee_rk_list',
              'grade_management_unit_rk_list', 'grade_exception_management_unit_rk_list', 'grade_legal_unit_rk_list',
              'grade_functional_unit_rk_list', 'grade_exception_mdm_employee_rk_list',
              'seniority_management_unit_rk_list', 'seniority_exception_management_unit_rk_list', 'seniority_legal_unit_rk_list',
              'seniority_exception_mdm_employee_rk_list',
              'review_management_unit_rk_list', 'review_exception_management_unit_rk_list', 'review_legal_unit_rk_list',
              'review_functional_unit_rk_list', 'review_exception_mdm_employee_rk_list']
    s.query('CREATE TABLE prod_proteus.warden_access_array_cross (mdm_employee_rk Nullable(Int32), ad_login Nullable(String), '
            'first_nm Nullable(String), management_unit_nm Nullable(String), warden_cross_data_flg Nullable(Int16), '
            + ', '.join('%s Array(String)' % a for a in arrays) +
            ', warden_support_gph_flg Nullable(Int16), profession_array_nm Array(String)) ENGINE = MergeTree ORDER BY tuple()')
    lvl3 = ("(SELECT groupArray(rk) FROM (SELECT DISTINCT lvl3_mapped_management_unit_rk AS rk FROM prod_proteus.mdm_employee_d_detail_last_day "
            "WHERE rk IS NOT NULL ORDER BY rk LIMIT 2))")
    lu2 = ("(SELECT groupArray(rk) FROM (SELECT DISTINCT lvl2_legal_unit_rk AS rk FROM prod_proteus.mdm_employee_d_detail_last_day "
           "WHERE rk IS NOT NULL ORDER BY rk LIMIT 1))")
    exc = ("(SELECT groupArray(toString(mdm_employee_rk)) FROM (SELECT mdm_employee_rk FROM prod_proteus.mdm_employee_d_detail_last_day "
           "WHERE has(%s, lvl3_mapped_management_unit_rk) ORDER BY mdm_employee_rk LIMIT 50))" % lvl3)

    E = "CAST([] AS Array(String))"

    def row(login, name, flg, pers, pers_lu, grade, sen, rev, gph, prof):
        vals = [pers, E, pers_lu, E, exc if pers != E else E, grade, E, E, E, E, sen, E, E, E, rev, E, E, E, E]
        return ("SELECT 1, '%s', '%s', 'Команда', %d, %s, %d, %s" % (login, name, flg, ', '.join(vals), gph, prof))
    s.query('INSERT INTO prod_proteus.warden_access_array_cross ' + ' UNION ALL '.join([
        row('a.user', 'Анна', 0, lvl3, lu2, lvl3, lvl3, lvl3, 0, E),
        row('hr.super', 'Сергей', 1, E, E, E, E, E, 0, E),
        row('p.lead', 'Павел', 0, E, E, E, E, E, 1, "['Аналитик данных', 'Юрист']"),
        row('an.a.sokolova', 'Анастасия', 0, E, E, E, E, E, 0, E),
    ]))


def structures(s, n):
    """Справочники старого кросс-фильтра: имя с родителем, если имя неуникально."""
    for kind, col, nlev, lv in [('management', 'mapped_management_unit', 13, 'management_unit_level_num'),
                                ('legal', 'legal_unit', 7, 'legal_unit_level_num')]:
        t = 'prod_proteus.cross_filter_%s_structure' % kind
        s.query('DROP TABLE IF EXISTS %s' % t)
        arms = []
        for i in range(1, nlev + 1):
            prk = 'lvl%d_%s_rk' % (i - 1, col) if i > 1 else "CAST(NULL AS Nullable(String))"
            pnm = 'lvl%d_%s_nm' % (i - 1, col) if i > 1 else "CAST(NULL AS Nullable(String))"
            arms.append('SELECT DISTINCT toInt16(%d) AS lv, %s AS prk, %s AS pnm, lvl%d_%s_rk AS rk, lvl%d_%s_nm AS nm '
                        'FROM prod_proteus.mdm_employee_d_detail_period WHERE rk IS NOT NULL' % (i, prk, pnm, i, col, i, col))
        s.query('CREATE TABLE %s ENGINE = MergeTree ORDER BY tuple() AS SELECT CAST(lv AS Nullable(Int16)) AS %s, '
                'prk AS parent_%s_rk, pnm AS parent_%s_nm, '
                "CAST(if(count() OVER (PARTITION BY nm) > 1, concat(nm, ' (', ifNull(pnm, ''), ')'), nm) AS Nullable(String)) AS new_%s_nm, "
                'rk AS %s_rk, nm AS %s_nm FROM (%s)' % (t, lv, kind + '_unit', kind + '_unit', kind + '_unit', kind + '_unit',
                                                        kind + '_unit', ' UNION ALL '.join(arms)))
    t = 'prod_proteus.cross_filter_functional_structure'
    s.query('DROP TABLE IF EXISTS %s' % t)
    s.query("CREATE TABLE %s ENGINE = MergeTree ORDER BY tuple() AS "
            "SELECT CAST(prk AS Nullable(String)) AS parent_functional_unit_rk, CAST(pnm AS Nullable(String)) AS parent_functional_unit_nm, "
            "CAST(if(count() OVER (PARTITION BY nm) > 1, concat(nm, ' (', pnm, ')'), nm) AS Nullable(String)) AS new_functional_unit_nm, "
            "CAST(rk AS Nullable(String)) AS functional_unit_rk, CAST(nm AS Nullable(String)) AS functional_unit_nm FROM ("
            "SELECT DISTINCT nms[d] AS nm, rks[d] AS rk, if(d = 1, '', nms[d - 1]) AS pnm, if(d = 1, '', rks[d - 1]) AS prk FROM ("
            "SELECT a.1 AS nms, a.2 AS rks FROM (SELECT %s AS _kpa FROM numbers(%d)) ARRAY JOIN _kpa AS a) "
            "ARRAY JOIN arrayFilter(i -> rks[i] != '', range(1, 13)) AS d)" % (t, kp_allocs('number'), n))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else None)
