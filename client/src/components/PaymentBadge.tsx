interface PaymentBadgeProps {
  status: "paid" | "unpaid" | "partial";
}

const LABELS: Record<string, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  partial: "Частично",
};

export function PaymentBadge({ status }: PaymentBadgeProps) {
  return <span className={`badge-${status}`}>{LABELS[status] ?? status}</span>;
}
