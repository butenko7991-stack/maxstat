# Деплой на Railway

## Необходимые переменные окружения

Установите их в Railway → Settings → Variables:

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | MySQL/TiDB строка подключения |
| `JWT_SECRET` | Секрет для JWT-сессий (случайная строка 32+ символа) |
| `VITE_APP_ID` | ID приложения Manus OAuth |
| `OAUTH_SERVER_URL` | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | `https://manus.im` |
| `OWNER_OPEN_ID` | Ваш OpenID в Manus |
| `BUILT_IN_FORGE_API_URL` | `https://forge.manus.im` |
| `BUILT_IN_FORGE_API_KEY` | Ключ Forge API (для AI-аналитики) |
| `VITE_FRONTEND_FORGE_API_URL` | `https://forge.manus.im` |
| `VITE_FRONTEND_FORGE_API_KEY` | Ключ Forge API (фронтенд) |

## База данных

Приложение использует MySQL. На Railway можно:
1. Добавить плагин **MySQL** прямо в Railway (бесплатный тариф есть)
2. Использовать внешнюю БД (TiDB Cloud, PlanetScale, Aiven)

После создания БД скопируйте строку подключения в `DATABASE_URL`.

### Применение миграций

После первого деплоя выполните миграции через Railway CLI или через Dashboard → Shell:

```bash
pnpm drizzle-kit migrate
```

## Шаги деплоя

1. Зайдите на [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Выберите репозиторий `butenko7991-stack/maxstat`
4. Railway автоматически найдёт `Dockerfile` и `railway.toml`
5. Добавьте все переменные окружения из таблицы выше
6. Нажмите Deploy

## Обновления

Каждый раз когда я (Manus) вношу изменения и пушу в GitHub, Railway **автоматически** задеплоит новую версию.
