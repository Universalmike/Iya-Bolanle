// "₦12,500"
export const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
