export function canRefreshReachCorrectionList(options: { isReviewing: boolean; isFetching: boolean }): boolean {
  return !options.isReviewing && !options.isFetching;
}

export function resetReachCorrectionView() {
  return {
    hasReviewed: false,
    progress: 0,
    reviewedCount: 0,
  };
}
