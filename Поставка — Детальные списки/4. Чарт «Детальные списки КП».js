// ============================================================================
// detail-list.chart.js — чарты «Детальные списки» и «Детальные списки КП»
// ============================================================================
// КОНТРАКТ PROTEUS:
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЗАПРЕЩЕНО: backticks/template-literals, стрелочные функции, let/const,
//   document.getElementById (только overlay.querySelector), console.log в итоге,
//   addEventListener внутри тела render(), обращение к option из catch,
//   мутация option после присваивания, var P = '.' + CFG.ns в buildHTML
//   (точка только в buildCSS).
// ОБЯЗАТЕЛЬНО: все 7 блоков ниже, в таком порядке, без перенумерации.
// ОБЯЗАТЕЛЬНО: вызов render(); в теле mount() — без него overlay пустой.
//
// ВЫЧИСЛЕНИЯ ЖИВУТ ЗДЕСЬ, А НЕ В SQL. Проценты, дельты, ранги, накопительные
//   итоги, сортировка и форматирование считаются в buildModel() (БЛОК 3).
//   SQL отдаёт сырые строки — базу не нагружаем.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// Один файл на оба чарта: вёрстка и поведение одинаковые, режим (us | kp) приходит из
// датасета (meta). Файлы поставки отличаются только строкой ns: у чарта «Детальные списки
// КП» — 'dlk'. Так у двух чартов на одном дашборде свои состояние, стили и тултип.
// Данные — датасет proteus/detail-list.data.sql: строки разных ролей (role), пять колонок.
// Чарт эмитит кросс-фильтры САМ СЕБЕ (самовлияние включено): фильтры, сортировку, лимит,
// нужные части ответа. Строки приходят со всеми колонками: колонки, страницы, поиск по
// таблице, сортировка загруженного, группировка и «Копировать» — без запроса. Фильтры — на
// полке слева (как нативные фильтры Proteus): выбор копится и уходит одной «Применить».
var CFG = {
  ns: 'dlk',
  mode: 'snapshot',            // снимок на дату данных; период выбирается фильтром «Период»
  fields: { role: 'role', k: 'k', v: 'v', n: 'n', j: 'j' },
  title: { us: 'Детальные списки', kp: 'Детальные списки КП' },
  sub: { us: 'Параллельная структура', kp: 'Каталог продуктов' },
  limits: [5000, 10000, 25000],
  pageSizes: [50, 100, 200, 500],
  defaultCols: ['master_id', 'hiredate'],
  locked: { us: ['master_id', 'hiredate'], kp: ['master_id'] },
  emp: ['Юридическая', 'Активная'],
  tcr: ['ТЦР РФ', 'ТЦР СНГ', 'ТЦР РФ + ТЦР СНГ'],
  // Пределы — как у датасета: лишнее он отбросит, чарт не даёт набрать больше.
  maxVals: 200, maxValsTotal: 500, maxUnits: 50, maxKp: 20, maxIds: 2000, maxGroup: 3,
  searchMin: 2,                // с какой длины поиск идёт в датасет
  searchDelay: 450,            // пауза ввода перед поиском в датасете, мс
  treeRowsMax: 900,            // строк дерева в поповере за раз
  // Ответа с меткой запроса нет столько — чарт не фильтрует сам себя (или запрос завис).
  pendingWarnMs: 30000,
  mask: '⛔', maskText: '⛔️ Нет доступа к данным',
  // Структуры: отдельный фильтр на полке у каждой — дерево всех уровней и поиск (вместо
  // «Кросс-фильтр по УС» и «Уровень 3…13» нативных фильтров); max — сколько узлов можно выбрать.
  trees: [
    { key: 'mu', label: 'Юнит УС', name: 'Управленческая структура', max: 50 },
    { key: 'lu', label: 'Юнит ЮС', name: 'Юридическая структура', max: 50 },
    { key: 'kp', label: 'Продукт КП', name: 'Каталог продуктов', max: 20 }
  ],
  // Полка фильтров — разделы и порядок нативных фильтров борда 7241 (к ним привыкли пользователи).
  // per, ids, emp, tcr, mu, lu, kp — фильтры чарта; остальные ключи — атрибуты (значения — из датасета).
  shelf: [
    { name: 'Основные', keys: ['per', 'ids', 'emp', 'active_type_nm', 'employment_relation_type_desc', 'employee_contract_type_desc',
      'residential_state_nm', 'office_desc', 'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc',
      'emp_specialization_desc'] },
    { name: 'Управленческая', keys: ['mu', 'management_head_flg', 'hrbp_login'] },
    { name: 'Юридическая', keys: ['lu', 'regional_hr_login', 'employee_main_contract_type_nm', 'tcr'] },
    { name: 'Атрибуты найма', keys: ['mapping_channel_name', 'respond_source_nm'] },
    { name: 'Каталог продуктов', keys: ['kp'] },
    { name: 'Региональные атрибуты', keys: ['location_type', 'macroregion_nm', 'city_nm', 'tcr_exist_flg'] },
    { name: 'Другие атрибуты', keys: ['t_education_desc', 'company_fire_flg', 'rb_flg', 'rb_migration_flg', 'legal_position_nm',
      'subordination_lvl', 'head_lvl_segment'] }
  ],
  facetLabels: {
    active_type_nm: 'Тип численности', employment_relation_type_desc: 'Тип оформления', employee_contract_type_desc: 'Тип договора',
    employee_main_contract_type_nm: 'Тип договора (штат)', legal_position_nm: 'Должность', subordination_lvl: 'Положение сотрудника в структуре',
    company_fire_flg: 'Уволен на отчётную дату', t_education_desc: 'T-образование',
    emp_specialization_oper_code: 'HQ | Line | Support', emp_specialization_it_code: 'IT | non-IT', emp_stream_desc: 'Стрим',
    emp_specialization_desc: 'Специализация', management_head_flg: 'Флаг руководителя УС', head_lvl_segment: 'Сегмент руководителя',
    hrbp_login: 'Логин HRBP', regional_hr_login: 'Логин рег HR', location_type: 'Локация', macroregion_nm: 'Макрорегион',
    residential_state_nm: 'Регион', city_nm: 'Город', office_desc: 'Офис', tcr_exist_flg: 'В локации хаба',
    mapping_channel_name: 'Источник привлечения', respond_source_nm: 'Детализированный источник', rb_flg: 'Росбанк',
    rb_migration_flg: 'Росбанк (MNA)'
  },
  // Флаги 0 / 1 в фильтрах — словами.
  flagFacets: ['company_fire_flg', 'management_head_flg', 'tcr_exist_flg', 'rb_flg', 'rb_migration_flg'],
  idKinds: [
    { key: 'rk', label: 'MasterID', hint: 'только цифры' },
    { key: 'login', label: 'Логин', hint: 'регистр не важен' },
    { key: 'tab', label: 'Табельный', hint: 'как в 1С' },
    { key: 'siebel', label: 'Siebel ID', hint: 'основной' }
  ],
  // Колонки: ключ~подпись~группа — как в прежних чартах (добавлена «Ссылка на майти»).
  fieldDefs:
    'master_id~MasterID~Базовое;hiredate~Дата найма в компанию~Базовое;my_link~Ссылка на майти~Базовое;' +
    'last_nm~Фамилия~Атрибут ФЛ;first_nm~Имя~Атрибут ФЛ;full_nm~Полное ФИО~Атрибут ФЛ;' +
    'birth_dt~Дата рождения~Атрибут ФЛ;birth_day~День рождения~Атрибут ФЛ;' +
    'birth_month~Месяц рождения~Атрибут ФЛ;mdm_employee_age~Возраст~Атрибут ФЛ;' +
    'age_generation_nm~Возрастные поколения~Атрибут ФЛ;contact_main_phone_no~Номер телефона~Атрибут ФЛ;' +
    'prs_email_address_txt~Личная почта~Атрибут ФЛ;employee_document_type_desc~Тип документа~Атрибут ФЛ;' +
    'citizenship_country_desc~Страна гражданства~Атрибут ФЛ;' +
    'registration_state_nm~Регион регистрации~Атрибут ФЛ;registration_city_nm~Город регистрации~Атрибут ФЛ;' +
    'registration_full_address_txt~Полный адрес регистрации~Атрибут ФЛ;' +
    'residential_state_nm~Регион проживания~Атрибут ФЛ;city_nm~Город проживания~Атрибут ФЛ;' +
    'residential_full_address_txt~Полный адрес проживания~Атрибут ФЛ;' +
    'doc_city_nm~Город отправки документов из 1С~Атрибут ФЛ;' +
    'marital_status_desc~Семейное положение~Атрибут ФЛ;gender_desc~Пол~Атрибут ФЛ;' +
    'education_degree_unique_max~Уровень образования~Атрибут ФЛ;' +
    'education_spec_nm~Направление образования~Атрибут ФЛ;has_children_flg~Наличие детей~Атрибут ФЛ;' +
    'location_type~Локация~Атрибут ФЛ;macroregion_nm~Макрорегион~Атрибут ФЛ;' +
    'office_desc~Офис~Атрибут сотрудника;ad_login~Логин~Атрибут сотрудника;' +
    'wo_employee_login~WO логин~Атрибут сотрудника;wrk_email_address_txt~Рабочая почта~Атрибут сотрудника;' +
    'clothes_size_code~Размер одежды~Атрибут сотрудника;party_id~Основной Siebel_ID~Атрибут сотрудника;' +
    'company_fire_dt~Дата увольнения из компании~Атрибут сотрудника;' +
    't_education_desc~Принадлежность к T-образованию~Атрибут сотрудника;' +
    'work_experience_year~Стаж в годах~Атрибут сотрудника;' +
    'experience_group_nm~Группа стажа~Атрибут сотрудника;active_type_nm~Тип численности~Атрибут сотрудника;' +
    'seniority~Уровень позиции~Атрибут сотрудника;grade~Грейд~Атрибут сотрудника;' +
    'change_grade_dt_text~Дата перевода в текущий грейд~Атрибут сотрудника;' +
    'change_specialization_dt_text~Дата перевода в текущую специализацию~Атрибут сотрудника;' +
    'change_management_unit_dt_text~Дата перевода в текущую команду~Атрибут сотрудника;' +
    'change_management_head_dt~Дата перевода в руководителя~Атрибут сотрудника;' +
    'summary_score~Оценка ревью~Атрибут сотрудника;' +
    'employment_relation_type_desc~Тип трудоустройства~Атрибут ЮС;' +
    'employee_status_desc~Статус позиции~Атрибут ЮС;employee_contract_type_desc~Тип договора~Атрибут ЮС;' +
    'legal_position_nm~Должность~Атрибут ЮС;employee_main_work_no~Табельный номер~Атрибут ЮС;' +
    'legal_hire_dt~Дата найма на юр позицию~Атрибут ЮС;legal_fire_dt~Дата увольнения с юр позиции~Атрибут ЮС;' +
    'lvl1_legal_unit_nm~ЮС - Уровень 1~Атрибут ЮС;lvl2_legal_unit_nm~ЮС - Уровень 2~Атрибут ЮС;' +
    'lvl3_legal_unit_nm~ЮС - Уровень 3~Атрибут ЮС;lvl4_legal_unit_nm~ЮС - Уровень 4~Атрибут ЮС;' +
    'lvl5_legal_unit_nm~ЮС - Уровень 5~Атрибут ЮС;lvl6_legal_unit_nm~ЮС - Уровень 6~Атрибут ЮС;' +
    'lvl7_legal_unit_nm~ЮС - Уровень 7~Атрибут ЮС;hr_head_nm~ФИ регионального HR~Атрибут ЮС;' +
    'regional_hr_login~Логин регионального HR~Атрибут ЮС;' +
    'hr_head_mdm_employee_rk~MasterID регионального HR~Атрибут ЮС;code_1c~Код юнита из 1С~Атрибут ЮС;' +
    'employee_main_contract_type_nm~Срочный/бессрочный ТД~Атрибут ЮС;' +
    'employee_main_contract_end_dt~Дата окончания ТД~Атрибут ЮС;' +
    'legal_head_flg~Флаг руководителя ЮС~Атрибут ЮС;employee_main_schedule_nm~Штатное расписание~Атрибут ЮС;' +
    'emp_contract_no~Номер трудового договора~Атрибут ЮС;' +
    'lvl3_mapped_management_unit_nm~УС - Уровень 3~Атрибут УС;' +
    'lvl4_mapped_management_unit_nm~УС - Уровень 4~Атрибут УС;' +
    'lvl5_mapped_management_unit_nm~УС - Уровень 5~Атрибут УС;' +
    'lvl6_mapped_management_unit_nm~УС - Уровень 6~Атрибут УС;' +
    'lvl7_mapped_management_unit_nm~УС - Уровень 7~Атрибут УС;' +
    'lvl8_mapped_management_unit_nm~УС - Уровень 8~Атрибут УС;' +
    'lvl9_mapped_management_unit_nm~УС - Уровень 9~Атрибут УС;' +
    'lvl10_mapped_management_unit_nm~УС - Уровень 10~Атрибут УС;' +
    'lvl11_mapped_management_unit_nm~УС - Уровень 11~Атрибут УС;mapped_management_unit_nm~Юнит УС~Атрибут УС;' +
    'emp_specialization_oper_code~HQ|Line|Support~Атрибут УС;emp_specialization_it_code~IT|nonIT~Атрибут УС;' +
    'emp_stream_desc~Стрим~Атрибут УС;emp_specialization_desc~Специализация~Атрибут УС;' +
    'management_head_flg~Флаг руководителя УС~Атрибут УС;head_lvl_segment~Сегмент руководителя~Атрибут УС;' +
    'management_head_nm~ФИ руководителя~Атрибут УС;head_login~Логин руководителя~Атрибут УС;' +
    'head_wo_employee_login~WO логин руководителя~Атрибут УС;' +
    'head_wrk_email_address_txt~Почта руководителя~Атрибут УС;' +
    'management_head_mdm_employee_rk~MasterID руководителя~Атрибут УС;hrbp_nm~ФИ HRBP~Атрибут УС;' +
    'hrbp_login~Логин HRBP~Атрибут УС;hrbp_mdm_employee_rk~MasterID HRBP~Атрибут УС;' +
    'hrap_login~Логин HRAP~Атрибут УС;hrap_mdm_employee_rk~MasterID HRAP~Атрибут УС;' +
    'subordination_lvl~Положение сотрудника в структуре~Атрибут УС',
  kpFieldDefs: 'alloc~Аллокация~КП;kp1~КП - Уровень 1~КП;kp2~КП - Уровень 2~КП;kp3~КП - Уровень 3~КП;kp4~КП - Уровень 4~КП;' +
    'kp5~КП - Уровень 5~КП;kp6~КП - Уровень 6~КП;kp7~КП - Уровень 7~КП;kp8~КП - Уровень 8~КП;kp9~КП - Уровень 9~КП;' +
    'kp10~КП - Уровень 10~КП;kp11~КП - Уровень 11~КП;kp12~КП - Уровень 12~КП;sum_alloc~Суммарная аллокация~КП;' +
    'alloc_count~Кол-во аллокаций~КП',
  // Колонки строки аллокации (у КП); sum_alloc и alloc_count считает чарт по блоку сотрудника.
  allocKeys: ['alloc', 'kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8', 'kp9', 'kp10', 'kp11', 'kp12'],
  virtualKeys: ['sum_alloc', 'alloc_count'],
  dateKeys: ['hiredate', 'birth_dt', 'company_fire_dt', 'change_management_head_dt', 'legal_hire_dt', 'legal_fire_dt',
    'employee_main_contract_end_dt'],
  numKeys: ['master_id', 'birth_day', 'birth_month', 'mdm_employee_age', 'has_children_flg', 'work_experience_year', 'grade',
    'hr_head_mdm_employee_rk', 'legal_head_flg', 'management_head_flg', 'management_head_mdm_employee_rk',
    'hrbp_mdm_employee_rk', 'hrap_mdm_employee_rk', 'alloc', 'sum_alloc', 'alloc_count'],
  // Дробные — в «Копировать» с запятой (Excel в русской локали).
  decimalKeys: ['work_experience_year', 'alloc', 'sum_alloc'],
  presets: [
    { name: 'Персоналка', cols: ['master_id', 'full_nm', 'birth_dt', 'mdm_employee_age', 'age_generation_nm', 'company_fire_dt',
      'work_experience_year', 'contact_main_phone_no', 'prs_email_address_txt', 'registration_state_nm', 'registration_city_nm',
      'registration_full_address_txt', 'residential_state_nm', 'city_nm', 'residential_full_address_txt', 'doc_city_nm',
      'education_degree_unique_max', 'education_spec_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt', 'active_type_nm',
      'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc', 'hiredate', 'regional_hr_login',
      'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'legal_position_nm', 'lvl3_mapped_management_unit_nm',
      'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm',
      'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm',
      'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl',
      'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc',
      'management_head_flg', 'head_lvl_segment', 'management_head_nm', 'head_login', 'hrbp_nm', 'hrbp_login', 'hrap_login',
      'change_management_unit_dt_text', 'change_management_head_dt', 'change_specialization_dt_text', 'has_children_flg'] },
    { name: 'Рабочие данные', cols: ['master_id', 'employee_main_work_no', 'full_nm', 'legal_position_nm', 'grade',
      'management_head_flg', 'birth_dt', 'mdm_employee_age', 'company_fire_dt', 'work_experience_year', 'registration_state_nm',
      'registration_city_nm', 'residential_state_nm', 'city_nm', 'doc_city_nm', 'office_desc', 'ad_login', 'wrk_email_address_txt',
      'active_type_nm', 't_education_desc', 'employment_relation_type_desc', 'employee_status_desc', 'employee_contract_type_desc',
      'hiredate', 'lvl1_legal_unit_nm', 'lvl2_legal_unit_nm', 'lvl3_legal_unit_nm', 'lvl4_legal_unit_nm', 'lvl5_legal_unit_nm',
      'lvl6_legal_unit_nm', 'lvl7_legal_unit_nm', 'code_1c', 'employee_main_schedule_nm', 'hr_head_nm', 'regional_hr_login',
      'employee_main_contract_type_nm', 'employee_main_contract_end_dt', 'lvl3_mapped_management_unit_nm',
      'lvl4_mapped_management_unit_nm', 'lvl5_mapped_management_unit_nm', 'lvl6_mapped_management_unit_nm',
      'lvl7_mapped_management_unit_nm', 'lvl8_mapped_management_unit_nm', 'lvl9_mapped_management_unit_nm',
      'lvl10_mapped_management_unit_nm', 'lvl11_mapped_management_unit_nm', 'mapped_management_unit_nm', 'subordination_lvl',
      'emp_specialization_oper_code', 'emp_specialization_it_code', 'emp_stream_desc', 'emp_specialization_desc',
      'head_lvl_segment', 'management_head_nm', 'head_wrk_email_address_txt', 'head_login', 'hrbp_nm', 'hrbp_login',
      'hrap_login', 'change_grade_dt_text', 'seniority', 'change_management_unit_dt_text', 'change_management_head_dt',
      'change_specialization_dt_text', 'summary_score'] },
    { name: 'КП-разрез', only: 'kp', cols: ['master_id', 'full_nm', 'kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8', 'kp9',
      'kp10', 'kp11', 'kp12', 'alloc', 'hiredate', 'active_type_nm', 'employee_main_work_no', 'legal_position_nm'] }
  ],
  text: {
    noData: 'Нет данных',
    loading: 'Обновляю список…',
    notApplied: 'Ответа на запрос нет 30 секунд. Если так на каждом действии — чарт не фильтрует сам себя: в JSON-метаданных дашборда у этого чарта crossFilters.scope.excluded не должен содержать сам чарт (инструкция поставки, п. 4.5).',
    noAccess: 'Для вашего логина нет строки в таблице доступа warden — список недоступен.',
    noCf: 'Фильтры не применились: в этом окружении нет applyCrossFilter (откройте чарт на дашборде).',
    // Под фильтрами больше, чем помещается в таблицу (последний из limits).
    over: 'Под фильтрами больше {max} сотрудников — все в таблицу не поместятся. Сузьте фильтры слева, чтобы загрузились все данные.',
    part: 'В таблице первые {got} из {total}.'
  },
  // Токены — профиль виджетов Proteus Adoption, как в HRBP HUB: текст, линии, акцент #2b6cff.
  colors: {
    bg: '#f4f5f7', card: '#ffffff', line: '#e7e9ee', line2: '#eef0f3',
    ink: '#23272e', ink2: '#454b55', muted: '#8a909c', muted2: '#aab0bb',
    warnTx: '#9a6500', blue: '#3b6fe0', blueBg: '#eef3fe', blueTx: '#2b5fd0', act: '#2b6cff', actInk: '#1f55d6',
    surface2: '#f3f4f6', hover: '#fafbfc', rowHover: '#f5f8ff', grp: '#f6f7fb', hl: '#dfe8ff'
  },
  // Типографика — профиль Adoption (DESIGN_SYSTEM.md §16): кегли только по ролям, веса 400 / 500 / 600.
  // micro — вторые подписи, cap — капитель шапок, note — подписи и пилюли, control — кнопки,
  // body — таблица и текст, title — заголовок.
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    micro: 9.5, cap: 10.5, note: 11.5, control: 12, body: 12.5, title: 14.5
  },
  // Отступы — шкала 2…16 профиля; строка таблицы списка — плотная (данных много).
  spacing: { gutter: 16, gap: 12, rowH: 32, colMin: 70, colMax: 640, shelfW: 280, shelfOffW: 44 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Для таблиц с поиском/сортировкой/пагинацией имена ключей бери из TABLES.md,
// чтобы правки разных сессий не расходились.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
var STATE0 = {
  tip: null,
  open: '',              // открытый поповер: per | emp | tcr | mu | lu | kp | f:<атрибут> | ids | cols | group | lim | ''
  q: '',                 // строка поиска открытого поповера
  qT: null,              // таймер поиска в датасете
  stage: null,           // набранные, но не применённые фильтры — копия applied() с правками
  treeOpen: {},          // раскрытые узлы: 'mu:id' → true / false
  shelfOff: false,       // полка фильтров свёрнута
  shelfFold: {},         // свёрнутые разделы полки: номер раздела → true
  idKind: 'rk',          // вкладка «Сотрудников»
  colDraft: null,        // черновик колонок в поповере «Колонки»
  colQ: '',              // поиск по названиям колонок
  columnOrder: null,     // колонки показа по порядку (null — как в ответе)
  colW: {},              // ширины колонок, px
  sortKey: '', sortDir: '', // сортировка загруженного (без запроса); '' — порядок ответа
  search: '',            // поиск по загруженным строкам
  page: 0, pageSize: 100,
  groupBy: [],           // группировка по колонкам (ключи)
  collapsedGroups: {},   // свёрнутые группы
  pend: null,            // {rq, at, kind, pt} — эмит ушёл, ждём ответ с той же меткой
  pendT: null, rqN: 0,
  warn: '',
  heal: '',              // подпись запроса, для которого уже досылали строки
  cache: null,           // части ответов по подписи фильтров: rows / f / t / s
  names: {},             // подписи выбранных узлов: 'mu:id' → {name, path}
  keep: null,            // прокрутка до запроса — вернуть после ответа
  copied: ''
};
if (!__S[CFG.ns]) __S[CFG.ns] = {};
// Ключи, которых нет в состоянии прошлой версии скрипта (страницу не перезагружали), — по умолчанию.
for (var k0 in STATE0) if (STATE0.hasOwnProperty(k0) && !__S[CFG.ns].hasOwnProperty(k0)) __S[CFG.ns][k0] = STATE0[k0];
var state = __S[CFG.ns];
if (!state.cache) state.cache = { rows: null, f: null, t: {}, s: {} };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
  // '1,5' -> дробная запятая; '1,234.5' -> запятая это разряды.
  if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(/,/g, '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}
// Универсальный парсер даты: epoch-ms, epoch-s, 'YYYY-MM-DD', 'YYYY-MM'.
// Нужен всегда: DATETIME из Proteus приходит числом, а не строкой из UI.
function toDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var s = String(raw).trim(), d = null;
  if (/^\d{11,}$/.test(s)) { var ms = Number(s); d = new Date(ms > 1e12 ? ms : ms * 1000); }
  else if (/^\d{10}$/.test(s)) d = new Date(Number(s) * 1000);
  else {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function sameSet(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}
function lower(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е'); }
// Пачка строк: base64 от UTF-8 — встроенными atob + TextDecoder (без посимвольного разбора base64).
var UTF8 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
function b64utf8(s) {
  if (!s) return '';
  var bin = atob(String(s));
  if (!UTF8) return decodeURIComponent(escape(bin));
  var n = bin.length, u = new Uint8Array(n);
  for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return UTF8.decode(u);
}
function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// Реестр колонок: ключ → подпись, группа. У КП — плюс аллокации и два расчётных поля.
function parseDefs(s) {
  var out = [], parts = String(s).split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].split('~');
    if (p[0]) out.push({ key: p[0], label: p[1] || p[0], group: p[2] || '' });
  }
  return out;
}
var FIELD_BASE = parseDefs(CFG.fieldDefs), FIELD_KP = parseDefs(CFG.kpFieldDefs);
function inArr(a, v) { return (a || []).indexOf(v) > -1; }
function sigList(a) { return (a || []).slice().sort().join('\u0001'); }
function uniq(a) {
  var out = [], seen = {};
  for (var i = 0; i < (a || []).length; i++) if (!seen['~' + a[i]]) { seen['~' + a[i]] = 1; out.push(a[i]); }
  return out;
}
// Эхо списков: 'атрибут=значение' → {атрибут: [значения]}; keys — заранее пустые ключи.
function splitEq(list, keys) {
  var out = {};
  for (var i = 0; keys && i < keys.length; i++) out[keys[i]] = [];
  for (var j = 0; j < (list || []).length; j++) {
    var s = String(list[j]), at = s.indexOf('=');
    if (at < 0) continue;
    var a = s.slice(0, at);
    if (!out[a]) out[a] = [];
    out[a].push(s.slice(at + 1));
  }
  return out;
}
var ID_KEYS = [];
for (var ik = 0; ik < CFG.idKinds.length; ik++) ID_KEYS.push(CFG.idKinds[ik].key);
// Подпись фильтров — всё, от чего зависят значения фильтров и деревья; подпись строк — плюс
// сортировка и лимит. По ним части ответов из кэша подходят к эху нового ответа.
function fsigOf(o) {
  var s = 'p:' + (o.per === 'date' ? 'date:' + (o.dt || '') : 'last') + '|e:' + (o.emp || CFG.emp[0]) + '|t:' + (o.tcr || '');
  var ks = [];
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) ks.push(a);
  ks.sort();
  for (var i = 0; i < ks.length; i++) s += '|f:' + ks[i] + '=' + sigList(o.flt[ks[i]]);
  s += '|mu:' + sigList(o.mu) + '|lu:' + sigList(o.lu) + '|kp:' + sigList(o.kp);
  for (var k = 0; k < ID_KEYS.length; k++) s += '|' + ID_KEYS[k] + ':' + sigList((o.id || {})[ID_KEYS[k]]);
  return s;
}
function rsigOf(o) { return fsigOf(o) + '|s:' + (o.sort || '') + '|l:' + (o.lim || ''); }

// Ответ датасета → модель. Части ответа кладутся в state.cache со своей подписью: ответ «только
// значения фильтров» или «только поиск» берёт строки из кэша, если они под тем же запросом.
function buildModel() {
  var F = CFG.fields, M = { ok: false, err: '', missing: [], mode: 'us', cf: '_f', m: {}, a: {}, dates: [], total: 0,
    parts: [], qEcho: '', q: [], fq: {}, rows: null, facets: null, trees: {}, applied: null, fsig: '', rsig: '' };
  if (!rawData.length) { M.err = 'empty'; return M; }
  var r0 = rawData[0], need = ['role', 'k', 'v', 'n', 'j'];
  for (var i = 0; i < need.length; i++) if (!r0.hasOwnProperty(F[need[i]])) M.missing.push(F[need[i]]);
  if (M.missing.length) { M.err = 'columns'; return M; }
  var meta = null, chunks = [], f = {}, fn = {}, t = {}, sel = {}, qh = [], fq = {}, fp = 0;
  for (var r = 0; r < rawData.length; r++) {
    var row = rawData[r], role = row[F.role];
    var k = row[F.k] == null ? '' : String(row[F.k]), v = row[F.v] == null ? '' : String(row[F.v]);
    var n = num(row[F.n]) || 0, j = row[F.j] == null ? '' : String(row[F.j]);
    if (role === 'meta') { meta = parseJSON(j); M.mode = k === 'kp' ? 'kp' : 'us'; M.total = n; }
    else if (role === 'r') { chunks.push({ k: +k || 0, j: j }); fp += j.length; }
    else if (role === 'f') {
      var fj = j.split('\t');
      (f[k] || (f[k] = [])).push({ v: v, n: n, all: +fj[0] || 0 });
      fn[k] = +fj[1] || 0;
    }
    else if (role === 'fq') (fq[k] || (fq[k] = [])).push({ v: v, n: n, all: +j || 0 });
    else if (role === 't' || role === 'q' || role === 's') {
      // уровень, родитель, имя, всего, есть дети, путь, узлов в дереве
      var p = j.split('\t');
      var node = { id: v, k: k, n: n, lvl: +p[0] || 0, pid: p[1] || '', name: p[2] || '', all: +p[3] || 0,
        hk: p[4] === '1', path: p[5] || '', nodes: +p[6] || 0 };
      if (role === 't') (t[k] || (t[k] = [])).push(node);
      else if (role === 'q') qh.push(node);
      else (sel[k] || (sel[k] = [])).push(node);
    }
  }
  if (!meta || !meta.m) { M.err = 'nometa'; return M; }
  M.m = meta.m; M.a = meta.a || {}; M.dates = meta.dates || [];
  M.cf = M.m.cf || (M.mode === 'kp' ? '_kf' : '_f');
  M.ok = String(M.m.ok) === '1' || String(M.m.ok) === 'true';
  var a = M.a;
  M.applied = { per: M.m.per === 'date' ? 'date' : 'last', dt: M.m.dt || '', emp: M.m.emp || CFG.emp[0], tcr: M.m.tcr || '',
    flt: splitEq(a.flt), mu: (a.mu || []).slice(), lu: (a.lu || []).slice(), kp: (a.kp || []).slice(), id: splitEq(a.id, ID_KEYS),
    cols: (a.cols || []).slice(), sort: M.m.sort || 'master_id:asc', lim: +M.m.lim || CFG.limits[0] };
  M.parts = a.pt || ['r'];
  M.qEcho = (a.q || [])[0] || '';
  M.fsig = fsigOf(M.applied);
  M.rsig = rsigOf(M.applied);
  var C = state.cache;
  // Кэш — одного режима (у двух чартов разные ns, но на всякий случай).
  if (C.mode !== M.mode) { C.rows = null; C.f = null; C.t = {}; C.s = {}; C.mode = M.mode; }
  if (inArr(M.parts, 'r')) {
    // Перезапуск скрипта с теми же данными (ресайз, перерисовка) — пачки уже разобраны.
    var fpk = (M.m.rq || '') + '|' + rawData.length + '|' + fp + '|' + M.rsig;
    if (!(C.rows && C.rows.fp === fpk)) {
      chunks.sort(function (x, y) { return x.k - y.k; });
      var rows = [];
      for (var c = 0; c < chunks.length; c++) {
        var lines = b64utf8(chunks[c].j).split('\n');
        for (var li = 0; li < lines.length; li++) if (lines[li] !== '') rows.push(lines[li].split('\t'));
      }
      C.rows = { fp: fpk, sig: M.rsig, cols: M.applied.cols.slice(), rows: rows, prep: {} };
      prepRows(C.rows, M.mode);
    }
  }
  if (inArr(M.parts, 'f')) C.f = { sig: M.fsig, vals: f, nv: fn };
  for (var ti = 0; ti < CFG.trees.length; ti++) {
    var tk = CFG.trees[ti].key;
    if (inArr(M.parts, tk)) C.t[tk] = { sig: M.fsig, nodes: t[tk] || [], extra: {}, by: null };
  }
  for (var sk in sel) {
    if (!sel.hasOwnProperty(sk)) continue;
    C.s[sk] = C.s[sk] || {};
    for (var si = 0; si < sel[sk].length; si++) C.s[sk][sel[sk][si].id] = sel[sk][si];
  }
  // Находки поиска; дети узла ('mu>id', 'kp>путь') — в дерево той же подписи.
  M.q = qh;
  M.fq = fq;
  var qm = /^(mu|lu|kp)>([\s\S]*)$/.exec(M.qEcho);
  if (qm && C.t[qm[1]] && C.t[qm[1]].sig === M.fsig) {
    C.t[qm[1]].extra[qm[2]] = qh;
    C.t[qm[1]].by = null;
  }
  M.rows = C.rows && C.rows.sig === M.rsig ? C.rows : null;
  M.facets = C.f && C.f.sig === M.fsig ? C.f : null;
  for (var tj = 0; tj < CFG.trees.length; tj++) {
    var tk2 = CFG.trees[tj].key;
    M.trees[tk2] = C.t[tk2] && C.t[tk2].sig === M.fsig ? C.t[tk2] : null;
  }
  return M;
}
// Строки → блоки сотрудников: у КП со строками аллокаций — подряд идущие строки одного MasterID.
function prepRows(R, mode) {
  var ci = {}, cols = R.cols;
  for (var i = 0; i < cols.length; i++) ci[cols[i]] = i;
  R.ci = ci;
  R.perAlloc = false;
  if (mode === 'kp') for (var a = 0; a < CFG.allocKeys.length; a++) if (ci.hasOwnProperty(CFG.allocKeys[a])) R.perAlloc = true;
  var blocks = [], rows = R.rows, mi = ci.master_id === undefined ? 0 : ci.master_id;
  for (var r = 0; r < rows.length; r++) {
    var last = blocks[blocks.length - 1];
    if (R.perAlloc && last && rows[last.i][mi] === rows[r][mi]) last.n++;
    else blocks.push({ i: r, n: 1 });
  }
  R.blocks = blocks;
}
var MODEL = buildModel();
var MODE = MODEL.mode, ROWS = MODEL.rows;
var FIELDS = MODE === 'kp' ? FIELD_BASE.concat(FIELD_KP) : FIELD_BASE.slice();
var FIELD_BY = {};
for (var fi = 0; fi < FIELDS.length; fi++) FIELD_BY[FIELDS[fi].key] = FIELDS[fi];
var LOCKED = CFG.locked[MODE] || CFG.locked.us;
function labelOf(k) { return FIELD_BY[k] ? FIELD_BY[k].label : (CFG.facetLabels[k] || k); }
function isVirtual(k) { return inArr(CFG.virtualKeys, k); }
function isAllocKey(k) { return inArr(CFG.allocKeys, k) || isVirtual(k); }
// Колонка доступна в загруженных строках (расчётные — если есть то, из чего считать).
function loaded(k) {
  if (!ROWS) return false;
  if (k === 'sum_alloc') return ROWS.ci.hasOwnProperty('alloc');
  if (k === 'alloc_count') return ROWS.perAlloc;
  return ROWS.ci.hasOwnProperty(k);
}

// ---- применённое, набранное, запрос ----
function copyF(o) {
  var c = { per: o.per, dt: o.dt, emp: o.emp, tcr: o.tcr, flt: {}, mu: (o.mu || []).slice(), lu: (o.lu || []).slice(),
    kp: (o.kp || []).slice(), id: {} };
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) c.flt[a] = o.flt[a].slice();
  for (var i = 0; i < ID_KEYS.length; i++) c.id[ID_KEYS[i]] = ((o.id || {})[ID_KEYS[i]] || []).slice();
  return c;
}
var DEFAULT_F = { per: 'last', dt: '', emp: CFG.emp[0], tcr: '', flt: {}, mu: [], lu: [], kp: [], id: {} };
function applied() { return MODEL.applied || DEFAULT_F; }
// Строка фильтров копит выбор и отправляет его одной кнопкой «Применить».
function staged() { return state.stage || applied(); }
function stageEdit(fn) {
  if (!state.stage) state.stage = copyF(applied());
  fn(state.stage);
  if (!diffKeys(applied(), state.stage).length) state.stage = null;
}
// Что отличается: группы фильтров (per, emp, tcr, mu, lu, kp, id, flt:<атрибут>).
function diffKeys(a, b) {
  var out = [];
  if ((a.per || 'last') !== (b.per || 'last') || (a.per === 'date' && a.dt !== b.dt)) out.push('per');
  if ((a.emp || CFG.emp[0]) !== (b.emp || CFG.emp[0])) out.push('emp');
  if ((a.tcr || '') !== (b.tcr || '')) out.push('tcr');
  for (var t = 0; t < CFG.trees.length; t++) { var tk = CFG.trees[t].key; if (!sameSet(a[tk], b[tk])) out.push(tk); }
  var idc = false;
  for (var i = 0; i < ID_KEYS.length; i++) if (!sameSet((a.id || {})[ID_KEYS[i]], (b.id || {})[ID_KEYS[i]])) idc = true;
  if (idc) out.push('id');
  var seen = {};
  for (var x in (a.flt || {})) if (a.flt.hasOwnProperty(x)) seen[x] = 1;
  for (var y in (b.flt || {})) if (b.flt.hasOwnProperty(y)) seen[y] = 1;
  for (var z in seen) if (seen.hasOwnProperty(z) && !sameSet((a.flt || {})[z], (b.flt || {})[z])) out.push('flt:' + z);
  return out;
}
function stageDiff() { return state.stage ? diffKeys(applied(), state.stage).length : 0; }
function fltCount(o) {
  var n = 0;
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a) && o.flt[a].length) n++;
  return n;
}
function idCount(o) {
  var n = 0;
  for (var i = 0; i < ID_KEYS.length; i++) n += ((o.id || {})[ID_KEYS[i]] || []).length;
  return n;
}
function anyFilter(o) {
  return o.per === 'date' || o.emp !== CFG.emp[0] || !!o.tcr || fltCount(o) > 0 || o.mu.length > 0 || o.lu.length > 0 ||
    o.kp.length > 0 || idCount(o) > 0;
}
// Колонки показа: выбор пользователя (порядок) или по умолчанию; группировка — отдельно, над
// строками. Строки приходят со всеми колонками (эхо cols) — показ колонки запроса не требует.
function colOrder() {
  var base = state.columnOrder || CFG.defaultCols, out = [];
  for (var i = 0; i < base.length; i++) if (FIELD_BY[base[i]] && !inArr(state.groupBy, base[i])) out.push(base[i]);
  for (var l = LOCKED.length - 1; l >= 0; l--) if (!inArr(out, LOCKED[l]) && !inArr(state.groupBy, LOCKED[l])) out.unshift(LOCKED[l]);
  return uniq(out);
}
function displayCols() {
  var o = colOrder(), out = [];
  for (var i = 0; i < o.length; i++) if (loaded(o[i])) out.push(o[i]);
  return out;
}
// У КП строка на аллокацию; показана хоть одна колонка аллокации — блок сотрудника в несколько
// строк, иначе — одна строка на сотрудника.
function perRowCols(cols) {
  for (var i = 0; i < cols.length; i++) if (isAllocKey(cols[i]) && !isVirtual(cols[i])) return true;
  return false;
}
// Запрос: фильтры + сортировка и лимит строк (колонки не запрашиваются — приходят все).
function viewNow() { var ap = applied(); return { sort: ap.sort, lim: ap.lim }; }
function reqOf(f, view, pt) {
  var o = copyF(f);
  o.sort = view.sort; o.lim = view.lim; o.pt = pt || ['r']; o.q = '';
  return o;
}
// Маска кросс-фильтра. Носитель = основа + meta.cf ('_f' | '_kf'); value = [] не шлём никогда.
function maskOf(o) {
  var out = [], cf = MODEL.cf;
  function add(base, vals) {
    var v = [];
    for (var i = 0; i < (vals || []).length; i++) if (vals[i] !== null && vals[i] !== undefined && String(vals[i]) !== '') v.push(String(vals[i]));
    if (v.length) out.push({ column: base + cf, operator: 'IN', value: v });
  }
  if (o.per === 'date' && o.dt) { add('per', ['date']); add('dt', [o.dt]); }
  if (o.emp && o.emp !== CFG.emp[0]) add('emp', [o.emp]);
  if (o.tcr) add('tcr', [o.tcr]);
  var fl = [];
  for (var a in (o.flt || {})) if (o.flt.hasOwnProperty(a)) for (var i = 0; i < o.flt[a].length; i++) fl.push(a + '=' + o.flt[a][i]);
  add('flt', fl);
  add('mu', o.mu); add('lu', o.lu); add('kp', o.kp);
  var ids = [];
  for (var k = 0; k < ID_KEYS.length; k++) {
    var list = (o.id || {})[ID_KEYS[k]] || [];
    for (var j = 0; j < list.length; j++) ids.push(ID_KEYS[k] + '=' + list[j]);
  }
  add('id', ids);
  if (o.q) add('q', [o.q]);
  if (o.sort && o.sort !== 'master_id:asc') add('sort', [o.sort]);
  if (o.lim && +o.lim !== CFG.limits[0]) add('lim', [String(o.lim)]);
  if (o.pt && !(o.pt.length === 1 && o.pt[0] === 'r')) add('pt', o.pt);
  if (o.rq) add('rq', [o.rq]);
  return out;
}

