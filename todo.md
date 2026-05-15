# Max Ads Manager — TODO

## Backend / Database
- [x] Define schema: channels, purchase_records, sale_records tables in drizzle/schema.ts
- [x] Generate and apply migration SQL
- [x] DB helpers: channels CRUD, purchase records CRUD, sale records CRUD, financial summaries
- [x] tRPC routers: channels, purchases, sales, summary

## Frontend — Global
- [x] Design system: premium dark theme, color palette, typography (Inter), global CSS variables
- [x] DashboardLayout with mobile sidebar: Каналы, Закуп, Продажа, Итоги
- [x] Auth guard: redirect to login if not authenticated
- [x] Month filter component (shared across Закуп and Продажа)
- [x] Payment status badge/filter component

## Frontend — Pages
- [x] Каналы page: list channels, add/edit/delete channel modal
- [x] Закуп page: table of purchase records, add/edit/delete entry, month filter, payment filter
- [x] Продажа page: table of sale records, add/edit/delete entry, month filter, payment filter
- [x] Итоги page: per-channel summary cards + overall dashboard (spend, income, profit)

## Quality
- [x] Vitest tests for tRPC routers (channels, purchases, sales)
- [x] Mobile-first responsive layout verified
- [x] Empty states for all lists
- [x] Loading skeletons for all data tables

## Изменения по запросу пользователя
- [x] Поле "Время" в форме продажи: заменить выпадающий список на свободный текстовый ввод

## Улучшения высокого приоритета
- [x] Экспорт в Excel: кнопка выгрузки закупа и продажи за выбранный месяц в .xlsx
- [x] Быстрое изменение статуса оплаты: тап по бейджу в списке без открытия формы
- [x] Дублирование записи: кнопка «Копировать» создаёт новую запись с теми же данными
- [x] Поиск по записям: строка поиска по админу, ссылке, направлению в Закупе и Продаже

## Расчёт по СПМ
- [x] Добавить поле "Охваты" в форму Закупа и Продажи
- [x] Автоматический расчёт стоимости по формуле: Стоимость = (Охваты × СПМ) / 1000
- [x] Добавить столбец "Охваты" в схему БД (purchase_records и sale_records)

## Графики на странице Итоги
- [x] tRPC endpoint для данных по месяцам (monthlyStats): суммы закупа и продажи по каждому месяцу
- [x] Столбчатая диаграмма динамики закупа и продажи по месяцам (BarChart, recharts)
- [x] Линейный график прибыли по месяцам (LineChart, recharts)
- [x] Фильтр по каналу на странице Итоги (применяется к графикам и карточкам)

## Следующие улучшения
- [x] Виджет неоплаченных долгов на странице Итоги (сумма неоплаченных по каждому каналу)
- [x] Автодополнение полей Админ, Направление, Платформа из ранее введённых значений
- [x] Сортировка записей по дате, стоимости, статусу оплаты в Закупе и Продаже

## Подписчики в Закупе
- [x] Добавить столбец subscribersGained (INT) в таблицу purchase_records
- [x] Добавить поле "Пришло подписчиков" в форму Закупа
- [x] Показывать кол-во подписчиков и стоимость подписчика (cost/subscribers) в карточке записи
- [x] Показывать суммарное кол-во подписчиков и среднюю стоимость подписчика в итоговой строке
- [x] Добавить поле subscribersGained в роутер и DB helper

## Календарь бронирования
- [x] Новый раздел "Расписание" в боковом меню (иконка Calendar)
- [x] Сетка: строки = каналы, столбцы = дни недели, ячейки = 3 слота (утро/обед/вечер)
- [x] Цветовая индикация: свободно (зелёный), забронировано (красный/оранжевый)
- [x] Тап на свободный слот → форма создания продажи с предзаполненными датой и временем
- [x] Тап на занятый слот → просмотр деталей записи
- [x] Навигация по неделям (← →) и кнопка "Сегодня"
- [x] Фильтр по каналу
- [x] Закуп отображается в сетке как справочная информация (серый цвет)
- [x] Маршрут /schedule в App.tsx

## Исправления расписания
- [x] Добавить поле bookingSlot (утро/обед/вечер) в sale_records для надёжной сетки
- [x] Серверная проверка дублирования брони (один канал/дата/слот)
- [x] Отображать закуп явно серыми бейджами в ячейках сетки
- [x] Состояния загрузки и ошибок на странице расписания

## bookingSlot фича (завершено)
- [x] bookingSlot добавлен в SaleFormData интерфейс и SaleFormModal UI
- [x] SalesPage: EMPTY_FORM, openEdit, handleSubmit обновлены
- [x] SchedulePage: EMPTY_SALE_FORM, openCreate, createSaleMutation обновлены
- [x] getScheduleData возвращает bookingSlot
- [x] saleMap строится по bookingSlot (с фоллбэком на timeSlot)
- [x] Проверка конфликта добавлена в sales.update с excludeId

## Проверка пересечения бронирований
- [x] SaleFormModal: добавить проп `conflictError` и показывать алерт с сообщением об ошибке
- [x] SalesPage: перехватывать CONFLICT ошибку в onError мутаций create/update, передавать в форму
- [x] SchedulePage: перехватывать CONFLICT ошибку в onError мутации create, показывать в форме

## Доработки расписания (gap-fix)
- [x] Показывать серый purchase badge и в занятых ячейках (сейчас только в свободных)
- [x] Purchase badge информативен даже без admin (показывать "N закуп.")
- [x] Loading/error state для channels.list на SchedulePage

## Сетка закупов в расписании
- [x] Добавить поле bookingSlot в purchase_records (схема + миграция)
- [x] Мигрировать существующие purchase_records: заполнить bookingSlot по timeSlot/дате
- [x] DB helper: getScheduleData возвращает bookingSlot для закупов
- [x] tRPC router: purchases.create/update принимают и сохраняют bookingSlot
- [x] PurchaseFormModal: добавить выпадающий список bookingSlot
- [x] SchedulePage: таб-переключатель "Продажа / Закуп"
- [x] SchedulePage: сетка закупов (аналог сетки продаж, синяя цветовая схема)
