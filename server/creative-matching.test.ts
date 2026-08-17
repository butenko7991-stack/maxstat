import { describe, expect, it } from "vitest";
import { matchCreativeToChannel } from "./creativeMatching";

describe("сопоставление креатива с отчётом", () => {
  const creatives = [
    { id: 1, channelId: 11, title: null, postText: "Я работал в эскорте. За моими плечами больше десяти лет работы в сфере услуг для женщин.", recognizedText: null },
    { id: 2, channelId: 22, title: null, postText: "Как научиться строить здоровые отношения и не попадать в абьюзивные сценарии.", recognizedText: null },
  ];

  it("выбирает канал при уникальном совпадении текста поста", () => {
    const match = matchCreativeToChannel("Я РАБОТАЛ В ЭСКОРТЕ. За моими плечами больше 10 лет работы в сфере сексуальных услуг для женщин.", creatives);
    expect(match?.channelId).toBe(11);
    expect(match?.creativeId).toBe(1);
  });

  it("не выбирает канал по короткому или неуверенному совпадению", () => {
    expect(matchCreativeToChannel("Короткий пост", creatives)).toBeNull();
    expect(matchCreativeToChannel("Это полностью другой рекламный текст с другими словами и другой тематикой публикации.", creatives)).toBeNull();
  });

  it("не выбирает канал при одинаково сильных совпадениях разных каналов", () => {
    const duplicated = [
      { id: 3, channelId: 11, title: null, postText: "Уникальный рекламный текст про новые отношения и доверие в паре каждый день.", recognizedText: null },
      { id: 4, channelId: 22, title: null, postText: "Уникальный рекламный текст про новые отношения и доверие в паре каждый день.", recognizedText: null },
    ];
    expect(matchCreativeToChannel("Уникальный рекламный текст про новые отношения и доверие в паре каждый день.", duplicated)).toBeNull();
  });
});
