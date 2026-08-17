export type LinkAnalyticsPost = {
  channelTitle?: string | null;
  views24h?: number | null;
  views48h?: number | null;
  views72h?: number | null;
  channelSubs?: number | null;
};

export type PostSelection =
  | { kind: "single" | "matched"; post: LinkAnalyticsPost }
  | { kind: "ambiguous" | "empty"; post: null };

function normalizeChannelName(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Returns a post only when a tracker link identifies one post, or when it can
 * be matched to exactly one selected application channel. Never use the first
 * result from a multi-channel link: it may belong to another channel.
 */
export function selectPostForChannel(
  posts: LinkAnalyticsPost[] | null | undefined,
  channelName: string | null | undefined,
): PostSelection {
  if (!posts?.length) return { kind: "empty", post: null };
  if (posts.length === 1) return { kind: "single", post: posts[0] };

  const normalizedChannel = normalizeChannelName(channelName);
  if (normalizedChannel.length < 3) return { kind: "ambiguous", post: null };

  const matches = posts.filter((post) => {
    const normalizedPost = normalizeChannelName(post.channelTitle);
    return normalizedPost.length >= 3 && (
      normalizedPost.includes(normalizedChannel) ||
      normalizedChannel.includes(normalizedPost)
    );
  });

  return matches.length === 1
    ? { kind: "matched", post: matches[0] }
    : { kind: "ambiguous", post: null };
}

/** The business metric is the reach exactly 24 hours after publication. */
export function getViews24h(post: LinkAnalyticsPost | null | undefined): number | null {
  const value = post?.views24h;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}
