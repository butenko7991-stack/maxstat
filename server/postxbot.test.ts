import { describe, expect, it } from "vitest";
import { isPostXbotWatchUrl, parsePostXbotReport } from "./postxbot";

const REPORT_URL = "https://max.postxbot.ru/watchpost/rZP5IHTIZiqZSNUGc1k1eg";

describe("отчёты PostXbot", () => {
  it("распознаёт публичную ссылку отчёта", () => {
    expect(isPostXbotWatchUrl(new URL(REPORT_URL))).toBe(true);
    expect(isPostXbotWatchUrl(new URL("https://max.postxbot.ru/"))).toBe(false);
  });

  it("извлекает точный общий охват за 24 часа из рекламной кампании", () => {
    const report = parsePostXbotReport(`
      <h1>Страница статистики поста</h1>
      <div role="textbox">Текст рекламного поста</div>
      <div class="card"><b> 6464</b><small>Всего просмотров</small></div>
      <div class="card"><b> 5069</b><small>24 ч.</small></div>
      <img src="https://maxapi.postxbot.ru/avatar/channel/1"><div>Сама по себе</div>
    `, REPORT_URL);

    expect(report.summary.views24h).toBe(5069);
    expect(report.posts).toMatchObject([{ views24h: 5069 }]);
  });

  it("применяет общий охват кампании при нескольких внешних размещениях", () => {
    const report = parsePostXbotReport(`
      <b> 5069</b><small>24 ч.</small>
      <img src="https://maxapi.postxbot.ru/avatar/channel/1"><div>Канал А</div>
      <img src="https://maxapi.postxbot.ru/avatar/channel/2"><div>Канал Б</div>
    `, REPORT_URL);

    expect(report.summary.views24h).toBe(5069);
    expect(report.posts).toMatchObject([{ views24h: 5069 }]);
  });
});