// ---- таблица: значения, поиск, сортировка, группировка — из памяти ----
function cellRaw(row, key) { var i = ROWS.ci[key]; return i === undefined ? '' : (row[i] == null ? '' : row[i]); }
function blockVal(b, key) {
  if (key === 'alloc_count') return String(b.n);
  if (key === 'sum_alloc') {
    var s = 0, any = false;
    for (var r = b.i; r < b.i + b.n; r++) { var x = num(cellRaw(ROWS.rows[r], 'alloc')); if (x !== null) { s += x; any = true; } }
    return any ? String(Math.round(s * 10000) / 10000) : '';
  }
  return cellRaw(ROWS.rows[b.i], key);
}
function isMasked(v) { return v === CFG.mask; }
function keyType(k) { return inArr(CFG.numKeys, k) ? 'num' : (inArr(CFG.dateKeys, k) ? 'date' : 'text'); }
// Ключи сортировки считаются один раз на колонку; пустое и скрытое warden — всегда в конце.
function sortKeys(key) {
  var P = ROWS.prep, c = P['sk:' + key];
  if (c) return c;
  var bl = ROWS.blocks, out = new Array(bl.length), tp = keyType(key);
  for (var i = 0; i < bl.length; i++) {
    var v = isAllocKey(key) && !isVirtual(key) ? minAllocVal(bl[i], key, tp) : blockVal(bl[i], key);
    if (v === '' || isMasked(v)) out[i] = null;
    else if (tp === 'num') { var n = num(v); out[i] = n === null ? lower(v) : n; }
    else out[i] = tp === 'date' ? v : lower(v);
  }
  P['sk:' + key] = out;
  return out;
}
// У КП колонка строки аллокации сортирует сотрудника по первой (крупнейшей) аллокации.
function minAllocVal(b, key) { return cellRaw(ROWS.rows[b.i], key); }
function cmpKey(a, b) {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : 1;
}
// Текст блока для поиска — по показанным колонкам, один раз на набор колонок.
function blockText(cols) {
  var P = ROWS.prep, key = 'tx:' + cols.join(','), c = P[key];
  if (c) return c;
  var bl = ROWS.blocks, out = new Array(bl.length);
  for (var i = 0; i < bl.length; i++) {
    var parts = [];
    for (var r = bl[i].i; r < bl[i].i + bl[i].n; r++) {
      for (var k = 0; k < cols.length; k++) {
        if (r > bl[i].i && !isAllocKey(cols[k])) continue;
        parts.push(isVirtual(cols[k]) ? blockVal(bl[i], cols[k]) : cellRaw(ROWS.rows[r], cols[k]));
      }
    }
    out[i] = lower(parts.join('\u0001'));
  }
  P[key] = out;
  return out;
}
// Конвейер: поиск → сортировка → группировка → (страница — при сборке разметки). Результат
// запоминается: листание страниц и перерисовка не повторяют поиск и сортировку по 25 000 строк.
function viewRows() {
  if (!ROWS) return null;
  var cols = displayCols(), ck = [];
  for (var cg in state.collapsedGroups) if (state.collapsedGroups.hasOwnProperty(cg) && state.collapsedGroups[cg]) ck.push(cg);
  var vkey = [lower(trim(state.search)), state.sortKey, state.sortDir, state.groupBy.join(','), ck.sort().join('\u0002'), cols.join(',')].join('\u0003');
  if (ROWS.prep.view && ROWS.prep.view.key === vkey) return ROWS.prep.view.V;
  var V = viewCompute(cols);
  ROWS.prep.view = { key: vkey, V: V };
  return V;
}
function viewCompute(cols) {
  var bl = ROWS.blocks, idx = [], q = lower(trim(state.search));
  var tx = q ? blockText(cols.concat(state.groupBy)) : null;
  for (var i = 0; i < bl.length; i++) if (!q || tx[i].indexOf(q) > -1) idx.push(i);
  if (state.sortKey && (loaded(state.sortKey))) {
    var ks = sortKeys(state.sortKey), dir = state.sortDir === 'desc' ? -1 : 1;
    idx.sort(function (x, y) {
      var a = ks[x], b = ks[y];
      if (a === null && b === null) return x - y;
      if (a === null) return 1;
      if (b === null) return -1;
      return dir * cmpKey(a, b) || x - y;
    });
  }
  var V = { cols: cols, idx: idx, items: null, groups: 0 };
  if (state.groupBy.length) {
    var items = [], tree = {}, order = [];
    for (var j = 0; j < idx.length; j++) {
      var b = bl[idx[j]], path = [], node = { kids: tree, order: order };
      for (var g = 0; g < state.groupBy.length; g++) {
        var gv = blockVal(b, state.groupBy[g]);
        path.push(gv);
        var gk = path.join('\u0001');
        if (!node.kids[gk]) { node.kids[gk] = { key: gk, v: gv, lvl: g, n: 0, kids: {}, order: [], rows: [] }; node.order.push(gk); }
        node = node.kids[gk];
        node.n++;
      }
      node.rows.push(idx[j]);
    }
    var walk = function (kids, ord) {
      for (var o = 0; o < ord.length; o++) {
        var gn = kids[ord[o]];
        items.push({ g: gn });
        V.groups++;
        if (state.collapsedGroups[gn.key]) continue;
        if (gn.order.length) walk(gn.kids, gn.order);
        for (var rr = 0; rr < gn.rows.length; rr++) items.push({ b: gn.rows[rr], lvl: gn.lvl + 1 });
      }
    };
    walk(tree, order);
    V.items = items;
  }
  return V;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Тонкий пробел в разрядах, запятая в дроби.
var THIN = ' ', NBSP = ' ';
var MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtInt(v) {
  var n = num(v);
  if (n === null) return '—';
  var s = String(Math.round(Math.abs(n))), out = '';
  while (s.length > 3) { out = THIN + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '−' : '') + s + out;
}
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
// 'YYYY-MM-DD[ …]' → 'ДД.ММ.ГГГГ'; иное — как есть.
function fmtDate(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? m[3] + '.' + m[2] + '.' + m[1] : String(v == null ? '' : v);
}
function fmtDay(iso) {
  var p = toDate(iso);
  return p ? p.d + NBSP + MONTH_GEN[p.m] + ' ' + p.y : '';
}
function fmtDec(v) { return String(v).replace('.', ','); }
function fmtPct(v) { var n = num(v); return n === null ? '' : String(Math.round(n * 1000) / 10).replace('.', ',') + '%'; }
// Значение ячейки на экране.
function cellText(key, v) {
  if (v === '' || v == null) return '';
  if (inArr(CFG.dateKeys, key)) return fmtDate(v);
  if (key === 'alloc' || key === 'sum_alloc') return fmtPct(v);
  if (key === 'work_experience_year') return fmtDec(v);
  return String(v);
}
// Значение для «Копировать»: даты — ДД.ММ.ГГГГ, дроби — с запятой (Excel), скрытое — как в прежнем чарте.
function copyText(key, v) {
  if (isMasked(v)) return CFG.maskText;
  if (v === '' || v == null) return '';
  if (inArr(CFG.dateKeys, key)) return fmtDate(v);
  if (inArr(CFG.decimalKeys, key)) { var n = num(v); return n === null ? String(v) : fmtDec(String(n)); }
  return String(v);
}
// Значение фильтра словами: флаги — Да / Нет, пустое — «(пусто)», у рег. HR '-' — нет логина.
function valLabel(attr, v) {
  if (inArr(CFG.flagFacets, attr)) { if (v === '1') return 'Да'; if (v === '0') return 'Нет'; }
  if (attr === 'regional_hr_login' && v === '-') return '(не указан)';
  return v === '' ? '(пусто)' : v;
}
function tipHtml(o) {
  var P = CFG.ns;
  return (o.title ? '<span class="' + P + '-t-h">' + esc(o.title) + '</span>' : '')
    + (o.text ? '<span class="' + P + '-t-x">' + esc(o.text) + '</span>' : '')
    + (o.html || '')
    + (o.note ? '<span class="' + P + '-t-n">' + esc(o.note) + '</span>' : '');
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
// Подсветка найденного: сначала экранировать, потом подсветить (RETRO 35).
function hl(text, q) {
  var s = String(text == null ? '' : text);
  if (!q) return esc(s);
  var at = lower(s).indexOf(q);
  if (at < 0) return esc(s);
  return esc(s.slice(0, at)) + '<mark class="' + CFG.ns + '-hl">' + esc(s.slice(at, at + q.length)) + '</mark>' + hl(s.slice(at + q.length), q);
}
function cssColor(c) {
  if (!c) return '#000';
  if (typeof c === 'string') return c;
  var a = (c.length >= 4) ? c[3] : 1;
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- или с .<ns>-root - иначе стили
// протекут в интерфейс Proteus. НИКАКИХ голых div/table/th/button.
// Стили из макета переносятся СЮДА ЦЕЛИКОМ, а не выбрасываются.
// ЦЕЛИКОМ — кроме рамки самой демо-страницы: фон/отступы body, центрирование,
// фикс-ширина внешнего контейнера НЕ переносятся. Корень остаётся width:100% —
// виджет тянется за ячейкой дашборда (RETRO 48). Оконные @media и vw/vh
// в ячейке не работают: адаптив — от контейнера (RETRO 49, RECIPES.md
// «Рамка макета ≠ рамка виджета»).
function buildCSS() {
  // Профиль виджетов Proteus Adoption (как HRBP HUB): кегли — роли CFG.fonts, веса 400 / 500 / 600,
  // контролы 34 px, поповеры 9 px радиус, тултип 7/10. Таблица списка — плотная: строка 32.
  var P = '.' + CFG.ns, C = CFG.colors, F = CFG.fonts, S = CFG.spacing;
  var SH = '0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04)';
  var SHL = '0 8px 28px rgba(20,28,45,.16)';
  return [
    '<style>',
    P + '-root{position:relative;width:100%;height:100%;box-sizing:border-box;'
            + 'font-family:' + CFG.fonts.family + ';'
            + 'font-size:' + F.body + 'px;color:' + C.ink + ';background:' + C.bg + ';display:flex;flex-direction:column;min-height:560px;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',
    P + '-root b,' + P + '-root strong{font-weight:500;}',
    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    // Повторяем font-family и position:fixed явно, иначе будет другой шрифт.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;'
           + 'transition:opacity .08s;'
           + 'background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;'
           + 'box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);'
           + 'padding:7px 10px;font-size:' + F.note + 'px;line-height:1.4;color:' + C.ink2 + ';font-weight:400;'
           + 'max-width:320px;white-space:normal;word-wrap:break-word;}',
    P + '-tip b{font-weight:500;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:' + C.muted + ';margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:' + F.note + 'px;font-weight:400;color:' + C.ink2 + ';line-height:1.4;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:' + F.cap + 'px;line-height:1.35;font-weight:400;color:' + C.muted + ';margin-top:5px;}',

    // ---- шапка: имя, дата данных ----
    P + '-head{background:' + C.card + ';border-bottom:1px solid ' + C.line + ';flex:0 0 auto;}',
    P + '-htop{display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap;min-height:48px;}',
    P + '-logo{font-weight:600;font-size:' + F.title + 'px;white-space:nowrap;color:' + C.ink + ';}',
    P + '-logo small{color:' + C.muted + ';font-weight:400;font-size:' + F.note + 'px;margin-left:8px;}',
    P + '-sp{flex:1;}',
    P + '-badge{display:inline-flex;align-items:center;gap:6px;color:' + C.muted + ';font-weight:400;font-size:' + F.note + 'px;white-space:nowrap;}',
    P + '-badge b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-badge+' + P + '-badge{padding-left:10px;border-left:1px solid ' + C.line + ';}',
    // ---- полка фильтров слева (как нативные фильтры Proteus): разделы, фильтр — подпись и
    // выпадашка во всю ширину, «Применить» внизу всегда на виду; сворачивается в полоску ----
    P + '-body{flex:1 1 auto;min-height:0;display:flex;align-items:stretch;}',
    P + '-shelf{flex:0 0 ' + S.shelfW + 'px;width:' + S.shelfW + 'px;min-height:0;display:flex;flex-direction:column;background:' + C.card + ';border-right:1px solid ' + C.line + ';}',
    P + '-shh{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:12px 10px 10px 16px;border-bottom:1px solid ' + C.line2 + ';}',
    P + '-sht{flex:1;font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';display:flex;align-items:center;gap:8px;}',
    P + '-shl{flex:1 1 auto;min-height:0;overflow:auto;padding:0 16px 14px;}',
    P + '-shs{display:flex;align-items:center;gap:6px;margin:14px 0 2px;padding-top:12px;border-top:1px solid ' + C.line2 + ';font-size:' + F.cap + 'px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';cursor:pointer;user-select:none;}',
    P + '-shs:hover{color:' + C.ink2 + ';}',
    P + '-shs' + P + '-first{border-top:0;margin-top:4px;}',
    P + '-shs>span:first-of-type{flex:1;}',
    P + '-fi{margin-top:10px;}',
    P + '-fil{display:block;font-size:' + F.note + 'px;font-weight:500;color:' + C.ink2 + ';margin:0 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-shelf ' + P + '-dd{display:block;}',
    P + '-shelf ' + P + '-ddb{width:100%;max-width:none;}',
    P + '-shelf ' + P + '-ddv{flex:1;max-width:none;text-align:left;}',
    P + '-ph{color:' + C.muted2 + ';font-weight:400;}',
    P + '-shf{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;padding:10px 16px 12px;border-top:1px solid ' + C.line + ';background:' + C.card + ';}',
    P + '-shf ' + P + '-btn{justify-content:center;width:100%;}',
    P + '-shfr{display:flex;gap:6px;}',
    P + '-shfr ' + P + '-btn{flex:1 1 0;min-width:0;}',
    // свёрнутая полка: полоска с воронкой, числом фильтров и подписью
    P + '-shelf' + P + '-off{flex-basis:' + S.shelfOffW + 'px;width:' + S.shelfOffW + 'px;align-items:center;padding:10px 0;cursor:pointer;}',
    P + '-shelf' + P + '-off:hover{background:' + C.hover + ';}',
    P + '-sho{display:flex;flex-direction:column;align-items:center;gap:8px;border:0;background:transparent;color:' + C.ink2 + ';cursor:pointer;padding:4px 0;font-size:' + F.control + 'px;font-weight:500;}',
    P + '-sho:hover{color:' + C.act + ';}',
    P + '-shv{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;}',
    // поповер фильтра полки — в слое корня справа от полки (полка прокручивается и обрезала бы его)
    P + '-play{position:absolute;left:0;top:0;z-index:60;}',
    P + '-play>' + P + '-pop{position:static;}',
    P + '-dd{position:relative;display:inline-block;}',
    P + '-ddb{display:inline-flex;align-items:center;gap:6px;height:34px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:9px;padding:0 12px;font-size:' + F.control + 'px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;max-width:340px;}',
    P + '-ddb:hover{border-color:#d8dce4;}',
    P + '-ddb' + P + '-set{background:' + C.blueBg + ';color:' + C.blueTx + ';border-color:#dbe6fd;}',
    P + '-ddb' + P + '-on{border-color:' + C.act + ';}',
    // выбрано, но не применено: пунктир акцентом — ждёт «Применить»
    P + '-ddb' + P + '-chg{border-style:dashed;border-color:' + C.act + ';}',
    P + '-ddl{color:' + C.muted + ';font-weight:400;}',
    P + '-ddb' + P + '-set ' + P + '-ddl{color:#5b83dc;}',
    P + '-ddv{overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:220px;}',
    P + '-ddc{color:' + C.muted2 + ';font-size:10px;}',
    P + '-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(43,95,208,.14);color:' + C.blueTx + ';font-size:11px;line-height:1;cursor:pointer;flex:0 0 auto;}',
    P + '-x:hover{background:rgba(43,95,208,.3);}',
    P + '-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:' + C.act + ';color:#fff;font-size:10px;font-weight:500;}',

    // ---- поповеры ----
    P + '-pop{position:absolute;top:calc(100% + 4px);left:0;z-index:40;background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:9px;box-shadow:' + SHL + ';width:300px;padding:10px;cursor:default;text-align:left;outline:none;white-space:normal;}',
    P + '-pop' + P + '-wide{width:520px;}',
    P + '-pop' + P + '-rt{left:auto;right:0;}',
    P + '-poph{font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.4px;color:' + C.muted + ';font-weight:500;margin:2px 4px 8px;display:flex;align-items:center;gap:8px;min-height:22px;}',
    P + '-poph>span:first-child{flex:1;}',
    P + '-psearch{position:relative;display:block;margin:0 0 8px;color:' + C.muted + ';}',
    P + '-psearch svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-srch{display:block;width:100%;height:30px;border:1px solid ' + C.line + ';border-radius:999px;padding:0 12px 0 30px;font-size:13px;font-weight:400;color:' + C.ink + ';margin:0;background:' + C.card + ';}',
    P + '-srch:focus{outline:none;border-color:' + C.act + ';}',
    P + '-list{max-height:340px;overflow:auto;margin:0 -4px;padding:0 4px;}',
    P + '-opt{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:7px;cursor:pointer;font-size:' + F.control + 'px;font-weight:400;color:' + C.ink2 + ';}',
    P + '-opt:hover{background:#f4f6f9;color:' + C.ink + ';}',
    P + '-opt input{accent-color:' + C.blue + ';flex:0 0 auto;margin:0;cursor:pointer;}',
    P + '-opt' + P + '-cur{background:' + C.blueBg + ';color:' + C.blueTx + ';font-weight:500;}',
    P + '-opt' + P + '-zero{color:' + C.muted2 + ';}',
    P + '-optn{margin-left:auto;color:' + C.muted + ';font-size:' + F.note + 'px;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:8px;}',
    P + '-optt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-rd{display:inline-block;flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:1.5px solid ' + C.muted2 + ';}',
    P + '-opt' + P + '-cur ' + P + '-rd{border:4px solid ' + C.act + ';}',
    P + '-blk{font-size:' + F.cap + 'px;font-weight:500;color:' + C.muted + ';text-transform:uppercase;letter-spacing:.3px;margin:10px 9px 2px;}',
    P + '-popf{display:flex;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid ' + C.line2 + ';}',
    P + '-popf>span{flex:1;font-size:11px;color:' + C.muted + ';font-weight:400;line-height:1.35;}',
    P + '-nores{padding:14px 8px;color:' + C.muted + ';font-size:' + F.note + 'px;font-weight:400;text-align:center;line-height:1.45;}',
    P + '-muted{color:' + C.muted + ';font-weight:400;}',
    // мини-вкладки внутри поповера (22 в подложке 26)
    P + '-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.line2 + ';border-radius:9px;padding:2px;flex-wrap:wrap;}',
    P + '-segb{display:inline-flex;align-items:center;gap:5px;height:22px;border:0;background:transparent;padding:0 9px;border-radius:6px;font-weight:500;font-size:' + F.note + 'px;color:' + C.muted + ';cursor:pointer;text-transform:none;letter-spacing:0;white-space:nowrap;}',
    P + '-segb:hover{color:' + C.ink2 + ';}',
    P + '-segb' + P + '-on{background:' + C.card + ';color:' + C.ink + ';}',
    P + '-segb i{font-style:normal;color:' + C.act + ';}',
    // дерево структуры: строка — как пункт выпадашки, отступ по уровню
    P + '-tr{display:flex;align-items:center;gap:4px;padding:3px 9px 3px 0;border-radius:7px;font-size:' + F.control + 'px;font-weight:400;color:' + C.ink2 + ';}',
    P + '-tr:hover{background:#f4f6f9;color:' + C.ink + ';}',
    P + '-tr' + P + '-zero{color:' + C.muted2 + ';}',
    P + '-tw{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;background:transparent;color:' + C.muted + ';cursor:pointer;border-radius:6px;flex:0 0 auto;font-size:10px;line-height:1;padding:0;}',
    P + '-tw:hover{background:#eef1f5;color:' + C.ink + ';}',
    P + '-tsp{display:inline-block;width:22px;flex:0 0 auto;}',
    P + '-tl{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:3px 0;cursor:pointer;}',
    P + '-tl input{accent-color:' + C.blue + ';flex:0 0 auto;margin:0;cursor:pointer;}',
    P + '-tn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-tn' + P + '-wrap{white-space:normal;}',
    P + '-tc{color:' + C.muted + ';font-size:' + F.note + 'px;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:44px;text-align:right;}',
    P + '-tpath{display:block;color:' + C.muted + ';font-size:' + F.cap + 'px;font-weight:400;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tin{display:inline-block;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;padding:1px 5px;border-radius:4px;background:' + C.blueBg + ';color:' + C.blueTx + ';margin-left:6px;vertical-align:1px;white-space:nowrap;}',
    P + '-thint{color:' + C.act + ';font-size:' + F.note + 'px;padding:4px 9px 4px 0;}',
    // значения атрибута
    P + '-pop' + P + '-fpop{width:360px;}',
    // «Сотрудники»: вставка списка
    P + '-ta{display:block;width:100%;height:150px;resize:vertical;border:1px solid ' + C.line + ';border-radius:9px;padding:8px 10px;font-size:' + F.control + 'px;line-height:1.45;color:' + C.ink + ';font-family:ui-monospace,Menlo,Consolas,monospace;margin:8px 0 6px;}',
    P + '-ta:focus{outline:none;border-color:' + C.act + ';}',
    P + '-idinfo{font-size:' + F.note + 'px;color:' + C.muted + ';padding:0 2px;}',
    P + '-idinfo b{color:' + C.ink2 + ';}',
    // «Колонки»: группы сеткой, пресеты
    P + '-pop' + P + '-cpop{width:760px;}',
    P + '-cpt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}',
    P + '-cpt ' + P + '-psearch{flex:1 1 220px;margin:0;}',
    P + '-pre{display:inline-flex;align-items:center;height:26px;padding:0 10px;border:1px solid ' + C.line + ';border-radius:999px;background:' + C.card + ';font-size:' + F.note + 'px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;}',
    P + '-pre:hover{border-color:#cfdcfb;color:' + C.act + ';}',
    P + '-pre' + P + '-on{background:' + C.blueBg + ';border-color:#dbe6fd;color:' + C.blueTx + ';}',
    P + '-cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;max-height:430px;overflow:auto;}',
    P + '-cg{border:1px solid ' + C.line2 + ';border-radius:9px;padding:4px;min-width:0;}',
    P + '-cgh{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.3px;color:' + C.muted + ';font-weight:500;}',
    P + '-cgh label{display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;}',
    P + '-cgh input{accent-color:' + C.blue + ';margin:0;}',
    P + '-cg ' + P + '-opt{padding:4px 8px;}',
    P + '-opt input[disabled]{cursor:default;}',

    // ---- кнопки: 34 px, поля 0 12, радиус 9 ----
    P + '-btn{display:inline-flex;align-items:center;gap:6px;height:34px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:9px;padding:0 12px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;font-size:' + F.control + 'px;white-space:nowrap;}',
    P + '-btn:hover{background:' + C.hover + ';border-color:#d8dce4;}',
    P + '-btn' + P + '-pri{background:' + C.act + ';border-color:' + C.act + ';color:#fff;}',
    P + '-btn' + P + '-pri:hover{background:#1b5cf0;}',
    P + '-btn' + P + '-ghost{border-color:transparent;color:' + C.blue + ';background:transparent;}',
    P + '-btn' + P + '-ghost:hover{background:' + C.blueBg + ';}',
    P + '-btn' + P + '-ok{color:#11804a;border-color:#bfe6cf;}',
    P + '-popf ' + P + '-btn{height:28px;padding:0 10px;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    P + '-btn' + P + '-pri[disabled]:hover{background:' + C.act + ';}',
    P + '-lnk{color:' + C.act + ';cursor:pointer;font-weight:500;border:0;background:transparent;padding:0;font-size:inherit;text-transform:none;letter-spacing:0;}',
    P + '-lnk:hover{text-decoration:underline;}',
    P + '-ib{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border:1px solid ' + C.line + ';background:' + C.card + ';border-radius:7px;color:' + C.ink2 + ';cursor:pointer;padding:0 6px;font-size:13px;line-height:1;}',
    P + '-ib:hover{border-color:#cfdcfb;color:' + C.act + ';}',
    P + '-ib[disabled]{opacity:.4;cursor:default;}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid ' + C.muted2 + ';color:' + C.muted + ';font-size:9px;font-weight:600;font-style:normal;line-height:1;cursor:help;flex:0 0 auto;user-select:none;}',
    P + '-info:hover{border-color:' + C.act + ';color:' + C.act + ';}',

    // ---- уведомления и загрузка ----
    P + '-notes{flex:0 0 auto;}',
    P + '-note{font-size:' + F.note + 'px;color:' + C.ink2 + ';background:' + C.card + ';border:1px dashed ' + C.line + ';border-radius:9px;padding:10px 14px;margin-top:12px;line-height:1.5;}',
    P + '-note' + P + '-warn{border-style:solid;border-color:#f3d58f;background:#fff8e6;color:' + C.warnTx + ';}',
    P + '-load{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:' + F.note + 'px;font-weight:500;color:' + C.act + ';}',
    P + '-load i{flex:1;height:3px;border-radius:2px;background:linear-gradient(90deg,' + C.act + ',#9dbbff,' + C.act + ');opacity:.7;}',
    P + '-busy ' + P + '-tbox{opacity:.55;transition:opacity .2s;}',
    // под фильтрами больше, чем загружено: сузить фильтры или загрузить всех
    P + '-tnote{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid ' + C.line + ';background:' + C.blueBg + ';color:' + C.blueTx + ';font-size:' + F.note + 'px;line-height:1.45;}',
    P + '-tnote' + P + '-warn{background:#fff8e6;color:' + C.warnTx + ';}',

    // ---- таблица: панель во всю оставшуюся высоту, прокрутка внутри ----
    P + '-main{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;padding:0 16px 16px;}',
    P + '-tpan{flex:1 1 auto;min-height:380px;display:flex;flex-direction:column;background:' + C.card + ';border-radius:12px;box-shadow:' + SH + ';min-width:0;margin-top:12px;}',
    P + '-ttools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 12px 10px 16px;border-bottom:1px solid ' + C.line + ';}',
    P + '-tcount{font-size:' + F.body + 'px;color:' + C.ink2 + ';white-space:nowrap;}',
    P + '-tcount b{font-size:' + F.title + 'px;font-weight:600;color:' + C.ink + ';font-variant-numeric:tabular-nums;}',
    P + '-tsub{color:' + C.muted + ';font-size:' + F.note + 'px;white-space:normal;}',
    P + '-tsw{position:relative;display:inline-block;width:240px;color:' + C.muted + ';}',
    P + '-tsw svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-tsw ' + P + '-srch{height:34px;font-size:' + F.control + 'px;}',
    P + '-tbox{flex:1 1 auto;min-height:0;overflow:auto;position:relative;}',
    P + '-t{border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:' + F.body + 'px;font-variant-numeric:tabular-nums;}',
    P + '-t th{position:sticky;top:0;z-index:3;background:' + C.card + ';font-size:' + F.cap + 'px;text-transform:uppercase;letter-spacing:.3px;color:' + C.muted + ';font-weight:500;line-height:13px;text-align:left;padding:9px 8px;border-bottom:1px solid ' + C.line + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none;cursor:pointer;}',
    P + '-t th:hover{color:' + C.ink2 + ';}',
    P + '-t th' + P + '-son{color:' + C.ink2 + ';}',
    P + '-t th' + P + '-num,' + P + '-t td' + P + '-num{text-align:right;}',
    P + '-t td{padding:6px 8px;height:' + S.rowH + 'px;line-height:19px;color:' + C.ink2 + ';border-bottom:1px solid ' + C.line2 + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top;background:' + C.card + ';}',
    // Первая колонка (MasterID) закреплена при горизонтальной прокрутке; у КП в строках аллокаций
    // первая ячейка — уже не MasterID, поэтому по классу, а не :first-child.
    P + '-t th' + P + '-c0,' + P + '-t td' + P + '-c0{position:sticky;left:0;z-index:2;box-shadow:inset -1px 0 0 ' + C.line2 + ';}',
    P + '-t th' + P + '-c0{z-index:4;}',
    P + '-t td' + P + '-c0{color:' + C.ink + ';font-weight:500;}',
    P + '-t tbody:hover td{background:' + C.rowHover + ';}',
    P + '-t tbody' + P + '-bk td{border-top:0;}',
    P + '-t tr' + P + '-sub td{border-top:1px dashed ' + C.line2 + ';}',
    P + '-t tr' + P + '-g td{background:' + C.grp + ';color:' + C.ink + ';font-weight:500;cursor:pointer;height:30px;}',
    P + '-t tbody:hover tr' + P + '-g td{background:#eef1f8;}',
    P + '-gc{display:inline-block;width:14px;color:' + C.muted + ';font-size:10px;}',
    P + '-gl{color:' + C.muted + ';font-weight:400;margin-right:4px;}',
    P + '-gn{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:' + C.blueBg + ';color:' + C.blueTx + ';font-size:' + F.note + 'px;margin-left:8px;}',
    P + '-sa{color:' + C.act + ';margin-left:4px;font-size:11px;}',
    P + '-thl{overflow:hidden;text-overflow:ellipsis;}',
    P + '-rsz{position:absolute;top:0;right:0;width:8px;height:100%;cursor:col-resize;z-index:5;}',
    P + '-rsz:hover{background:rgba(43,108,255,.25);}',
    P + '-t th' + P + '-dragover{box-shadow:inset 3px 0 0 ' + C.act + ';}',
    P + '-t th' + P + '-dragsrc{opacity:.45;}',
    P + '-mask{color:' + C.muted2 + ';font-weight:400;}',
    P + '-hl{background:' + C.hl + ';color:' + C.actInk + ';border-radius:3px;padding:0 1px;}',
    P + '-a{color:' + C.act + ';text-decoration:none;font-weight:500;}',
    P + '-a:hover{text-decoration:underline;}',
    P + '-empty{padding:40px 24px;text-align:center;color:' + C.muted + ';font-size:' + F.body + 'px;line-height:1.5;}',
    P + '-empty b{display:block;color:' + C.ink + ';font-size:15px;font-weight:600;margin-bottom:8px;}',
    // ---- страницы ----
    P + '-pager{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px 8px 16px;border-top:1px solid ' + C.line + ';font-size:' + F.note + 'px;color:' + C.muted + ';}',
    P + '-pgi{color:' + C.ink2 + ';font-weight:500;font-variant-numeric:tabular-nums;margin:0 4px;white-space:nowrap;}',
    '</style>'
  ].join('');
}

var SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
var COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
function hSearch(kind, placeholder, value) {
  var P = CFG.ns;
  return '<label class="' + P + '-psearch">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-psearch="' + kind
    + '" placeholder="' + esc(placeholder) + '" value="' + esc(value == null ? state.q : value) + '"></label>';
}
function partPending(p) { return !!(state.pend && inArr(state.pend.pt, p)); }
// Кнопка-открыватель поповера: o = {key, label, value, set, chg, tip, clear}.
function ddButton(o) {
  var P = CFG.ns, open = state.open === o.key;
  return '<button class="' + P + '-ddb' + (o.set ? ' ' + P + '-set' : '') + (o.chg ? ' ' + P + '-chg' : '') + (open ? ' ' + P + '-on' : '')
    + '" data-action="open" data-pop="' + o.key + '" aria-haspopup="true" aria-expanded="' + (open ? 'true' : 'false') + '"'
    + (open || !o.tip ? '' : tip(o.tip)) + '>'
    + (o.label ? '<span class="' + P + '-ddl">' + esc(o.label) + '</span>' : '')
    + '<span class="' + P + '-ddv">' + (o.html || esc(o.value)) + '</span>'
    + (o.clear ? '<span class="' + P + '-x" role="button" tabindex="0" aria-label="Снять фильтр" data-action="chipx" data-key="' + o.clear + '">×</span>'
      : '<span class="' + P + '-ddc">▾</span>')
    + '</button>';
}
var NOTE_STAGE = 'Выбрано, но ещё не применено — кнопка «Применить».';
function perText(o) { return o.per === 'date' && o.dt ? 'На ' + fmtDate(o.dt) : 'Последний день' + (MODEL.m.data_dt ? ' · ' + fmtDate(MODEL.m.data_dt) : ''); }
function perPopHTML() {
  var P = CFG.ns, st = staged();
  return '<div class="' + P + '-pop" tabindex="-1"><div class="' + P + '-poph"><span>Период</span></div>'
    + '<div class="' + P + '-opt' + (st.per !== 'date' ? ' ' + P + '-cur' : '') + '" data-action="setper" data-key="last"><span class="' + P + '-rd"></span>'
    + '<span class="' + P + '-optt">Последний день</span><span class="' + P + '-optn">' + esc(fmtDate(MODEL.m.data_dt)) + '</span></div>'
    + '<div class="' + P + '-blk">На дату</div>'
    + (MODEL.dates.length > 8 ? hSearch('per', 'Дата, например 31.08') : '')
    + '<div class="' + P + '-list" data-plist="per">' + perListHTML() + '</div>'
    + '<div class="' + P + '-popf"><span>Применится кнопкой «Применить»</span></div></div>';
}
function perListHTML() {
  var P = CFG.ns, st = staged(), q = trim(state.q), s = '', n = 0;
  for (var i = 0; i < MODEL.dates.length; i++) {
    var d = MODEL.dates[i], t = fmtDate(d);
    if (q && t.indexOf(q) < 0 && d.indexOf(q) < 0) continue;
    n++;
    s += '<div class="' + P + '-opt' + (st.per === 'date' && st.dt === d ? ' ' + P + '-cur' : '') + '" data-action="setper" data-key="date" data-v="' + esc(d) + '">'
      + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + esc(t) + '</span></div>';
  }
  return n ? s : '<div class="' + P + '-nores">' + (MODEL.dates.length ? 'Такой даты нет' : 'Дат в справочнике нет') + '</div>';
}
// «Численность» и «Тип ЮЛ»: один вариант из списка.
function choicePopHTML(key) {
  var P = CFG.ns, cur = staged()[key] || '', list = key === 'emp' ? CFG.emp : [''].concat(CFG.tcr);
  var s = '<div class="' + P + '-pop" tabindex="-1"><div class="' + P + '-poph"><span>' + esc(key === 'emp' ? 'Численность' : 'Тип ЮЛ') + '</span></div>';
  for (var i = 0; i < list.length; i++) {
    s += '<div class="' + P + '-opt' + (list[i] === cur ? ' ' + P + '-cur' : '') + '" data-action="set1" data-key="' + key + '" data-v="' + esc(list[i]) + '">'
      + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + esc(list[i] || 'Все') + '</span></div>';
  }
  return s + '<div class="' + P + '-popf"><span>Применится кнопкой «Применить»</span></div></div>';
}
// Имя выбранного узла: из дерева, находок, подписей датасета (роль s) или запомненное при выборе.
function nodeName(tk, v) {
  if (tk === 'kp') { var ps = String(v).split('\x1f'); return ps[ps.length - 1]; }
  var T = MODEL.trees[tk];
  if (T && T.by && T.by[v]) return T.by[v].name;
  if (T) for (var i = 0; i < T.nodes.length; i++) if (T.nodes[i].id === v) return T.nodes[i].name;
  var c = state.cache.s[tk];
  if (c && c[v]) return c[v].name;
  if (state.names[tk + ':' + v]) return state.names[tk + ':' + v].name;
  return v;
}
function nodePath(tk, v) {
  if (tk === 'kp') return String(v).split('\x1f').join(' › ');
  var c = state.cache.s[tk], x = (c && c[v]) || state.names[tk + ':' + v];
  return x && x.path ? x.path + ' › ' + nodeName(tk, v) : nodeName(tk, v);
}
function treeDef(tk) { for (var i = 0; i < CFG.trees.length; i++) if (CFG.trees[i].key === tk) return CFG.trees[i]; return CFG.trees[0]; }
function isTreeKey(k) { return k === 'mu' || k === 'lu' || k === 'kp'; }
// Открытый поповер полки: дерево структуры или атрибут ('f:<атрибут>').
function openTree() { return isTreeKey(state.open) ? state.open : ''; }
function openAttr() {
  var o = String(state.open || '');
  return o.indexOf('f:') === 0 && CFG.facetLabels.hasOwnProperty(o.slice(2)) ? o.slice(2) : '';
}

