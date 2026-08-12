import { Request, Response } from "express";
import { notifyOwner } from "./_core/notification";
import { getExternalSalesAnalytics, getAllUsers } from "./db";

/**
 * Monthly reminder about external advertiser sales.
 * Triggered by Heartbeat cron on the 1st of each month at 9:00 UTC.
 * Path: /api/scheduled/external-reminder
 */
export async function externalReminderHandler(req: Request, res: Response) {
  try {
    const users = await getAllUsers();
    if (!users || users.length === 0) {
      return res.json({ ok: true, skipped: "no users" });
    }

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const monthName = prevMonth.toLocaleString("ru-RU", { month: "long", year: "numeric" });
    const summaryLines: string[] = [];
    let totalRevenue = 0;
    let totalCount = 0;

    for (const user of users) {
      const data = await getExternalSalesAnalytics(user.id, 1);
      if (data.totalCount > 0) {
        totalRevenue += data.totalRevenue;
        totalCount += data.totalCount;
        const premium = data.costPremium != null ? ` (+${data.costPremium}% к внутренней)` : "";
        summaryLines.push(
          `• ${data.totalCount} сделок на ${data.totalRevenue.toLocaleString("ru-RU")} ₽ (${data.externalShare}% от всех продаж)${premium}`
        );
        if (data.byChannel.length > 0) {
          for (const ch of data.byChannel) {
            summaryLines.push(`  └ ${ch.channelName}: ${ch.count} сделок, ср. чек ${ch.avgCost.toLocaleString("ru-RU")} ₽`);
          }
        }
      }
    }

    if (summaryLines.length === 0) {
      await notifyOwner({
        title: `📊 Внешка за ${monthName}: нет сделок`,
        content: [
          `За ${monthName} продаж внешним рекламодателям не было.`,
          "",
          "💡 Напоминание: внешняя реклама обычно дороже внутренней — стоит рассмотреть возможность привлечения внешних клиентов.",
          "",
          "Откройте раздел «AI Аналитика → Внешка» для детального анализа.",
        ].join("\n"),
      });
    } else {
      await notifyOwner({
        title: `📊 Внешка за ${monthName}: ${totalCount} сделок, ${totalRevenue.toLocaleString("ru-RU")} ₽`,
        content: [
          `Итоги продаж внешним рекламодателям за ${monthName}:`,
          "",
          ...summaryLines,
          "",
          "💡 Внешняя реклама обычно дороже внутренней — следите за долей и средним чеком.",
          "Откройте раздел «AI Аналитика → Внешка» для детального анализа.",
        ].join("\n"),
      });
    }

    return res.json({ ok: true, totalCount, totalRevenue });
  } catch (error) {
    console.error("[external-reminder] Error:", error);
    return res.status(500).json({
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}
