// Transaction history: filters (type, period, person), money in/out totals, and formatting.
// Periods are worked out in Nigerian time (Africa/Lagos), whatever timezone the server runs in.
import { HISTORY_TYPES, HISTORY_PERIODS } from "./nlu.js";

export const MONEY_IN_TYPES = ["Received", "Esusu Payout", "Esusu Refund"];

const ICONS = {
  Airtime: "📱", Transfer: "💸", Received: "💰", "Bill Payment": "🧾",
  "Esusu Contribution": "🤝", "Esusu Payout": "🎉", "Esusu Refund": "↩️",
};

// transactions.date is a TIMESTAMP (no timezone) written in the DB session's timezone.
const LOCAL_DATE = `((date AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'Africa/Lagos')`;
const LOCAL_NOW = `(NOW() AT TIME ZONE 'Africa/Lagos')`;

const PERIOD_SQL = {
  today: `${LOCAL_DATE} >= date_trunc('day', ${LOCAL_NOW})`,
  yesterday: `${LOCAL_DATE} >= date_trunc('day', ${LOCAL_NOW}) - interval '1 day' AND ${LOCAL_DATE} < date_trunc('day', ${LOCAL_NOW})`,
  this_week: `${LOCAL_DATE} >= date_trunc('week', ${LOCAL_NOW})`,
  last_week: `${LOCAL_DATE} >= date_trunc('week', ${LOCAL_NOW}) - interval '7 days' AND ${LOCAL_DATE} < date_trunc('week', ${LOCAL_NOW})`,
  this_month: `${LOCAL_DATE} >= date_trunc('month', ${LOCAL_NOW})`,
  last_month: `${LOCAL_DATE} >= date_trunc('month', ${LOCAL_NOW}) - interval '1 month' AND ${LOCAL_DATE} < date_trunc('month', ${LOCAL_NOW})`,
};

// Cleans a filter from chat or from query parameters.
export const normalizeFilter = (f = {}) => {
  const type = HISTORY_TYPES.includes(f.type) ? f.type : "all";
  let period = HISTORY_PERIODS.includes(f.period) ? f.period : "all";
  const days = Math.round(Number(f.days));
  if (period === "last_days" && !(days >= 1)) period = "all";
  const counterparty = typeof f.counterparty === "string" && /^[A-Za-z0-9_.]{1,40}$/.test(f.counterparty) ? f.counterparty : null;
  return { type, period, days: period === "last_days" ? Math.min(days, 366) : null, counterparty };
};

export const isFiltered = (f) => f.type !== "all" || f.period !== "all" || Boolean(f.counterparty);

// Builds the WHERE clause. Returns { where, params }.
export const buildWhere = (username, filter) => {
  const f = normalizeFilter(filter);
  const params = [username];
  const clauses = ["username = $1"];
  const add = (sql, ...values) => {
    let s = sql;
    for (const v of values) {
      params.push(v);
      s = s.replace("?", `$${params.length}`);
    }
    clauses.push(s);
  };

  if (f.type === "sent") add("type = 'Transfer'");
  if (f.type === "received") add("type = 'Received'");
  if (f.type === "airtime") add("type = 'Airtime'");
  if (f.type === "bills") add("type = 'Bill Payment'");
  if (f.type === "esusu") add("type LIKE 'Esusu %'");
  if (f.type === "money_out") add("NOT (type = ANY(?))", MONEY_IN_TYPES);

  if (f.period === "last_days") add(`${LOCAL_DATE} >= date_trunc('day', ${LOCAL_NOW}) - make_interval(days => ?)`, f.days - 1);
  else if (PERIOD_SQL[f.period]) add(PERIOD_SQL[f.period]);

  if (f.counterparty) add("LOWER(to_user) = LOWER(?)", f.counterparty);

  return { where: clauses.join(" AND "), params, filter: f };
};

// Returns { rows, totals: { count, moneyIn, moneyOut }, filter }.
export const queryHistory = async (db, username, filter, { limit = 20, beforeId = null } = {}) => {
  const { where, params, filter: f } = buildWhere(username, filter);
  const pageParams = [...params, Math.min(Math.max(limit, 1), 100)];
  let pageWhere = where;
  if (Number.isInteger(beforeId) && beforeId > 0) {
    pageParams.push(beforeId);
    pageWhere += ` AND id < $${pageParams.length}`;
  }
  const [list, sums] = await Promise.all([
    db.query(
      `SELECT * FROM transactions WHERE ${pageWhere} ORDER BY date DESC, id DESC LIMIT $${params.length + 1}`,
      pageParams
    ),
    db.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(amount) FILTER (WHERE type = ANY($${params.length + 1})), 0)::bigint AS money_in,
              COALESCE(SUM(amount) FILTER (WHERE NOT (type = ANY($${params.length + 1}))), 0)::bigint AS money_out
       FROM transactions WHERE ${where}`,
      [...params, MONEY_IN_TYPES]
    ),
  ]);
  const s = sums.rows[0];
  return {
    rows: list.rows,
    totals: { count: s.count, moneyIn: Number(s.money_in), moneyOut: Number(s.money_out) },
    filter: f,
  };
};

export const formatTxDate = (date) =>
  new Date(date).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const formatHistory = ({ rows, totals, filter }, lang, { t, naira, historyLabel }) => {
  const f = normalizeFilter(filter);
  const filtered = isFiltered(f);
  if (!rows.length) return t(filtered ? "historyNoMatch" : "historyEmpty", lang);

  const lines = rows.map((tx) => {
    const icon = ICONS[tx.type] || "💳";
    let party = "";
    if (tx.type === "Received") party = ` ← ${tx.to_user}`;
    else if (tx.to_user && tx.to_user !== "Self") party = ` → ${tx.to_user}`;
    const note = tx.note ? ` · "${tx.note}"` : "";
    return `${icon} ${formatTxDate(tx.date)} — ${tx.type} ${naira(tx.amount)}${party}${note}`;
  });

  const header = filtered ? t("historyFilteredHeader", lang, historyLabel(f, lang)) : t("historyHeader", lang);
  const more = totals.count > rows.length ? `\n${t("historyMore", lang, rows.length, totals.count)}` : "";
  const sums = t("historyTotals", lang, totals.moneyIn, totals.moneyOut);
  return `${header}\n\n${lines.join("\n")}${more}\n\n${sums}`;
};

// A short spoken summary (the list itself is too long to read aloud).
export const historySpeech = ({ rows, totals, filter }, lang, { t, historyLabel }) => {
  const f = normalizeFilter(filter);
  if (!rows.length) return t(isFiltered(f) ? "historyNoMatch" : "historyEmpty", lang);
  const header = isFiltered(f) ? t("historyFilteredHeader", lang, historyLabel(f, lang)) : t("historyHeader", lang);
  return `${header} ${t("historyTotals", lang, totals.moneyIn, totals.moneyOut)}`;
};