// ---- полка фильтров: разделы, у фильтра — подпись и выпадашка во всю ширину ----
// Значения и деревья грузятся, когда фильтр открывают; выбор копится до «Применить».
function shelfKey(k) { return k === 'per' || k === 'ids' || k === 'emp' || k === 'tcr' || isTreeKey(k) ? k : 'f:' + k; }
function shortList(list) { return list.length ? list[0] + (list.length > 1 ? ' +' + (list.length - 1) : '') : ''; }
// Фильтр задан (в набранном) — для числа на полке и в свёрнутом разделе.
function shelfSet(st, k) {
  if (k === 'per') return st.per === 'date';
  if (k === 'emp') return (st.emp || CFG.emp[0]) !== CFG.emp[0];
  if (k === 'tcr') return !!st.tcr;
  if (k === 'ids') return idCount(st) > 0;
  if (isTreeKey(k)) return (st[k] || []).length > 0;
  return ((st.flt || {})[k] || []).length > 0;
}
function shelfCount(st) {
  var n = 0;
  for (var g = 0; g < CFG.shelf.length; g++) for (var i = 0; i < CFG.shelf[g].keys.length; i++) if (shelfSet(st, CFG.shelf[g].keys[i])) n++;
  return n;
}
function ctlHTML(o) {
  var P = CFG.ns;
  return '<div class="' + P + '-fi"><span class="' + P + '-fil">' + esc(o.label) + '</span><div class="' + P + '-dd" data-scope="' + esc(o.key) + '">'
    + ddButton({ key: o.key, value: o.value, html: o.ph ? '<span class="' + P + '-ph">' + esc(o.value) + '</span>' : '', set: o.set, chg: o.chg,
      clear: o.set ? o.clear : '', tip: o.tip }) + '</div></div>';
}
function shelfCtl(k, st, dk) {
  var note = '';
  if (k === 'per') {
    note = inArr(dk, 'per') ? NOTE_STAGE : '';
    return ctlHTML({ key: 'per', label: 'Период', value: perText(st), set: st.per === 'date', chg: !!note, clear: 'per',
      tip: { title: 'Период', text: st.per === 'date' ? 'Сотрудники на ' + fmtDate(st.dt) + ' — по таблице на выбранную дату.'
        : 'Сотрудники на последний день данных (' + fmtDate(MODEL.m.data_dt) + ').', note: note } });
  }
  if (k === 'emp' || k === 'tcr') {
    note = inArr(dk, k) ? NOTE_STAGE : '';
    var cur = st[k] || '', set = shelfSet(st, k);
    return ctlHTML({ key: k, label: k === 'emp' ? 'Численность' : 'Тип ЮЛ', value: k === 'emp' ? (cur || CFG.emp[0]) : (cur || 'Все'), ph: k === 'tcr' && !cur,
      set: set, chg: !!note, clear: k, tip: { title: k === 'emp' ? 'Численность' : 'Тип ЮЛ',
        text: k === 'emp' ? 'Юридическая — по юрлицу; активная — по активной численности.' : 'Только сотрудники ТЦР выбранного типа.', note: note } });
  }
  if (k === 'ids') {
    note = inArr(dk, 'id') ? NOTE_STAGE : '';
    var parts = [];
    for (var i = 0; i < CFG.idKinds.length; i++) {
      var c = ((st.id || {})[CFG.idKinds[i].key] || []).length;
      if (c) parts.push(CFG.idKinds[i].label + ' · ' + fmtInt(c));
    }
    return ctlHTML({ key: 'ids', label: 'Сотрудники по списку', value: parts.length ? parts.join(', ') : 'MasterID, логин, табельный, Siebel ID',
      ph: !parts.length, set: parts.length > 0, chg: !!note, clear: 'id',
      tip: { title: 'Сотрудники по списку', text: 'MasterID, логины, табельные или Siebel ID — вставкой списка.', note: note } });
  }
  if (isTreeKey(k)) {
    var d = treeDef(k), sel = st[k] || [], nm = [], pt = [];
    note = inArr(dk, k) ? NOTE_STAGE : '';
    for (var j = 0; j < sel.length; j++) { nm.push(nodeName(k, sel[j])); if (pt.length < 8) pt.push(nodePath(k, sel[j])); }
    return ctlHTML({ key: k, label: d.label, value: sel.length ? shortList(nm) : 'Вся структура', ph: !sel.length, set: sel.length > 0, chg: !!note, clear: k,
      tip: { title: d.name, text: sel.length ? pt.join('; ') + (sel.length > pt.length ? '; …' : '') : 'Дерево всех уровней и поиск юнита по названию.',
        note: note || 'Сотрудник попадает в список, если его юнит внутри выбранного (любого из отмеченных).' } });
  }
  var vals = (st.flt || {})[k] || [], lb = [];
  note = inArr(dk, 'flt:' + k) ? NOTE_STAGE : '';
  for (var v = 0; v < vals.length; v++) lb.push(valLabel(k, vals[v]));
  return ctlHTML({ key: 'f:' + k, label: CFG.facetLabels[k] || k, value: vals.length ? shortList(lb) : 'Все', ph: !vals.length, set: vals.length > 0,
    chg: !!note, clear: 'flt:' + k, tip: vals.length || note ? { title: CFG.facetLabels[k] || k, text: lb.slice(0, 30).join(', ') + (lb.length > 30 ? '…' : ''), note: note } : null });
}
// Список полки: разделы можно свернуть; у раздела — число заданных в нём фильтров.
function shelfListHTML() {
  var P = CFG.ns, st = staged(), dk = diffKeys(applied(), st), s = '';
  for (var g = 0; g < CFG.shelf.length; g++) {
    var sec = CFG.shelf[g], fold = !!state.shelfFold[g], n = 0;
    for (var i = 0; i < sec.keys.length; i++) if (shelfSet(st, sec.keys[i])) n++;
    s += '<div class="' + P + '-shs' + (g ? '' : ' ' + P + '-first') + '" role="button" tabindex="0" data-action="sfold" data-key="' + g + '" aria-expanded="' + (fold ? 'false' : 'true') + '">'
      + '<span>' + esc(sec.name) + '</span>' + (n ? '<span class="' + P + '-cnt">' + n + '</span>' : '') + '<span class="' + P + '-ddc">' + (fold ? '▸' : '▾') + '</span></div>';
    if (fold) continue;
    for (var j = 0; j < sec.keys.length; j++) s += shelfCtl(sec.keys[j], st, dk);
  }
  return s;
}
function applyBoxHTML() {
  var P = CFG.ns, n = stageDiff(), s = '';
  s += '<button class="' + P + '-btn ' + P + '-pri" data-action="apply"' + (n && !state.pend ? '' : ' disabled')
    + tip({ title: 'Применить фильтры', text: n ? 'Изменено фильтров: ' + n + '. Список пересчитается одним запросом.' : 'Выберите значения фильтров — они применятся все сразу.' })
    + '>' + (state.pend && state.pend.kind === 'apply' ? 'Применяю…' : 'Применить' + (n ? ' · ' + n : '')) + '</button>';
  if (n || anyFilter(applied())) {
    s += '<div class="' + P + '-shfr">'
      + (n ? '<button class="' + P + '-btn ' + P + '-ghost" data-action="unstage"' + tip({ title: 'Отменить', text: 'Вернуть фильтры, которые применены сейчас.' }) + '>Отменить</button>' : '')
      + (anyFilter(applied()) || n ? '<button class="' + P + '-btn ' + P + '-ghost" data-action="reset"'
        + tip({ title: 'Сбросить все', text: 'Снять все фильтры сразу, без «Применить». Колонки, сортировка и лимит остаются.' }) + '>Сбросить все</button>' : '')
      + '</div>';
  }
  return s;
}
var FUNNEL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
function shelfHTML() {
  var P = CFG.ns, n = shelfCount(applied()), chg = stageDiff();
  if (state.shelfOff) {
    return '<div class="' + P + '-shelf ' + P + '-off" data-shelf="1" data-action="shelf"' + tip({ title: 'Фильтры', text: n ? 'Применено фильтров: ' + n + '. Нажмите, чтобы открыть полку.' : 'Нажмите, чтобы открыть полку фильтров.' }) + '>'
      + '<button class="' + P + '-sho" aria-label="Показать фильтры" aria-expanded="false">' + FUNNEL_SVG
      + (n ? '<span class="' + P + '-cnt">' + n + '</span>' : '') + '<span class="' + P + '-shv">Фильтры' + (chg ? ' · не применено' : '') + '</span></button></div>';
  }
  return '<div class="' + P + '-shelf" data-shelf="1"><div class="' + P + '-shh"><span class="' + P + '-sht">Фильтры'
    + (n ? '<span class="' + P + '-cnt">' + n + '</span>' : '') + '</span>'
    + '<button class="' + P + '-ib" data-action="shelf" aria-label="Свернуть фильтры" aria-expanded="true"' + tip({ title: 'Свернуть', text: 'Спрятать полку фильтров — таблице больше места.' }) + '>«</button></div>'
    + '<div class="' + P + '-shl" data-shelfl="1">' + shelfListHTML() + '</div>'
    + '<div class="' + P + '-shf" data-abox="1">' + applyBoxHTML() + '</div></div>';
}
// Поповер фильтра полки — в слое корня: полка прокручивается и обрезала бы его. Место задаёт placePop.
function layerHTML() {
  var P = CFG.ns, o = state.open, pop = '';
  if (o === 'per') pop = perPopHTML();
  else if (o === 'emp' || o === 'tcr') pop = choicePopHTML(o);
  else if (openTree()) pop = structPopHTML(o);
  else if (openAttr()) pop = fltPopHTML(openAttr());
  else if (o === 'ids') pop = idsPopHTML();
  return pop ? '<div class="' + P + '-play" data-play="1" data-scope="' + esc(o) + '">' + pop + '</div>' : '';
}
function headHTML() {
  var P = CFG.ns, m = MODEL.m, s = '<div class="' + P + '-head">';
  s += '<div class="' + P + '-htop"><span class="' + P + '-logo">' + esc(CFG.title[MODE]) + '<small>' + esc(CFG.sub[MODE]) + '</small></span>';
  if (m.data_dt) s += '<span class="' + P + '-badge"' + tip({ title: 'Данные', text: 'Последний день в таблице списка: ' + fmtDay(m.data_dt) + '.' }) + '>Данные на <b>' + esc(fmtDay(m.data_dt)) + '</b></span>';
  if (m.first_nm) s += '<span class="' + P + '-badge">Привет, <b>' + esc(m.first_nm) + '</b></span>';
  s += '<span class="' + P + '-sp"></span><span class="' + P + '-info"' + tip({ title: 'Как работать',
    text: 'Фильтры — на полке слева: выбор копится и уходит одной кнопкой «Применить». В таблицу приходят первые сотрудники под фильтрами (5 000, можно до 25 000) сразу со всеми колонками — колонки, страницы, поиск по таблице, группировка и «Копировать» работают без запроса.',
    note: 'Под фильтрами больше 25 000 — сузьте фильтры, чтобы загрузились все. Значения фильтров и структура загружаются, когда их открывают.' }) + '>i</span></div>';
  return s + '</div>';
}
function noticesHTML() {
  var P = CFG.ns, s = '', pk = state.pend ? state.pend.kind : '';
  if (state.pend && pk !== 'search' && pk !== 'part' && pk !== 'kids') {
    s += '<div class="' + P + '-load"><span>' + esc(pk === 'rows' ? 'Загружаю строки…' : CFG.text.loading) + '</span><i></i></div>';
  }
  if (state.warn) s += '<div class="' + P + '-note ' + P + '-warn">' + esc(state.warn) + '</div>';
  if (MODEL.m && !MODEL.ok) s += '<div class="' + P + '-note ' + P + '-warn">' + esc(CFG.text.noAccess) + '</div>';
  return s ? '<div class="' + P + '-notes">' + s + '</div>' : '';
}

