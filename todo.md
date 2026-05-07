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