// ---- Структуры УС / ЮС / КП: дерево всех уровней, поиск на любом уровне ----
function treeKey() { return openTree() || (MODE === 'kp' ? 'kp' : 'mu'); }
function treeOf(tk) {
  var c = MODEL.trees[tk];
  if (!c) return null;
  if (!c.by) {
    var by = {}, kids = {}, roots = [], all = c.nodes.slice(), byPath = {};
    for (var p in c.extra) if (c.extra.hasOwnProperty(p)) all = all.concat(c.extra[p]);
    for (var i = 0; i < all.length; i++) if (!by[all[i].id]) { by[all[i].id] = all[i]; if (all[i].path) byPath[all[i].path] = all[i].id; }
    for (var id in by) {
      if (!by.hasOwnProperty(id)) continue;
      var x = by[id];
      if (!x.pid) roots.push(id);
      else if (by[x.pid]) (kids[x.pid] || (kids[x.pid] = [])).push(id);
    }
    var byName = function (a, b) { return String(by[a].name).localeCompare(String(by[b].name), 'ru'); };
    roots.sort(byName);
    for (var kk in kids) if (kids.hasOwnProperty(kk)) kids[kk].sort(byName);
    c.by = by; c.kids = kids; c.roots = roots; c.byPath = byPath;
    c.total = c.nodes.length ? (c.nodes[0].nodes || c.nodes.length) : 0;
    c.full = c.nodes.length >= c.total;
  }
  return c;
}
function nodeVal(tk, x) { return tk === 'kp' ? x.path : x.id; }
function selMap(tk) { var s = {}, l = staged()[tk] || []; for (var i = 0; i < l.length; i++) s[l[i]] = 1; return s; }
// Выбран предок узла — узел «в выбранном» (у КП — по префиксам пути, дерево может быть неполным).
function underSel(tk, T, x, S) {
  if (tk === 'kp') {
    var ps = String(x.path).split('\x1f');
    for (var i = 1; i < ps.length; i++) if (S[ps.slice(0, i).join('\x1f')]) return true;
    return false;
  }
  var p = x.pid, guard = 0;
  while (p && T.by[p] && guard++ < 16) { if (S[p]) return true; p = T.by[p].pid; }
  return false;
}
// Предки выбранных — раскрыты по умолчанию.
function selAnc(tk, T) {
  var out = {}, l = staged()[tk] || [];
  for (var i = 0; i < l.length; i++) {
    if (tk === 'kp') {
      var ps = String(l[i]).split('\x1f');
      for (var j = 1; j < ps.length; j++) { var id = T.byPath[ps.slice(0, j).join('\x1f')]; if (id) out[id] = 1; }
    } else {
      var x = T.by[l[i]], guard = 0;
      while (x && x.pid && guard++ < 16) { out[x.pid] = 1; x = T.by[x.pid]; }
    }
  }
  return out;
}
function tIsOpen(tk, T, id, depth, anc) {
  var k = tk + ':' + id;
  if (state.treeOpen.hasOwnProperty(k)) return !!state.treeOpen[k];
  return !!anc[id] || (depth === 0 && T.roots.length === 1);
}
function kidsPending(tk, x) { return !!(state.pend && state.pend.kind === 'kids' && state.pend.node === tk + ':' + x.id); }
function treeRowHTML(tk, x, depth, on, inSel, open, canOpen, q, withPath) {
  var P = CFG.ns, path = '';
  if (withPath) {
    var pp = tk === 'kp' ? String(x.path).split('\x1f').slice(0, -1).join(' › ') : x.path;
    if (pp) path = '<span class="' + P + '-tpath">' + esc(pp) + '</span>';
  }
  return '<div class="' + P + '-tr' + (x.n ? '' : ' ' + P + '-zero') + '" style="padding-left:' + (depth * 16) + 'px">'
    + (canOpen ? '<button class="' + P + '-tw" data-action="tw" data-key="' + tk + '" data-id="' + esc(x.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + (open ? '▾' : '▸') + '</button>' : '<span class="' + P + '-tsp"></span>')
    + '<label class="' + P + '-tl"><input type="checkbox" data-tsel="' + tk + '" data-tid="' + esc(x.id) + '"' + (on || inSel ? ' checked' : '') + (inSel ? ' disabled' : '') + '>'
    + '<span class="' + P + '-tn' + (withPath ? ' ' + P + '-wrap' : '') + '">' + hl(x.name, q) + (inSel ? '<span class="' + P + '-tin">в выбранном</span>' : '') + path + '</span>'
    + '<span class="' + P + '-tc">' + fmtInt(x.n) + '</span></label></div>';
}
function treeRows(tk, T, id, depth, S, anc, out) {
  if (out.n >= CFG.treeRowsMax) { out.cut = true; return; }
  var P = CFG.ns, x = T.by[id];
  if (!x) return;
  out.n++;
  var kids = T.kids[id] || [], canOpen = kids.length > 0 || x.hk, open = canOpen && tIsOpen(tk, T, id, depth, anc);
  var inSel = out.inSel || underSel(tk, T, x, S), on = !!S[nodeVal(tk, x)];
  out.s += treeRowHTML(tk, x, depth, on, inSel && !on, open, canOpen, '', false);
  if (!open) return;
  if (!kids.length) {
    out.s += '<div class="' + P + '-thint" style="padding-left:' + ((depth + 1) * 16 + 22) + 'px">'
      + (kidsPending(tk, x) ? 'Загружаю подразделения…' : '<button class="' + P + '-lnk" data-action="tkids" data-key="' + tk + '" data-id="' + esc(x.id) + '">Показать подразделения</button>')
      + '</div>';
    return;
  }
  var was = out.inSel;
  out.inSel = inSel || on;
  for (var i = 0; i < kids.length; i++) treeRows(tk, T, kids[i], depth + 1, S, anc, out);
  out.inSel = was;
}
// Находки: у полного дерева — поиск по загруженному; у большого — находки датасета (q).
function treeHits(tk, T, q) {
  var hits = [];
  if (T.full) {
    for (var id in T.by) {
      if (!T.by.hasOwnProperty(id)) continue;
      var x = T.by[id], at = lower(x.name).indexOf(q);
      if (at < 0) continue;
      hits.push({ x: x, r: (at === 0 ? 0 : 1) * 1e9 - x.n });
    }
    hits.sort(function (a, b) { return a.r - b.r; });
    var out = [];
    for (var i = 0; i < hits.length && i < 150; i++) {
      var h = hits[i].x, chain = [], p = h.pid, guard = 0;
      while (p && T.by[p] && guard++ < 16) { chain.unshift(T.by[p].name); p = T.by[p].pid; }
      out.push({ id: h.id, name: h.name, n: h.n, pid: h.pid, lvl: h.lvl, path: tk === 'kp' ? h.path : chain.join(' › '), hk: h.hk });
    }
    return { list: out, more: hits.length > 150 };
  }
  return null;
}
function searchEcho(prefix) {
  var e = MODEL.qEcho;
  return e.indexOf(prefix) === 0 && lower(e.slice(prefix.length)) === lower(trim(state.q)).slice(0, 60);
}
function treeListHTML() {
  var P = CFG.ns, tk = treeKey(), T = treeOf(tk), q = lower(trim(state.q)), S = selMap(tk);
  if (!T) {
    return '<div class="' + P + '-nores">' + (partPending(tk) ? 'Загружаю структуру…'
      : 'Структура не загружена. <button class="' + P + '-lnk" data-action="loadpart" data-key="' + tk + '">Загрузить</button>') + '</div>';
  }
  if (q && q.length >= CFG.searchMin) {
    var loc = treeHits(tk, T, q), list, more = false;
    if (loc) { list = loc.list; more = loc.more; }
    else if (searchEcho(tk + '=')) list = MODEL.q;
    else return '<div class="' + P + '-nores">Ищу «' + esc(trim(state.q)) + '» по всей структуре…</div>';
    if (!list.length) return '<div class="' + P + '-nores">Ничего не найдено</div>';
    var s = '';
    for (var i = 0; i < list.length; i++) {
      var x = list[i], on = !!S[nodeVal(tk, x)];
      s += treeRowHTML(tk, x, 0, on, !on && underSel(tk, T, x, S), false, false, q, true);
    }
    if (more || list.length >= +(MODEL.m.search_top || 60)) s += '<div class="' + P + '-nores">Показаны первые ' + list.length + ' — уточните запрос</div>';
    return s;
  }
  if (q) return '<div class="' + P + '-nores">Введите от ' + CFG.searchMin + ' букв</div>';
  if (!T.roots.length) return '<div class="' + P + '-nores">В выбранном под фильтрами юнитов нет</div>';
  var anc = selAnc(tk, T), out = { s: '', n: 0, cut: false, inSel: false };
  for (var r = 0; r < T.roots.length; r++) treeRows(tk, T, T.roots[r], 0, S, anc, out);
  if (out.cut) out.s += '<div class="' + P + '-nores">Показаны первые ' + CFG.treeRowsMax + ' строк — найдите юнит поиском</div>';
  return out.s;
}
function treeCountText(tk) {
  var n = (staged()[tk] || []).length, d = treeDef(tk);
  return (n ? 'Выбрано: ' + n + ' из ' + d.max : 'Ничего не выбрано — вся структура') + ' · применится кнопкой «Применить»';
}
function structPopHTML(tk) {
  var P = CFG.ns, st = staged(), T = treeOf(tk), s = '<div class="' + P + '-pop ' + P + '-wide" tabindex="-1">';
  s += '<div class="' + P + '-poph"><span>' + esc(treeDef(tk).name) + '</span>'
    + (T ? '<span class="' + P + '-muted">' + fmtInt(T.total) + ' ' + plural(T.total, 'юнит', 'юнита', 'юнитов') + '</span>' : '') + '</div>';
  s += hSearch('struct', T && !T.full ? 'Поиск юнита по всей структуре (от 2 букв)' : 'Поиск юнита по названию');
  s += '<div class="' + P + '-list" data-plist="struct">' + treeListHTML() + '</div>';
  s += '<div class="' + P + '-popf"><span data-pcount="1">' + treeCountText(tk) + '</span>'
    + ((st[tk] || []).length ? '<button class="' + P + '-btn ' + P + '-ghost" data-action="tclear" data-key="' + tk + '">Очистить</button>' : '') + '</div>';
  return s + '</div>';
}

// ---- Атрибуты: значения со счётчиками при остальных фильтрах, поиск ----
function fltAttr() { return openAttr() || CFG.shelf[0].keys[3]; }
function facetVals(attr) {
  var fc = MODEL.facets, list = fc ? (fc.vals[attr] || []) : [], out = [], seen = {};
  for (var i = 0; i < list.length; i++) { out.push(list[i]); seen['~' + list[i].v] = 1; }
  var sel = staged().flt[attr] || [];
  for (var j = 0; j < sel.length; j++) if (!seen['~' + sel[j]]) out.push({ v: sel[j], n: null, all: null });
  // Нули — значения, которых нет при остальных фильтрах: серым и в конце (вместо каскадов).
  out.sort(function (a, b) {
    var za = !a.n, zb = !b.n;
    if (za !== zb) return za ? 1 : -1;
    return (b.n || 0) - (a.n || 0) || (a.v < b.v ? -1 : (a.v > b.v ? 1 : 0));
  });
  return out;
}
function fltCountText(attr) {
  var n = (staged().flt[attr] || []).length;
  return (n ? 'Выбрано: ' + n : 'Все значения') + ' · применится кнопкой «Применить»';
}
function fltValsHTML(attr) {
  var P = CFG.ns, fc = MODEL.facets;
  if (!fc) {
    return '<div class="' + P + '-nores">' + (partPending('f') ? 'Загружаю значения фильтров…'
      : 'Значения не загружены. <button class="' + P + '-lnk" data-action="loadpart" data-key="f">Загрузить</button>') + '</div>';
  }
  var q = lower(trim(state.q)), sel = staged().flt[attr] || [], nv = fc.nv[attr] || 0, got = (fc.vals[attr] || []).length;
  var remote = q.length >= CFG.searchMin && nv > got, list = facetVals(attr), s = '', n = 0;
  if (remote) {
    if (!searchEcho('f:' + attr + '=')) return '<div class="' + P + '-nores">Ищу «' + esc(trim(state.q)) + '» среди ' + fmtInt(nv) + ' значений…</div>';
    list = MODEL.fq[attr] || [];
  }
  for (var i = 0; i < list.length; i++) {
    var v = list[i].v, lb = valLabel(attr, v);
    if (q && !remote && lower(lb).indexOf(q) < 0 && lower(v).indexOf(q) < 0) continue;
    n++;
    s += '<label class="' + P + '-opt' + (list[i].n === 0 ? ' ' + P + '-zero' : '') + '"><input type="checkbox" data-fk="' + attr + '" data-fv="' + esc(v) + '"'
      + (inArr(sel, v) ? ' checked' : '') + '><span class="' + P + '-optt">' + hl(lb, q) + '</span>'
      + '<span class="' + P + '-optn">' + (list[i].n === null ? '' : fmtInt(list[i].n)) + '</span></label>';
  }
  if (!n) return '<div class="' + P + '-nores">' + (list.length ? 'Ничего не найдено' : 'Значений нет') + '</div>';
  if (!q && nv > got) s += '<div class="' + P + '-nores">Показаны ' + fmtInt(got) + ' из ' + fmtInt(nv) + ' значений — остальные найдёт поиск</div>';
  return s;
}
function fltPopHTML(cur) {
  var P = CFG.ns, fc = MODEL.facets, nv = fc ? (fc.nv[cur] || 0) : 0;
  return '<div class="' + P + '-pop ' + P + '-fpop" tabindex="-1"><div class="' + P + '-poph"><span>' + esc(CFG.facetLabels[cur]) + '</span>'
    + (fc ? '<span class="' + P + '-muted">' + fmtInt(nv) + ' ' + plural(nv, 'значение', 'значения', 'значений') + '</span>' : '') + '</div>'
    + hSearch('flt', 'Поиск значения')
    + '<div class="' + P + '-list" data-plist="flt">' + fltValsHTML(cur) + '</div>'
    + '<div class="' + P + '-popf"><span data-pcount="1">' + fltCountText(cur) + '</span>'
    + ((staged().flt[cur] || []).length ? '<button class="' + P + '-btn ' + P + '-ghost" data-action="fclear" data-key="' + cur + '">Очистить</button>' : '') + '</div></div>';
}

// ---- «Сотрудники»: списки MasterID / логинов / табельных / Siebel ID ----
function idKind() { return inArr(ID_KEYS, state.idKind) ? state.idKind : 'rk'; }
function parseIds(kind, text) {
  var parts = String(text || '').split(/[\s,;]+/), out = [], bad = 0, seen = {};
  for (var i = 0; i < parts.length; i++) {
    var x = trim(parts[i]);
    if (!x) continue;
    if (kind === 'login') x = x.toLowerCase();
    if (kind === 'rk' && !/^\d+$/.test(x)) { bad++; continue; }
    if (!seen['~' + x]) { seen['~' + x] = 1; out.push(x); }
  }
  return { list: out, bad: bad };
}
function idInfoHTML() {
  var st = staged(), kind = idKind(), n = (st.id[kind] || []).length, all = idCount(st), d = CFG.idKinds[ID_KEYS.indexOf(kind)];
  return 'В списке: <b>' + fmtInt(n) + '</b>' + (state.idBad ? ' · не распознано: ' + state.idBad + ' (' + esc(d.hint) + ')' : ' · ' + esc(d.hint))
    + (all > CFG.maxIds ? ' · <b>всего больше ' + fmtInt(CFG.maxIds) + ' — лишние отброшены</b>' : '');
}
function idsPopHTML() {
  var P = CFG.ns, st = staged(), kind = idKind(), s = '<div class="' + P + '-pop ' + P + '-wide" tabindex="-1">';
  s += '<div class="' + P + '-poph"><span>Сотрудники по списку</span><span class="' + P + '-seg">';
  for (var i = 0; i < CFG.idKinds.length; i++) {
    var d = CFG.idKinds[i], n = (st.id[d.key] || []).length;
    s += '<button class="' + P + '-segb' + (d.key === kind ? ' ' + P + '-on' : '') + '" data-action="idk" data-key="' + d.key + '" role="tab" aria-selected="' + (d.key === kind ? 'true' : 'false') + '">'
      + esc(d.label) + (n ? '<i>' + n + '</i>' : '') + '</button>';
  }
  s += '</span></div>';
  s += '<textarea class="' + P + '-ta" data-ids="' + kind + '" spellcheck="false" placeholder="Вставьте ' + esc(CFG.idKinds[ID_KEYS.indexOf(kind)].label)
    + ' — по одному в строке, через запятую или пробел">' + esc((st.id[kind] || []).join('\n')) + '</textarea>';
  s += '<div class="' + P + '-idinfo" data-idinfo="1">' + idInfoHTML() + '</div>';
  s += '<div class="' + P + '-popf"><span>Сотрудник попадёт в список, если совпал хотя бы с одним значением. Применится кнопкой «Применить».</span>'
    + '<button class="' + P + '-btn ' + P + '-ghost" data-action="idclear" data-key="' + kind + '">Очистить</button></div>';
  return s + '</div>';
}

// ---- таблица: итог, лимит, поиск, колонки, группировка, «Копировать» ----
function sortNow() {
  if (state.sortKey) return { key: state.sortKey, dir: state.sortDir || 'asc', local: true };
  var p = String(applied().sort || 'master_id:asc').split(':');
  return { key: p[0], dir: p[1] === 'desc' ? 'desc' : 'asc', local: false };
}
function limDDHTML() {
  var P = CFG.ns, ap = applied(), s = '<div class="' + P + '-dd" data-scope="lim">' + ddButton({ key: 'lim', label: 'Загружать:', value: fmtInt(ap.lim),
    tip: { title: 'Сколько сотрудников загружать', text: 'Первые сотрудники под фильтрами в текущей сортировке. Больше строк — дольше загрузка; «Копировать» берёт все загруженные.' } });
  if (state.open === 'lim') {
    s += '<div class="' + P + '-pop" tabindex="-1"><div class="' + P + '-poph"><span>Загружать сотрудников</span></div>';
    for (var i = 0; i < CFG.limits.length; i++) {
      s += '<div class="' + P + '-opt' + (CFG.limits[i] === ap.lim ? ' ' + P + '-cur' : '') + '" data-action="setlim" data-key="' + CFG.limits[i] + '">'
        + '<span class="' + P + '-rd"></span><span class="' + P + '-optt">' + fmtInt(CFG.limits[i]) + '</span></div>';
    }
    s += '<div class="' + P + '-popf"><span>Сразу, одним запросом, со всеми колонками.</span></div></div>';
  }
  return s + '</div>';
}
function colGroups(q) {
  var groups = [], by = {};
  for (var i = 0; i < FIELDS.length; i++) {
    var f = FIELDS[i];
    if (q && lower(f.label).indexOf(q) < 0 && lower(f.key).indexOf(q) < 0) continue;
    if (!by[f.group]) { by[f.group] = { name: f.group, items: [] }; groups.push(by[f.group]); }
    by[f.group].items.push(f);
  }
  return groups;
}
function presetCols(p) {
  var out = LOCKED.slice();
  for (var i = 0; i < p.cols.length; i++) if (FIELD_BY[p.cols[i]] && !inArr(out, p.cols[i])) out.push(p.cols[i]);
  return out;
}
function colGridHTML() {
  var P = CFG.ns, draft = state.colDraft || colOrder(), q = lower(trim(state.colQ)), gs = colGroups(q), s = '';
  for (var g = 0; g < gs.length; g++) {
    var on = 0;
    for (var c = 0; c < gs[g].items.length; c++) if (inArr(draft, gs[g].items[c].key)) on++;
    s += '<div class="' + P + '-cg"><div class="' + P + '-cgh"><label><input type="checkbox" data-colg="' + esc(gs[g].name) + '"'
      + (on === gs[g].items.length ? ' checked' : '') + '><span>' + esc(gs[g].name) + '</span></label><span>' + on + '/' + gs[g].items.length + '</span></div>';
    for (var i = 0; i < gs[g].items.length; i++) {
      var f = gs[g].items[i], lk = inArr(LOCKED, f.key);
      s += '<label class="' + P + '-opt"><input type="checkbox" data-colk="' + f.key + '"' + (inArr(draft, f.key) ? ' checked' : '') + (lk ? ' disabled' : '') + '>'
        + '<span class="' + P + '-optt">' + hl(f.label, q) + '</span></label>';
    }
    s += '</div>';
  }
  return s || '<div class="' + P + '-nores">Таких колонок нет</div>';
}
function colCountText() { return 'Выбрано: ' + (state.colDraft || colOrder()).length + ' · все колонки уже загружены — без запроса'; }
function colsDDHTML() {
  var P = CFG.ns, n = colOrder().length, s = '<div class="' + P + '-dd" data-scope="cols">'
    + ddButton({ key: 'cols', label: '', html: 'Колонки <span class="' + P + '-cnt">' + n + '</span>',
      tip: { title: 'Колонки таблицы', text: 'Строки загружены со всеми колонками: показать, убрать и переставить — сразу, без запроса.' } });
  if (state.open === 'cols') {
    var draft = state.colDraft || colOrder();
    s += '<div class="' + P + '-pop ' + P + '-cpop ' + P + '-rt" tabindex="-1"><div class="' + P + '-poph"><span>Колонки таблицы</span>'
      + '<button class="' + P + '-lnk" data-action="colreset">По умолчанию — ' + CFG.defaultCols.length + '</button></div><div class="' + P + '-cpt">'
      + hSearch('cols', 'Поиск колонки', state.colQ);
    for (var i = 0; i < CFG.presets.length; i++) {
      var p = CFG.presets[i];
      if (p.only && p.only !== MODE) continue;
      s += '<button class="' + P + '-pre' + (sameSet(presetCols(p), draft) ? ' ' + P + '-on' : '') + '" data-action="preset" data-key="' + i + '">' + esc(p.name) + '</button>';
    }
    s += '</div><div class="' + P + '-cgrid" data-plist="cols">' + colGridHTML() + '</div>'
      + '<div class="' + P + '-popf"><span data-pcount="1">' + colCountText() + '</span>'
      + '<button class="' + P + '-btn ' + P + '-pri" data-action="colapply">Показать</button></div></div>';
  }
  return s + '</div>';
}
function groupable() {
  var out = [], cand = state.groupBy.concat(colOrder());
  for (var i = 0; i < cand.length; i++) {
    var k = cand[i];
    if (k === 'master_id' || isAllocKey(k) || inArr(out, k) || !FIELD_BY[k]) continue;
    out.push(k);
  }
  return out;
}
function groupDDHTML() {
  var P = CFG.ns, n = state.groupBy.length, s = '<div class="' + P + '-dd" data-scope="group">'
    + ddButton({ key: 'group', label: '', html: 'Группировка' + (n ? ' <span class="' + P + '-cnt">' + n + '</span>' : ''), set: n > 0,
      tip: { title: 'Группировка', text: n ? 'По: ' + (function () { var l = []; for (var i = 0; i < n; i++) l.push(labelOf(state.groupBy[i])); return l.join(' › '); })() : 'Сгруппировать загруженные строки по колонкам — до ' + CFG.maxGroup + ' уровней, без запроса.' } });
  if (state.open === 'group') {
    var list = groupable();
    s += '<div class="' + P + '-pop ' + P + '-rt" tabindex="-1"><div class="' + P + '-poph"><span>Группировать по</span></div><div class="' + P + '-list">';
    for (var i = 0; i < list.length; i++) {
      var at = state.groupBy.indexOf(list[i]);
      s += '<label class="' + P + '-opt"><input type="checkbox" data-grp="' + list[i] + '"' + (at > -1 ? ' checked' : '')
        + (at < 0 && n >= CFG.maxGroup ? ' disabled' : '') + '><span class="' + P + '-optt">' + esc(labelOf(list[i])) + '</span>'
        + (at > -1 ? '<span class="' + P + '-optn">' + (at + 1) + '</span>' : '') + '</label>';
    }
    if (!list.length) s += '<div class="' + P + '-nores">Добавьте колонки — по ним можно группировать</div>';
    s += '</div><div class="' + P + '-popf"><span>Только вид, без запроса</span>'
      + (n ? '<button class="' + P + '-btn ' + P + '-ghost" data-action="gfold" data-key="1">Свернуть</button><button class="' + P + '-btn ' + P + '-ghost" data-action="gfold" data-key="0">Развернуть</button>' : '')
      + '</div></div>';
  }
  return s + '</div>';
}
// Ширина колонки: заданная мышью или по типу, но не уже подписи шапки (капитель ~7 px на знак).
function colW(k) {
  if (state.colW[k]) return state.colW[k];
  var base = 160;
  if (k === 'master_id') base = 112;
  else if (inArr(CFG.dateKeys, k) || k === 'alloc' || k === 'sum_alloc' || k === 'alloc_count') base = 116;
  else if (keyType(k) === 'num') base = 104;
  else if (/_unit_nm$|^kp\d+$|full_nm|address|position_nm|_desc$|_nm$/.test(k)) base = 220;
  return Math.max(base, Math.min(260, Math.round(labelOf(k).length * 7 + 34)));
}
function cellHTML(key, v, q) {
  var P = CFG.ns;
  if (isMasked(v)) return '<span class="' + P + '-mask">⛔ нет доступа</span>';
  if (key === 'my_link' && /^https?:\/\//i.test(v)) return '<a class="' + P + '-a" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">майти ↗</a>';
  return hl(cellText(key, v), q);
}
// Блок сотрудника: у КП со показанными колонками аллокации — строка на аллокацию, иначе одна.
function blockHTML(b, cols, q, perRow) {
  var P = CFG.ns, s = '<tbody class="' + P + '-bk">', bn = perRow ? b.n : 1;
  for (var r = b.i; r < b.i + bn; r++) {
    s += '<tr' + (r > b.i ? ' class="' + P + '-sub"' : '') + '>';
    for (var c = 0; c < cols.length; c++) {
      var key = cols[c], per = isAllocKey(key) && !isVirtual(key);
      if (r > b.i && !per) continue;
      var v = isVirtual(key) ? blockVal(b, key) : cellRaw(ROWS.rows[r], key), cls = [];
      if (c === 0) cls.push(P + '-c0');
      if (keyType(key) === 'num') cls.push(P + '-num');
      s += '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + (bn > 1 && !per ? ' rowspan="' + bn + '"' : '') + '>' + cellHTML(key, v, q) + '</td>';
    }
    s += '</tr>';
  }
  return s + '</tbody>';
}
function pageSlice(V) {
  var total = V.items ? V.items.length : V.idx.length, ps = state.pageSize || 100;
  var pages = Math.max(1, Math.ceil(total / ps)), pg = Math.max(0, Math.min(state.page || 0, pages - 1));
  state.page = pg;
  return { total: total, pages: pages, pg: pg, from: pg * ps, to: Math.min(total, pg * ps + ps) };
}
function tableInnerHTML(V) {
  var P = CFG.ns;
  if (!ROWS) return '<div class="' + P + '-empty"><b>' + (state.pend ? 'Загружаю строки…' : 'Строк нет') + '</b>'
    + (state.pend ? '' : 'Ответ пришёл без строк списка — обновите страницу.') + '</div>';
  if (!ROWS.blocks.length) return '<div class="' + P + '-empty"><b>Никого не нашлось</b>Под выбранные фильтры не попал ни один сотрудник.</div>';
  if (!V.idx.length) return '<div class="' + P + '-empty"><b>Ничего не найдено</b>По запросу «' + esc(state.search) + '» в загруженных строках ничего нет.</div>';
  var cols = V.cols, q = lower(trim(state.search)), sn = sortNow(), pgs = pageSlice(V), per = perRowCols(cols), W = 0, s = '<colgroup>';
  for (var c = 0; c < cols.length; c++) { var w = colW(cols[c]); W += w; s += '<col style="width:' + w + 'px">'; }
  s += '</colgroup><thead><tr>';
  for (var h = 0; h < cols.length; h++) {
    var k = cols[h], on = sn.key === k, cls = [P + '-sth'];
    if (h === 0) cls.push(P + '-c0');
    if (on) cls.push(P + '-son');
    if (keyType(k) === 'num') cls.push(P + '-num');
    s += '<th class="' + cls.join(' ') + '" data-col="' + k + '" draggable="true" data-action="sort" data-key="' + k + '"'
      + tip({ title: labelOf(k), text: (on ? (sn.dir === 'asc' ? 'По возрастанию' : 'По убыванию') + (sn.local ? ' (загруженные)' : ' (на сервере)') + '. ' : '')
        + 'Клик — сортировка, перетащите — порядок, край — ширина.' })
      + '><span class="' + P + '-thl">' + esc(labelOf(k)) + '</span>' + (on ? '<span class="' + P + '-sa">' + (sn.dir === 'asc' ? '↑' : '↓') + '</span>' : '')
      + '<i class="' + P + '-rsz" data-rsz="' + k + '"></i></th>';
  }
  s += '</tr></thead>';
  var bl = ROWS.blocks;
  if (V.items) {
    for (var i = pgs.from; i < pgs.to; i++) {
      var it = V.items[i];
      if (it.g) {
        var g = it.g, gk = state.groupBy[g.lvl], fold = !!state.collapsedGroups[g.key];
        s += '<tbody><tr class="' + P + '-g" data-action="grp" data-key="' + esc(g.key) + '"><td colspan="' + cols.length + '" style="padding-left:' + (10 + g.lvl * 18) + 'px">'
          + '<span class="' + P + '-gc">' + (fold ? '▸' : '▾') + '</span><span class="' + P + '-gl">' + esc(labelOf(gk)) + ':</span>'
          + (isMasked(g.v) ? '<span class="' + P + '-mask">⛔ нет доступа</span>' : esc(cellText(gk, g.v) || '(пусто)'))
          + '<span class="' + P + '-gn">' + fmtInt(g.n) + '</span></td></tr></tbody>';
      } else s += blockHTML(bl[it.b], cols, q, per);
    }
  } else {
    for (var j = pgs.from; j < pgs.to; j++) s += blockHTML(bl[V.idx[j]], cols, q, per);
  }
  return '<table class="' + P + '-t" style="width:' + W + 'px">' + s + '</table>';
}
function pagerHTML(V) {
  var P = CFG.ns, s = '<span>Строк на странице</span><span class="' + P + '-seg">';
  for (var i = 0; i < CFG.pageSizes.length; i++) {
    var ps = CFG.pageSizes[i];
    s += '<button class="' + P + '-segb' + (ps === state.pageSize ? ' ' + P + '-on' : '') + '" data-action="ps" data-key="' + ps + '" role="tab" aria-selected="' + (ps === state.pageSize ? 'true' : 'false') + '">' + ps + '</button>';
  }
  s += '</span><span class="' + P + '-sp"></span>';
  if (V && ROWS && V.idx.length) {
    var p = pageSlice(V);
    s += '<span class="' + P + '-pgi">' + fmtInt(p.from + 1) + '–' + fmtInt(p.to) + ' из ' + fmtInt(p.total) + '</span>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="first"' + (p.pg ? '' : ' disabled') + ' aria-label="Первая страница">«</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="prev"' + (p.pg ? '' : ' disabled') + ' aria-label="Назад">‹</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="next"' + (p.pg < p.pages - 1 ? '' : ' disabled') + ' aria-label="Вперёд">›</button>'
      + '<button class="' + P + '-ib" data-action="pg" data-key="last"' + (p.pg < p.pages - 1 ? '' : ' disabled') + ' aria-label="Последняя страница">»</button>';
  }
  return s;
}
function countHTML(V) {
  var P = CFG.ns, t = MODEL.total, got = ROWS ? ROWS.blocks.length : 0, sn = sortNow(), s = '<b>' + fmtInt(t) + '</b> ' + plural(t, 'сотрудник', 'сотрудника', 'сотрудников');
  var sub = [];
  if (ROWS && got < t) {
    var sp = String(applied().sort).split(':');
    sub.push('в таблице первые ' + fmtInt(got) + ' по «' + labelOf(sp[0]) + '» ' + (sp[1] === 'desc' ? '↓' : '↑'));
  }
  if (ROWS && trim(state.search)) sub.push('найдено ' + fmtInt(V ? V.idx.length : 0));
  if (sn.local) sub.push('сортировка загруженных');
  return s + (sub.length ? '<span class="' + P + '-tsub"> · ' + esc(sub.join(' · ')) + '</span>' : '');
}
// Загружены не все под фильтрами: больше последнего лимита — сузить фильтры; иначе — загрузить всех.
function limNoteHTML() {
  var P = CFG.ns, t = MODEL.total, got = ROWS ? ROWS.blocks.length : 0, max = CFG.limits[CFG.limits.length - 1];
  if (!ROWS || got >= t) return '';
  if (t > max) return '<div class="' + P + '-tnote ' + P + '-warn" data-tnote="1">' + esc(CFG.text.over.replace('{max}', fmtInt(max))) + '</div>';
  var lim = max;
  for (var i = 0; i < CFG.limits.length; i++) if (CFG.limits[i] >= t) { lim = CFG.limits[i]; break; }
  return '<div class="' + P + '-tnote" data-tnote="1"><span>' + esc(CFG.text.part.replace('{got}', fmtInt(got)).replace('{total}', fmtInt(t))) + '</span>'
    + '<button class="' + P + '-lnk" data-action="setlim" data-key="' + lim + '">Загрузить всех — ' + fmtInt(t) + '</button></div>';
}
function tableHTML() {
  var P = CFG.ns, V = viewRows(), s = '<div class="' + P + '-tpan">';
  s += '<div class="' + P + '-ttools"><span class="' + P + '-tcount" data-tcount="1">' + countHTML(V) + '</span>' + limDDHTML()
    + '<span class="' + P + '-sp"></span>'
    + '<label class="' + P + '-tsw">' + SEARCH_SVG + '<input class="' + P + '-srch" type="text" autocomplete="off" data-tsearch="1" placeholder="Поиск по таблице" value="' + esc(state.search) + '"></label>'
    + colsDDHTML() + groupDDHTML()
    + '<button class="' + P + '-btn' + (state.copied ? ' ' + P + '-ok' : '') + '" data-action="copy"' + (ROWS && V && V.idx.length ? '' : ' disabled')
    + tip({ title: 'Копировать', text: 'Все загруженные строки (с учётом поиска по таблице), в текущем порядке строк и колонок — для вставки в Excel.' })
    + '>' + COPY_SVG + '<span data-copytx="1">' + esc(state.copied || 'Копировать') + '</span></button></div>';
  s += limNoteHTML();
  s += '<div class="' + P + '-tbox" data-tbox="1">' + tableInnerHTML(V) + '</div>';
  s += '<div class="' + P + '-pager" data-pager="1">' + pagerHTML(V) + '</div></div>';
  return s;
}

// Только конкатенация строк. Все данные через esc().
// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".
function buildHTML() {
  var P = CFG.ns;
  if (MODEL.err) {
    var msg = MODEL.err === 'empty' ? ['Нет данных', 'Датасет не вернул строк. Проверьте, что чарт смотрит на датасет «Детальных списков», а лимит строк — не меньше 25 000.']
      : MODEL.err === 'columns' ? ['В данных чарта нет колонок: ' + MODEL.missing.join(', '), 'Добавьте в «Измерения» чарта role, k, v, n, j (инструкция поставки, п. 4).']
      : ['Нет служебной строки meta', 'Ответ датасета неполный: увеличьте лимит строк чарта (не меньше 25 000).'];
    return buildCSS() + '<div class="' + P + '-root"><div class="' + P + '-main"><div class="' + P + '-tpan"><div class="' + P + '-empty"><b>'
      + esc(msg[0]) + '</b>' + esc(msg[1]) + '</div></div></div></div>';
  }
  var h = [];
  h.push('<div class="' + P + '-root' + (state.pend && state.pend.kind !== 'search' && state.pend.kind !== 'part' && state.pend.kind !== 'kids' ? ' ' + P + '-busy' : '') + '">');
  h.push(headHTML());
  h.push('<div class="' + P + '-body">' + (MODEL.ok ? shelfHTML() : '') + '<div class="' + P + '-main">' + noticesHTML() + (MODEL.ok ? tableHTML() : '') + '</div></div>');
  if (MODEL.ok) h.push(layerHTML());
  h.push('</div>');
  return buildCSS() + h.join('');
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    if (!hosts || hosts.length === 0) return;
    var host = hosts[hosts.length - 1];
    var cvs = host.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ──
    // Создаётся РОВНО ОДИН РАЗ и кэшируется в tipEl.
    // НИКОГДА не создавай его внутри render() и НИКОГДА не клади
    // его разметку в buildHTML(): innerHTML убьёт узел, и тултип перестанет
    // работать после первого же перерисовывания.
    var tipEl = null;
    function getTip() {
      if (tipEl && tipEl.parentNode) return tipEl;
      var old = document.querySelector('body > .' + CFG.ns + '-tip');
      if (old) old.parentNode.removeChild(old);
      tipEl = document.createElement('div');
      tipEl.className = CFG.ns + '-tip';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    getTip();

    // showTip/hideTip — СЛУЖЕБНЫЕ. Не переписывать, не переименовывать, не
    // копировать их логику в свой код. Здесь заперты два правила, на которых
    // ломались все предыдущие версии:
    //   1) тултип спрятан ДВУМЯ свойствами (display + opacity) — показ обязан
    //      снять ОБА. Снял одно — узел построится и останется невидимым,
    //      без ошибок и без единого следа в отладке (RETRO 44);
    //   2) тултип лежит в body с position:fixed, поэтому координаты
    //      getBoundingClientRect() берутся КАК ЕСТЬ, а клампинг идёт по
    //      window.innerWidth/innerHeight — не по размерам контейнера (RETRO 26).
    // Твоё дело — только содержимое и якорь. Видимость и позицию считает showTip.
    function showTip(html, rect) {
      var tip = getTip();
      // За курсором showTip зовётся на каждом mousemove — HTML меняем, только если он другой.
      if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8, left, top;
      if (rect.pt) {
        // Якорь — курсор (как в Proteus Adoption): справа-снизу, у края окна — зеркально.
        left = rect.left + 14; top = rect.top + 18;
        if (left + t.width > window.innerWidth - pad) left = rect.left - t.width - 14;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - 14;
      } else {
        left = rect.left + rect.width / 2 - t.width / 2;
        top = rect.top + rect.height + gap;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      tip.style.opacity = '0';
      tip.style.display = 'none';
      tip.__h = null;
    }

    // Показ/скрытие тултипа НЕ требует полного render(): hover меняет только
    // содержимое и позицию, полный render() — только на клик (RETRO 20).
    // Якорь (rect) клади в state.tip при наведении: getBoundingClientRect()
    // цели КАК ЕСТЬ, без вычитания rect корня.
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      // data-tip несёт ГОТОВЫЙ html плашки (tipHtml при сборке разметки).
      showTip(state.tip.key || '', state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    // Прокрутку таблицы, списка поповера и самого overlay храним.
    function scrollOf() {
      var tb = overlay.querySelector('[data-tbox]'), pl = overlay.querySelector('[data-plist]'), sh = overlay.querySelector('[data-shelfl]');
      return { ov: overlay.scrollTop, tt: tb ? tb.scrollTop : 0, tl: tb ? tb.scrollLeft : 0, pl: pl ? pl.scrollTop : 0, pk: state.open, sh: sh ? sh.scrollTop : 0 };
    }
    function scrollTo(k, withTable) {
      if (!k) return;
      overlay.scrollTop = k.ov;
      var tb = overlay.querySelector('[data-tbox]'), pl = overlay.querySelector('[data-plist]'), sh = overlay.querySelector('[data-shelfl]');
      if (tb && withTable) { tb.scrollTop = k.tt; tb.scrollLeft = k.tl; }
      if (sh) sh.scrollTop = k.sh;
      if (pl && k.pk === state.open) pl.scrollTop = k.pl;
      placePop();
    }
    // Поповер фильтра полки — справа от полки, вровень со своим фильтром, в видимой части виджета;
    // места справа мало — под фильтром. Остальные поповеры не вылезают за край: сдвиг внутрь.
    function placeLayer(lay) {
      var btn = overlay.querySelector('[data-shelf] [data-pop="' + state.open + '"]'), root = lay.parentNode, pop = lay.firstChild;
      if (!btn || !root || !pop) return;
      var R = root.getBoundingClientRect(), b = btn.getBoundingClientRect(), o = overlay.getBoundingClientRect();
      var sh = overlay.querySelector('[data-shelf]'), x0 = sh ? sh.getBoundingClientRect().right + 6 : b.right + 8;
      var room = o.right - 8 - x0, left, top;
      pop.style.width = '';
      if (room >= 300) {
        if (pop.offsetWidth > room) pop.style.width = room + 'px';
        left = x0; top = b.top;
      } else {
        if (pop.offsetWidth > o.width - 16) pop.style.width = Math.max(260, o.width - 16) + 'px';
        left = Math.max(o.left + 8, Math.min(b.left, o.right - 8 - pop.offsetWidth)); top = b.bottom + 4;
      }
      var h = pop.offsetHeight, lo = Math.max(o.top, 0) + 8, hi = Math.min(o.bottom, window.innerHeight) - 8;
      if (top + h > hi) top = Math.max(lo, hi - h);
      lay.style.left = Math.round(left - R.left) + 'px';
      lay.style.top = Math.round(top - R.top) + 'px';
    }
    function placePop() {
      var lay = overlay.querySelector('[data-play]');
      if (lay) { placeLayer(lay); return; }
      var pop = overlay.querySelector('.' + CFG.ns + '-pop');
      if (!pop) return;
      var o = overlay.getBoundingClientRect();
      if (pop.offsetWidth > o.width - 16) pop.style.width = Math.max(260, o.width - 16) + 'px';
      var r = pop.getBoundingClientRect();
      if (r.right > o.right - 8) pop.style.left = Math.round(pop.offsetLeft - (r.right - (o.right - 8))) + 'px';
      r = pop.getBoundingClientRect();
      if (r.left < o.left + 8) pop.style.left = Math.round(pop.offsetLeft + (o.left + 8 - r.left)) + 'px';
    }
    function render() {
      var k = scrollOf(), had = overlay.contains(document.activeElement);
      overlay.innerHTML = buildHTML();
      scrollTo(k, true);
      // Фокус был в виджете (чекбокс в поповере) и пропал с пересборкой — в поповер: Esc и клавиши работают.
      if (had && state.open && !overlay.contains(document.activeElement)) {
        var pop = overlay.querySelector('.' + CFG.ns + '-pop');
        if (pop) { try { pop.focus({ preventScroll: true }); } catch (er) { pop.focus(); } }
      }
      renderTip();
    }
    // Только таблица, страницы и итог — поле поиска по таблице не пересоздаётся (фокус остаётся).
    function refreshTable() {
      var box = overlay.querySelector('[data-tbox]');
      if (!box) { render(); return; }
      var V = viewRows();
      box.innerHTML = tableInnerHTML(V);
      var pg = overlay.querySelector('[data-pager]');
      if (pg) pg.innerHTML = pagerHTML(V);
      var tc = overlay.querySelector('[data-tcount]');
      if (tc) tc.innerHTML = countHTML(V);
    }
    // Список открытого поповера — без поля поиска над ним (каретка живёт, RETRO 68).
    function refreshList() {
      var box = overlay.querySelector('[data-plist]');
      if (!box) return;
      if (state.open === 'per') box.innerHTML = perListHTML();
      else if (openTree()) box.innerHTML = treeListHTML();
      else if (openAttr()) box.innerHTML = fltValsHTML(openAttr());
      else if (state.open === 'cols') box.innerHTML = colGridHTML();
    }
    // Набранное без пересборки поповера (ввод списка сотрудников): полка, «Применить», подпись списка.
    function refreshStage() {
      var ab = overlay.querySelector('[data-abox]');
      if (ab) ab.innerHTML = applyBoxHTML();
      var sh = overlay.querySelector('[data-shelfl]');
      if (sh) { var top = sh.scrollTop; sh.innerHTML = shelfListHTML(); sh.scrollTop = top; }
      var inf = overlay.querySelector('[data-idinfo]');
      if (inf) inf.innerHTML = idInfoHTML();
    }
    function focusTable() {
      var ts = overlay.querySelector('[data-tsearch]');
      if (!ts) return;
      ts.focus();
      try { ts.setSelectionRange(ts.value.length, ts.value.length); } catch (er) { /* поле без выделения */ }
    }
    function focusPop() {
      var inp = overlay.querySelector('[data-psearch]') || overlay.querySelector('[data-ids]');
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (er) { /* поле без выделения */ }
        return;
      }
      var pop = overlay.querySelector('.' + CFG.ns + '-pop');
      if (pop && pop.focus) pop.focus();
    }

    // Имена атрибутов — ЧАСТЬ КОНТРАКТА, а не стиль: `data-tip`, `data-kind`,
    // `data-action`, `data-view` — ровно эти, ЦЕЛИКОМ. По ним smoke.mjs ищет,
    // что наводить и на что кликать. Своё имя (`data-tip-kind`) он не найдёт,
    // а склейка с префиксом (`CFG.ns + '-data-tip'`) в DOM даёт `pvt-data-tip`:
    // виджет при этом работает — свой же обработчик читает то же имя, — но
    // ВЕСЬ тултиповый слой уходит в N/A, и экрана не видит никто (RETRO 56, 59).
    // Префикс CFG.ns нужен КЛАССАМ, data-атрибутам — нет.
    function trigger(node, attr) {
      while (node && node !== overlay) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      return null;
    }

    // ── НАВЕДЕНИЕ: тултип едет за курсором и не мигает ──
    // Цель — ближайший [data-tip] или ячейка таблицы, где текст не влез (подсказка — полный текст).
    // Между соседними целями тултип не гаснет; ушёл в пустоту — гаснет через TIP_HIDE мс.
    var TIP_HIDE = 110, tipHideT = null;
    function curPt(e) { return { left: e.clientX, top: e.clientY, width: 0, height: 0, pt: true }; }
    function cancelHide() { if (tipHideT) { clearTimeout(tipHideT); tipHideT = null; } }
    function dropTip() { cancelHide(); state.tip = null; hideTip(); }
    function scheduleHide() {
      if (tipHideT || !state.tip) return;
      tipHideT = setTimeout(function () { tipHideT = null; state.tip = null; hideTip(); }, TIP_HIDE);
    }
    function cellOf(node) {
      while (node && node !== overlay) {
        if (node.tagName === 'TD') return node;
        if (node.tagName === 'TABLE') return null;
        node = node.parentNode;
      }
      return null;
    }
    function onMove(e) {
      if (state.drag || state.resizing) return;
      var el = trigger(e.target, 'data-tip');
      // Кнопка с раскрытым поповером подсказку не показывает: меню и так перед глазами.
      if (el && el.getAttribute('aria-haspopup') && el.getAttribute('aria-expanded') === 'true') el = null;
      var html = el ? el.getAttribute('data-tip') || '' : '';
      if (!html) {
        var td = cellOf(e.target);
        if (td && td.scrollWidth > td.clientWidth + 1 && trim(td.textContent)) html = '<span class="' + CFG.ns + '-t-x">' + esc(td.textContent) + '</span>';
      }
      if (!html) { scheduleHide(); return; }
      cancelHide();
      state.tip = { rect: curPt(e), key: html, kind: el ? el.getAttribute('data-kind') || '' : 'cell' };
      showTip(html, state.tip.rect);
    }
    function onLeave() { dropTip(); }

    // ── ЭМИССИЯ КРОСС-ФИЛЬТРА ──
    // Чарт фильтрует САМ СЕБЯ (самовлияние включено в дашборде). Каждый эмит несёт метку rq;
    // ответ с той же меткой в эхе снимает «ожидание». Метки нет CFG.pendingWarnMs — говорим.
    function armPend() {
      if (state.pendT) clearTimeout(state.pendT);
      state.pendT = null;
      if (!state.pend) return;
      var left = Math.max(200, CFG.pendingWarnMs - (Date.now() - state.pend.at));
      state.pendT = setTimeout(function () {
        state.pendT = null;
        if (!state.pend) return;
        state.pend = null;
        state.warn = CFG.text.notApplied;
        if (state.rerender) state.rerender();
      }, left);
    }
    function emit(next, o) {
      o = o || {};
      if (!o.keepPop) { state.open = ''; state.q = ''; }
      if (typeof applyCrossFilter !== 'function') { state.warn = CFG.text.noCf; render(); if (o.keepPop) focusPop(); return; }
      state.warn = '';
      state.rqN = (state.rqN || 0) + 1;
      next.rq = 'q' + state.rqN + '.' + (Date.now() % 1000000);
      state.keep = scrollOf();
      state.pend = { rq: next.rq, at: Date.now(), kind: o.kind || 'apply', pt: (next.pt || ['r']).slice(), node: o.node || '' };
      state.tip = null;
      hideTip();
      armPend();
      render();
      if (o.keepPop) focusPop();
      applyCrossFilter(maskOf(next));
    }
    function needPart(p) { return p === 'f' ? !MODEL.facets : !MODEL.trees[p]; }
    // Значения фильтров и деревья — когда их открывают; один раз на набор фильтров.
    function loadPart(p, force) {
      if (!MODEL.ok || !needPart(p) || partPending(p)) return;
      var key = MODEL.fsig + '#' + p;
      state.partTried = state.partTried || {};
      if (state.partTried[key] && !force) return;
      state.partTried[key] = 1;
      var pt = [p];
      if (state.pend && state.pend.kind === 'part') pt = uniq(state.pend.pt.concat(pt));
      emit(reqOf(applied(), viewNow(), pt), { keepPop: true, kind: 'part' });
    }
    function ensureParts() {
      if (openTree()) loadPart(openTree());
      else if (openAttr()) loadPart('f');
    }
    // Поиск в датасете — после паузы в наборе или по Enter, если загружено не всё.
    function searchNeeded() {
      var q = trim(state.q);
      if (q.length < CFG.searchMin) return '';
      if (openTree()) {
        var tk = openTree(), T = treeOf(tk);
        if (!T || T.full || searchEcho(tk + '=')) return '';
        return tk + '=' + q.slice(0, 60);
      }
      if (openAttr()) {
        var a = openAttr(), fc = MODEL.facets;
        if (!fc || (fc.nv[a] || 0) <= (fc.vals[a] || []).length || searchEcho('f:' + a + '=')) return '';
        return 'f:' + a + '=' + q.slice(0, 60);
      }
      return '';
    }
    function searchLater(now) {
      if (state.qT) { clearTimeout(state.qT); state.qT = null; }
      var qv = searchNeeded();
      if (!qv) return;
      var go = function () {
        state.qT = null;
        var q2 = searchNeeded();
        if (!q2) return;
        var n = reqOf(applied(), viewNow(), ['q']);
        n.q = q2;
        emit(n, { keepPop: true, kind: 'search' });
      };
      if (now) go(); else state.qT = setTimeout(go, CFG.searchDelay);
    }
    function loadKids(tk, x) {
      if (kidsPending(tk, x)) return;
      var n = reqOf(applied(), viewNow(), ['q']);
      n.q = tk + '>' + (tk === 'kp' ? x.path : x.id);
      emit(n, { keepPop: true, kind: 'kids', node: tk + ':' + x.id });
    }
    function findNode(tk, id) {
      var T = treeOf(tk);
      if (T && T.by[id]) {
        var x = T.by[id], chain = [], p = x.pid, guard = 0;
        while (p && T.by[p] && guard++ < 16) { chain.unshift(T.by[p].name); p = T.by[p].pid; }
        return { x: x, path: tk === 'kp' ? '' : chain.join(' › ') };
      }
      for (var i = 0; i < MODEL.q.length; i++) if (MODEL.q[i].k === tk && MODEL.q[i].id === id) return { x: MODEL.q[i], path: MODEL.q[i].path };
      return null;
    }

    // ── СТРОКИ ТАБЛИЦЫ: «Копировать» — все найденные, в текущем порядке строк и колонок ──
    function copyRows() {
      var V = viewRows();
      if (!V || !ROWS) return;
      var cols = state.groupBy.concat(V.cols), perRow = false, lines = [], head = [];
      for (var c = 0; c < cols.length; c++) { head.push(labelOf(cols[c])); if (isAllocKey(cols[c]) && !isVirtual(cols[c])) perRow = true; }
      lines.push(head.join('\t'));
      var order = V.idx, bl = ROWS.blocks, nb = 0;
      if (V.items) { order = []; var all = viewAllItems(V); for (var it = 0; it < all.length; it++) order.push(all[it]); }
      for (var i = 0; i < order.length; i++) {
        var b = bl[order[i]], last = perRow ? b.i + b.n : b.i + 1;
        nb++;
        for (var r = b.i; r < last; r++) {
          var line = [];
          for (var k = 0; k < cols.length; k++) {
            var key = cols[k], v = isVirtual(key) ? blockVal(b, key) : cellRaw(ROWS.rows[isAllocKey(key) ? r : b.i], key);
            line.push(copyText(key, v).replace(/[\t\r\n]+/g, ' '));
          }
          lines.push(line.join('\t'));
        }
      }
      var text = lines.join('\n'), done = function (ok) {
        state.copied = ok ? 'Скопировано: ' + fmtInt(nb) : 'Не скопировалось';
        var tx = overlay.querySelector('[data-copytx]');
        if (tx) { tx.textContent = state.copied; tx.parentNode.className = CFG.ns + '-btn' + (ok ? ' ' + CFG.ns + '-ok' : ''); }
        setTimeout(function () {
          state.copied = '';
          var t2 = overlay.querySelector('[data-copytx]');
          if (t2) { t2.textContent = 'Копировать'; t2.parentNode.className = CFG.ns + '-btn'; }
        }, 2200);
      };
      var fallback = function () {
        var ta = document.createElement('textarea'), ok = false;
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        overlay.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
        overlay.removeChild(ta);
        done(ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      else fallback();
    }
    // При группировке «Копировать» идёт в порядке групп, свёрнутые группы тоже попадают.
    function viewAllItems(V) {
      var saved = state.collapsedGroups, out = [];
      state.collapsedGroups = {};
      var W = viewRows();
      state.collapsedGroups = saved;
      for (var i = 0; i < W.items.length; i++) if (!W.items[i].g) out.push(W.items[i].b);
      return out;
    }

    function onClick(e) {
      if (state.noClick && Date.now() - state.noClick < 250) return;
      // Клик мимо открытого поповера закрывает его; data-scope — на обёртке
      // открывателя вместе с поповером: клик по списку/поиску — «внутри».
      var sc = trigger(e.target, 'data-scope');
      if (state.open && (!sc || sc.getAttribute('data-scope') !== state.open)) {
        state.open = '';
        state.q = '';
        state.colDraft = null;
        if (!trigger(e.target, 'data-action')) {
          // Клик мимо поповера в поиск по таблице: после пересборки курсор — в новом поле.
          var inTs = e.target && e.target.getAttribute && e.target.getAttribute('data-tsearch') !== null;
          render();
          if (inTs) focusTable();
          return;
        }
      }
      var a = trigger(e.target, 'data-action');
      if (!a) return;
      var act = a.getAttribute('data-action'), key = a.getAttribute('data-key') || '', id = a.getAttribute('data-id') || '';
      if (act === 'open') {
        var pop = a.getAttribute('data-pop') || '';
        if (state.open === pop) { state.open = ''; state.q = ''; state.colDraft = null; render(); return; }
        state.open = pop;
        state.q = '';
        if (pop === 'cols') { state.colDraft = colOrder().slice(); state.colQ = ''; }
        state.tip = null;
        hideTip();
        render();
        focusPop();
        ensureParts();
        return;
      }
      if (act === 'chipx') {
        stageEdit(function (st) {
          if (key === 'per') { st.per = 'last'; st.dt = ''; }
          else if (key === 'emp') st.emp = CFG.emp[0];
          else if (key === 'tcr') st.tcr = '';
          else if (key === 'mu' || key === 'lu' || key === 'kp') st[key] = [];
          else if (key === 'id') { for (var i2 = 0; i2 < ID_KEYS.length; i2++) st.id[ID_KEYS[i2]] = []; }
          else if (key.indexOf('id:') === 0) st.id[key.slice(3)] = [];
          else if (key.indexOf('flt:') === 0) delete st.flt[key.slice(4)];
        });
        render();
        return;
      }
      if (act === 'setper') {
        var dv = a.getAttribute('data-v') || '';
        stageEdit(function (st) { st.per = key === 'date' && dv ? 'date' : 'last'; st.dt = key === 'date' ? dv : ''; });
        state.open = ''; state.q = '';
        render();
        return;
      }
      if (act === 'set1') {
        var sv = a.getAttribute('data-v') || '';
        stageEdit(function (st) { st[key] = key === 'emp' ? (sv || CFG.emp[0]) : sv; });
        state.open = ''; state.q = '';
        render();
        return;
      }
      if (act === 'apply') {
        if (!stageDiff() || state.pend) return;
        state.page = 0;
        emit(reqOf(staged(), viewNow(), ['r']), { kind: 'apply' });
        return;
      }
      if (act === 'unstage') { state.stage = null; render(); return; }
      if (act === 'reset') {
        state.stage = null;
        state.page = 0;
        emit(reqOf(DEFAULT_F, viewNow(), ['r']), { kind: 'apply' });
        return;
      }
      if (act === 'loadpart') { loadPart(key, true); return; }
      // Полка: свернуть / развернуть целиком и по разделам — только вид.
      if (act === 'shelf') { state.shelfOff = !state.shelfOff; state.open = ''; state.q = ''; dropTip(); render(); return; }
      if (act === 'sfold') { state.shelfFold[key] = !state.shelfFold[key]; dropTip(); render(); return; }
      // Структура: раскрытие, дети узла по запросу, очистка.
      if (act === 'tw' || act === 'tkids') {
        var T = treeOf(key), x = T ? T.by[id] : null;
        if (!x) return;
        var kids = T.kids[id] || [];
        if (act === 'tw') {
          var depth = 0, p = x.pid, guard = 0;
          while (p && T.by[p] && guard++ < 16) { depth++; p = T.by[p].pid; }
          var opn = !tIsOpen(key, T, id, depth, selAnc(key, T));
          state.treeOpen[key + ':' + id] = opn;
          if (!opn || kids.length || !x.hk) { render(); return; }
        }
        state.treeOpen[key + ':' + id] = true;
        loadKids(key, x);
        return;
      }
      if (act === 'tclear') { stageEdit(function (st) { st[key] = []; }); render(); return; }
      if (act === 'fclear') { stageEdit(function (st) { delete st.flt[key]; }); render(); return; }
      // Сотрудники по списку.
      if (act === 'idk') { state.idKind = key; state.idBad = 0; render(); focusPop(); return; }
      if (act === 'idclear') { state.idBad = 0; stageEdit(function (st) { st.id[key] = []; }); render(); focusPop(); return; }
      // Колонки: черновик в поповере; «Показать» — без запроса (строки пришли со всеми колонками).
      if (act === 'preset') {
        var pr = CFG.presets[+key];
        if (pr) state.colDraft = presetCols(pr);
        render();
        return;
      }
      if (act === 'colreset') { state.colDraft = LOCKED.concat(CFG.defaultCols); state.colDraft = uniq(state.colDraft); render(); return; }
      if (act === 'colapply') {
        var draft = uniq(state.colDraft || colOrder());
        state.columnOrder = draft;
        state.open = ''; state.q = ''; state.colDraft = null;
        if (state.sortKey && !inArr(draft, state.sortKey) && !inArr(state.groupBy, state.sortKey)) { state.sortKey = ''; state.sortDir = ''; }
        render();
        return;
      }
      if (act === 'setlim') {
        var ap2 = applied(), lim = +key;
        state.open = '';
        if (lim === ap2.lim) { render(); return; }
        state.page = 0;
        emit(reqOf(ap2, { sort: ap2.sort, lim: lim }, ['r']), { kind: 'rows' });
        return;
      }
      // Сортировка: все сотрудники загружены — в памяти; иначе — на сервере (первые N в новом порядке).
      // Колонки аллокаций сервер не сортирует — они всегда в памяти.
      if (act === 'sort') {
        if (!ROWS) return;
        var sn = sortNow(), dir = sn.key !== key ? 'asc' : (sn.dir === 'asc' ? 'desc' : '');
        state.page = 0;
        if (ROWS.blocks.length >= MODEL.total || isAllocKey(key)) {
          state.sortKey = dir ? key : '';
          state.sortDir = dir;
          refreshTable();
          return;
        }
        state.sortKey = ''; state.sortDir = '';
        var ap3 = applied();
        emit(reqOf(ap3, { sort: dir ? key + ':' + dir : 'master_id:asc', lim: ap3.lim }, ['r']), { kind: 'rows' });
        return;
      }
      if (act === 'grp') { state.collapsedGroups[key] = !state.collapsedGroups[key]; refreshTable(); return; }
      if (act === 'gfold') {
        state.collapsedGroups = {};
        if (key === '1') {
          var V = viewRows();
          for (var g = 0; V && V.items && g < V.items.length; g++) if (V.items[g].g && V.items[g].g.lvl === 0) state.collapsedGroups[V.items[g].g.key] = true;
        }
        state.page = 0;
        render();
        return;
      }
      if (act === 'ps') { state.pageSize = +key || 100; state.page = 0; refreshTable(); return; }
      if (act === 'pg') {
        var Vp = viewRows(), pgs = Vp ? pageSlice(Vp) : null;
        if (!pgs) return;
        state.page = key === 'first' ? 0 : (key === 'last' ? pgs.pages - 1 : pgs.pg + (key === 'next' ? 1 : -1));
        refreshTable();
        var tb = overlay.querySelector('[data-tbox]');
        if (tb) tb.scrollTop = 0;
        return;
      }
      if (act === 'copy') { copyRows(); return; }
    }

    // Чекбоксы: change, не click (label/input дают оба события).
    function onChange(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var tk = t.getAttribute('data-tsel');
      if (tk) {
        var tid = t.getAttribute('data-tid') || '', f = findNode(tk, tid);
        if (!f) return;
        var v = nodeVal(tk, f.x), max = treeDef(tk).max, full = false;
        if (tk !== 'kp') state.names[tk + ':' + f.x.id] = { name: f.x.name, path: f.path };
        stageEdit(function (st) {
          var list = (st[tk] || []).slice(), at = list.indexOf(v);
          if (t.checked && at < 0) { if (list.length < max) list.push(v); else full = true; }
          if (!t.checked && at > -1) list.splice(at, 1);
          st[tk] = list;
        });
        state.warn = full ? 'В «' + treeDef(tk).name + '» можно выбрать не больше ' + max + ' узлов.' : '';
        render();
        return;
      }
      var fk = t.getAttribute('data-fk');
      if (fk) {
        var fv = t.getAttribute('data-fv') || '', over = false;
        stageEdit(function (st) {
          var list = (st.flt[fk] || []).slice(), at = list.indexOf(fv), sum = 0;
          for (var a in st.flt) if (st.flt.hasOwnProperty(a)) sum += st.flt[a].length;
          if (t.checked && at < 0) { if (list.length < CFG.maxVals && sum < CFG.maxValsTotal) list.push(fv); else over = true; }
          if (!t.checked && at > -1) list.splice(at, 1);
          if (list.length) st.flt[fk] = list; else delete st.flt[fk];
        });
        state.warn = over ? 'Значений в фильтрах — не больше ' + CFG.maxVals + ' у атрибута и ' + CFG.maxValsTotal + ' всего.' : '';
        render();
        return;
      }
      var ck = t.getAttribute('data-colk');
      if (ck) {
        var dr = (state.colDraft || colOrder()).slice(), ai = dr.indexOf(ck);
        if (t.checked && ai < 0) dr.push(ck);
        if (!t.checked && ai > -1 && !inArr(LOCKED, ck)) dr.splice(ai, 1);
        state.colDraft = dr;
        render();
        return;
      }
      var cg = t.getAttribute('data-colg');
      if (cg !== null) {
        var gs = colGroups(lower(trim(state.colQ))), dr2 = (state.colDraft || colOrder()).slice();
        for (var g = 0; g < gs.length; g++) {
          if (gs[g].name !== cg) continue;
          for (var i = 0; i < gs[g].items.length; i++) {
            var kk = gs[g].items[i].key, at2 = dr2.indexOf(kk);
            if (t.checked && at2 < 0) dr2.push(kk);
            if (!t.checked && at2 > -1 && !inArr(LOCKED, kk)) dr2.splice(at2, 1);
          }
        }
        state.colDraft = dr2;
        render();
        return;
      }
      var gk = t.getAttribute('data-grp');
      if (gk) {
        var gl = state.groupBy.slice(), gi = gl.indexOf(gk);
        if (t.checked && gi < 0 && gl.length < CFG.maxGroup) gl.push(gk);
        if (!t.checked && gi > -1) gl.splice(gi, 1);
        state.groupBy = gl;
        state.collapsedGroups = {};
        state.page = 0;
        render();
        return;
      }
    }

    // Поиск в поповере и по таблице: пересобираем ТОЛЬКО список / таблицу — поле ввода
    // не трогаем, фокус и каретка остаются на месте (E23b).
    var tsT = null;
    function onInput(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var ps = t.getAttribute('data-psearch');
      if (ps !== null) {
        if (ps === 'cols') { state.colQ = t.value; refreshList(); return; }
        state.q = t.value;
        refreshList();
        searchLater(false);
        return;
      }
      if (t.getAttribute('data-tsearch') !== null) {
        state.search = t.value;
        state.page = 0;
        if (tsT) clearTimeout(tsT);
        tsT = setTimeout(function () { tsT = null; refreshTable(); }, 120);
        return;
      }
      var ik = t.getAttribute('data-ids');
      if (ik) {
        var r = parseIds(ik, t.value), used = 0;
        for (var i = 0; i < ID_KEYS.length; i++) if (ID_KEYS[i] !== ik) used += (staged().id[ID_KEYS[i]] || []).length;
        state.idBad = r.bad;
        stageEdit(function (st) { st.id[ik] = r.list.slice(0, Math.max(0, CFG.maxIds - used)); });
        refreshStage();
      }
    }

    // Escape закрывает открытый поповер (smoke E24); Enter в поиске — сразу в датасет.
    function onKeydown(e) {
      var k = e.keyCode || e.which, t = e.target;
      if (k === 13 && t && t.getAttribute && t.getAttribute('data-psearch') !== null) { e.preventDefault(); searchLater(true); return; }
      if (k === 27 && t && t.getAttribute && t.getAttribute('data-tsearch') !== null && state.search) {
        t.value = ''; state.search = ''; state.page = 0; refreshTable(); return;
      }
      if (k === 27 && state.open) { state.open = ''; state.q = ''; state.colDraft = null; render(); return; }
      // Не-кнопки с role="button" («×» у фильтра): Enter/пробел = клик.
      if ((k === 13 || k === 32) && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        onClick({ target: t });
      }
    }

    // ── КОЛОНКИ: перетащить заголовок — порядок, край заголовка — ширина ──
    function onDragStart(e) {
      if (state.resizing) { e.preventDefault(); return; }
      var th = trigger(e.target, 'data-col');
      if (!th) return;
      var k = th.getAttribute('data-col');
      if (inArr(LOCKED, k)) { e.preventDefault(); return; }
      state.drag = k;
      th.classList.add(CFG.ns + '-dragsrc');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', k); } catch (er) { /* IE */ } }
      dropTip();
    }
    function markOver(th) {
      var old = overlay.querySelectorAll('.' + CFG.ns + '-dragover');
      for (var i = 0; i < old.length; i++) if (old[i] !== th) old[i].classList.remove(CFG.ns + '-dragover');
      if (th) th.classList.add(CFG.ns + '-dragover');
    }
    function onDragOver(e) {
      if (!state.drag) return;
      var th = trigger(e.target, 'data-col');
      if (!th || inArr(LOCKED, th.getAttribute('data-col'))) { markOver(null); return; }
      e.preventDefault();
      markOver(th);
    }
    function onDrop(e) {
      if (!state.drag) return;
      e.preventDefault();
      var th = trigger(e.target, 'data-col'), to = th ? th.getAttribute('data-col') : '', from = state.drag;
      state.drag = '';
      if (!to || to === from || inArr(LOCKED, to)) { refreshTable(); return; }
      var o = colOrder(), fi = o.indexOf(from);
      if (fi > -1) o.splice(fi, 1);
      o.splice(o.indexOf(to), 0, from);
      state.columnOrder = o;
      state.noClick = Date.now();
      refreshTable();
    }
    function onDragEnd() { state.drag = ''; markOver(null); var s = overlay.querySelector('.' + CFG.ns + '-dragsrc'); if (s) s.classList.remove(CFG.ns + '-dragsrc'); }
    function onDown(e) {
      var t = e.target, key = t && t.getAttribute ? t.getAttribute('data-rsz') : null;
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      var cols = displayCols(), idx = cols.indexOf(key), th = t.parentNode, table = th.parentNode;
      while (table && table.tagName !== 'TABLE') table = table.parentNode;
      var colEl = table ? table.querySelectorAll('col')[idx] : null, x0 = e.clientX, w0 = th.offsetWidth;
      state.resizing = true;
      dropTip();
      var move = function (ev) {
        var w = Math.max(CFG.spacing.colMin, Math.min(CFG.spacing.colMax, Math.round(w0 + ev.clientX - x0)));
        state.colW[key] = w;
        if (colEl) colEl.style.width = w + 'px';
        if (table) { var W = 0; for (var i = 0; i < cols.length; i++) W += colW(cols[i]); table.style.width = W + 'px'; }
      };
      var up = function () {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        state.resizing = false;
        state.noClick = Date.now();
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
    }
    // Двойной клик по краю заголовка — ширина по умолчанию.
    function onDbl(e) {
      var key = e.target && e.target.getAttribute ? e.target.getAttribute('data-rsz') : null;
      if (!key) return;
      delete state.colW[key];
      refreshTable();
    }

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseleave', onLeave);
    overlay.addEventListener('mousedown', onDown);
    overlay.addEventListener('dblclick', onDbl);
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('keydown', onKeydown);
    overlay.addEventListener('dragstart', onDragStart);
    overlay.addEventListener('dragover', onDragOver);
    overlay.addEventListener('drop', onDrop);
    overlay.addEventListener('dragend', onDragEnd);
    // Полка прокрутилась — поповер её фильтра едет следом (scroll не всплывает: перехват).
    overlay.addEventListener('scroll', function (e) {
      if (state.open && e.target && e.target.getAttribute && e.target.getAttribute('data-shelfl') !== null) placePop();
    }, true);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);
    // Клик мимо виджета (по дашборду) закрывает поповер.
    if (state.onDocDown) document.removeEventListener('mousedown', state.onDocDown, true);
    state.onDocDown = function (ev) {
      if (!state.open || !overlay.parentNode) return;
      var n = ev.target;
      while (n) { if (n === overlay) return; n = n.parentNode; }
      state.open = '';
      state.q = '';
      state.colDraft = null;
      render();
    };
    document.addEventListener('mousedown', state.onDocDown, true);
    // Esc закрывает поповер, даже если фокус ушёл из виджета (клик по полю дашборда и т. п.).
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey, true);
    state.onDocKey = function (ev) {
      if ((ev.keyCode || ev.which) !== 27 || !state.open || !overlay.parentNode || overlay.contains(ev.target)) return;
      state.open = '';
      state.q = '';
      state.colDraft = null;
      render();
    };
    document.addEventListener('keydown', state.onDocKey, true);
    state.rerender = render;

    // Ответ пришёл: метка совпала с ожиданием — снимаем его; набранное применилось.
    var rq = MODEL.m ? MODEL.m.rq || '' : '';
    var kept = state.keep, keptKind = state.pend ? state.pend.kind : '';
    if (state.pend && rq && rq === state.pend.rq) {
      if (state.pend.kind === 'apply') state.stage = null;
      state.pend = null;
      state.keep = null;
      if (state.warn === CFG.text.notApplied) state.warn = '';
    } else if (state.pend && Date.now() - state.pend.at > CFG.pendingWarnMs) {
      state.pend = null;
      state.warn = CFG.text.notApplied;
    }
    if (state.stage && !stageDiff()) state.stage = null;
    armPend();

    render();
    // Ответ «частью» (значения фильтров, дерево, поиск) — прокрутка как была; новые строки — сверху.
    if (kept && !state.pend) scrollTo(kept, keptKind === 'part' || keptKind === 'search' || keptKind === 'kids');
    if (state.open) focusPop();
    // Ответ без строк под этот запрос (страницу обновили на запросе «частью») — дослать строки один раз.
    if (MODEL.ok && !ROWS && !state.pend && state.heal !== MODEL.rsig) {
      state.heal = MODEL.rsig;
      emit(reqOf(applied(), viewNow(), ['r']), { kind: 'rows', keepPop: true });
    } else ensureParts();

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    // Старый observer отключаем: иначе он держит удалённый overlay.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function() {
        overlay.style.width = '100%'; overlay.style.height = '100%';
        if (state.open) placePop();
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    // option присваивается позже, в БЛОКЕ 7: из catch к нему не обращаться.
    // Ищем overlay внутри СВОЕГО хоста: на дашборде может быть второй виджет
    // с тем же ns, и сообщение об ошибке уедет не туда.
    var box = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) box = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!box) box = document.querySelector('.' + CFG.ns + '-overlay');
    if (box) {
      box.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
        + 'Ошибка графика: ' + esc((e && e.message) || e) + '</div>';
    }
  }
})();

// ---------- БЛОК 7: ПУСТОЙ OPTION ----------
// ГЛОБАЛЬНО, В САМОМ КОНЦЕ, ВНЕ функций и IIFE.
// После этого присваивания option не трогать: любая мутация вернёт eCharts
// к отрисовке своего графика поверх overlay.
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
