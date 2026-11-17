import React, { useEffect, useState } from "react";
import { api } from "./api";
import { ui } from "./i18n";
import Icon from "./Icon";
import { Notice, PageHeader } from "./components";
import { naira } from "./format";

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "";

const STATUS_KEYS = { forming: "statusForming", active: "statusActive", completed: "statusCompleted" };

// Esusu / Ajo screen. `onAction(path, body)` posts to /esusu/<path>, shows SARA's
// reply in the chat, refreshes `groups`, and resolves to { ok, message }.
// `lang` is the screen language; `tr(key, ...args)` looks up its text.
export default function EsusuView({ groups, onAction, lang = "english" }) {
  const tr = (key, ...args) => ui(key, lang, ...args);
  const [view, setView] = useState("list"); // list | create | join | detail
  const [detailId, setDetailId] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, message } from the last action
  const [busy, setBusy] = useState(false);

  const act = async (path, body) => {
    setBusy(true);
    const result = await onAction(path, body);
    setNotice(result);
    setBusy(false);
    return result;
  };

  const openDetail = (id) => {
    setDetailId(id);
    setView("detail");
  };
  const back = () => setView("list");

  const banner = notice && (
    <div style={{ marginBottom: 14 }}>
      <Notice kind={notice.ok ? "success" : "error"} onDismiss={() => setNotice(null)} lang={lang}>
        {notice.message}
      </Notice>
    </div>
  );

  if (view === "create") {
    return (
      <CreateGroup
        tr={tr}
        busy={busy}
        banner={banner}
        onBack={back}
        onCreate={async (body) => {
          const r = await act("create", body);
          if (r.ok) back();
        }}
      />
    );
  }

  if (view === "join") {
    return (
      <JoinGroup
        tr={tr}
        busy={busy}
        banner={banner}
        onBack={back}
        onJoin={async (inviteCode) => {
          const r = await act("join", { inviteCode });
          if (r.ok) back();
        }}
      />
    );
  }

  if (view === "detail" && detailId) {
    return <GroupDetail groupId={detailId} groups={groups} tr={tr} busy={busy} banner={banner} act={act} onBack={back} />;
  }

  return (
    <section className="screen">
      <PageHeader title={tr("tabEsusu")} subtitle={tr("esusuSubtitle")} />
      {banner}

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => setView("create")}>
          <Icon name="plus" size={18} />
          {tr("createGroup")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setView("join")}>
          <Icon name="key" size={18} />
          {tr("joinWithCode")}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="card empty-state" style={{ margin: "16px 0" }}>
          <span className="empty-icon"><Icon name="group" size={30} /></span>
          <h2>{tr("noGroups")}</h2>
          <p>{tr("noGroupsHint")}</p>
        </div>
      ) : (
        <div className="group-list">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} tr={tr} busy={busy} act={act} onOpen={() => openDetail(g.id)} />
          ))}
        </div>
      )}

      <div className="info-box">
        <h2>{tr("esusuHowTitle")}</h2>
        <ol>
          <li>{tr("esusuStep1")}</li>
          <li>{tr("esusuStep2")}</li>
          <li>{tr("esusuStep3")}</li>
          <li>{tr("esusuStep4")}</li>
        </ol>
      </div>
    </section>
  );
}

function StatusPill({ status, tr }) {
  return <span className={`pill pill--${status in STATUS_KEYS ? status : "forming"}`}>{tr(STATUS_KEYS[status] || "statusForming")}</span>;
}

function InviteCode({ code, tr }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is still visible to read out.
    }
  };
  return (
    <div className="invite">
      <div>
        <span className="invite-label">{tr("inviteCode").replace(/:$/, "")}</span>
        <span className="invite-code">{code}</span>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-live="polite">
        <Icon name={copied ? "check" : "copy"} size={16} />
        {copied ? tr("copied") : tr("copy")}
      </button>
    </div>
  );
}

// The "you" line for an active group: collected, your turn, or which round you collect.
function YourTurn({ g, tr }) {
  if (g.has_collected) {
    return <span className="status-line status-line--ok"><Icon name="check" size={18} />{tr("youCollected", naira(g.collected_amount))}</span>;
  }
  if (g.position === g.current_cycle) {
    return <div className="turn-banner"><Icon name="star" size={20} />{tr("yourTurn")}</div>;
  }
  return <span className="meta">{tr("youCollectInRound", g.position)}</span>;
}

function PaymentStatus({ g, tr }) {
  if (g.paid_this_round) return <span className="status-line status-line--ok"><Icon name="check" size={18} />{tr("paidThisRound")}</span>;
  if (g.is_late) return <span className="status-line status-line--late"><Icon name="clock" size={18} />{tr("lateWasDue", formatDate(g.cycle_due_at))}</span>;
  return <span className="status-line status-line--due"><Icon name="clock" size={18} />{tr("dueBy", formatDate(g.cycle_due_at))}</span>;
}

function GroupCard({ group: g, tr, busy, act, onOpen }) {
  const paidPct = g.member_count ? Math.round((100 * g.paid_count) / g.member_count) : 0;
  // The card opens the group; its own buttons stop the click from bubbling.
  return (
    <article className="card group-card" style={{ cursor: "pointer" }} onClick={onOpen}>
      <div className="group-head">
        <h2 className="group-name">
          <button type="button" className="link-btn" style={{ color: "inherit", fontSize: 18, fontWeight: 800, minHeight: 0, textAlign: "left" }} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            {g.group_name}
          </button>
        </h2>
        <StatusPill status={g.status} tr={tr} />
      </div>
      <p className="meta">{tr("groupLine", naira(g.amount_per_person), g.frequency, g.position)}</p>

      {g.status === "forming" && (
        <>
          <p className="meta">{tr("membersCount", g.member_count, g.total_members)}</p>
          <InviteCode code={g.invite_code} tr={tr} />
          {g.is_creator && g.member_count >= 2 && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={(e) => { e.stopPropagation(); act("start", { groupId: g.id }); }}>
              <Icon name="play" size={18} />
              {tr("startNow")}
            </button>
          )}
        </>
      )}

      {g.status === "active" && (
        <>
          <div>
            <div className="progress-head">
              <strong>{tr("roundLine", g.current_cycle, g.member_count, g.paid_count, naira(g.pot_balance)).split(" • ")[0]}</strong>
              <span className="meta">{tr("roundLine", g.current_cycle, g.member_count, g.paid_count, naira(g.pot_balance)).split(" • ").slice(1).join(" · ")}</span>
            </div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={g.member_count} aria-valuenow={g.paid_count}>
              <span style={{ width: `${paidPct}%` }}></span>
            </div>
          </div>
          <YourTurn g={g} tr={tr} />
          <div className="group-foot">
            <PaymentStatus g={g} tr={tr} />
            {!g.paid_this_round && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); act("contribute", { groupId: g.id }); }}>
                {tr("payAmount", naira(g.amount_per_person))}
              </button>
            )}
          </div>
        </>
      )}

      {g.status === "completed" && <span className="status-line status-line--ok"><Icon name="check" size={18} />{tr("everyoneCollected")}</span>}
    </article>
  );
}

function BackButton({ onBack, tr }) {
  return (
    <button type="button" className="link-btn" onClick={onBack} style={{ marginBottom: 8 }}>
      <Icon name="back" size={20} />
      {tr("back")}
    </button>
  );
}

function GroupDetail({ groupId, groups, tr, busy, banner, act, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Re-fetch whenever the groups list changes (i.e. after any action).
  const summary = groups.find((g) => g.id === groupId);
  const loadFailed = tr("loadGroupFailed");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/esusu/groups/${groupId}`)
      .then((res) => !cancelled && (setData(res.data), setError(null)))
      .catch((err) => !cancelled && setError(err.response?.data?.message || loadFailed));
    return () => { cancelled = true; };
  }, [groupId, summary, loadFailed]);

  // The group disappears from the list once you leave it or cancel it.
  useEffect(() => {
    if (data && !summary) onBack();
  }, [data, summary, onBack]);

  if (error) {
    return (
      <section className="screen">
        <BackButton onBack={onBack} tr={tr} />
        <Notice kind="error">{error}</Notice>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="screen">
        <div className="scanning" role="status"><div className="spinner" aria-hidden="true"></div><p>{tr("loadingShort")}</p></div>
      </section>
    );
  }

  const { group: g, members } = data;
  const forming = g.status === "forming";

  return (
    <section className="screen">
      <BackButton onBack={onBack} tr={tr} />
      <div className="group-head" style={{ marginBottom: 6 }}>
        <h1 className="page-title">{g.group_name}</h1>
        <StatusPill status={g.status} tr={tr} />
      </div>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        {tr("detailSubtitle", naira(g.amount_per_person), g.frequency, naira(g.amount_per_person * members.length))}
        {g.status === "active" && tr("detailRound", g.current_cycle, members.length, formatDate(g.cycle_due_at))}
      </p>
      {banner}
      {forming && <InviteCode code={g.invite_code} tr={tr} />}

      <div className="card member-list">
        {members.map((m) => {
          const collecting = g.status === "active" && m.position === g.current_cycle;
          const parts = [];
          if (m.has_collected) parts.push(tr("memberCollected", naira(m.collected_amount)));
          if (g.status === "active") parts.push(m.paid_this_round ? tr("memberPaid") : m.is_late ? tr("memberLate") : tr("memberNotPaid"));
          if (collecting) parts.push(tr("collectsThisRound").trim());
          return (
            <div key={m.username} className="member-row">
              <span className="position">{m.position}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="member-name">{m.username}</span>
                {m.username === g.created_by && <span className="meta">{tr("creator")}</span>}
                {parts.length > 0 && (
                  <span className={`member-sub${m.is_late && !m.paid_this_round ? " member-sub--late" : ""}`}>{parts.join(" · ")}</span>
                )}
              </div>
              {collecting && <Icon name="star" size={20} label={tr("collectsThisRound").trim()} />}
              {forming && g.is_creator && m.username !== g.created_by && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => act("remove", { groupId: g.id, member: m.username })} disabled={busy}>
                  {tr("remove")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        {g.status === "active" && !g.paid_this_round && (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => act("contribute", { groupId: g.id })} disabled={busy}>
            {tr("payForRound", naira(g.amount_per_person), g.current_cycle)}
          </button>
        )}
        {forming && g.is_creator && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => act("shuffle", { groupId: g.id })} disabled={busy}>
              <Icon name="shuffle" size={18} />
              {tr("shuffle")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => act("start", { groupId: g.id })} disabled={busy || members.length < 2}>
              <Icon name="play" size={18} />
              {tr("startWith", members.length)}
            </button>
          </>
        )}
        {forming && !confirmingLeave && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmingLeave(true)} disabled={busy}>
            {tr(g.is_creator ? "cancelGroup" : "leaveGroup")}
          </button>
        )}
      </div>

      {/* Asked on the page rather than with the browser's confirm() pop-up. */}
      {forming && confirmingLeave && (
        <div className="confirm-box" role="alertdialog" aria-label={tr(g.is_creator ? "cancelGroup" : "leaveGroup")}>
          <p>{tr(g.is_creator ? "confirmCancelGroup" : "confirmLeaveGroup")}</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setConfirmingLeave(false);
                act("leave", { groupId: g.id });
              }}
              disabled={busy}
            >
              {tr("confirmYes")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingLeave(false)}>
              {tr("confirmNo")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CreateGroup({ tr, busy, banner, onBack, onCreate }) {
  const [form, setForm] = useState({ groupName: "", amount: "", frequency: "monthly", members: "5" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const members = parseInt(form.members, 10) || 0;
  const amount = parseInt(form.amount, 10) || 0;

  const submit = (e) => {
    e.preventDefault();
    onCreate({ groupName: form.groupName, amountPerPerson: amount, frequency: form.frequency, totalMembers: members });
  };

  return (
    <section className="screen">
      <BackButton onBack={onBack} tr={tr} />
      <PageHeader title={tr("createTitle")} subtitle={tr("createSubtitle")} />
      {banner}

      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="g-name">{tr("groupNameLabel")}</label>
          <input id="g-name" className="input" placeholder={tr("groupNamePlaceholder")} value={form.groupName} onChange={set("groupName")} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="g-amount">{tr("amountPerPersonLabel")}</label>
          <input id="g-amount" className="input" inputMode="numeric" type="number" min="1" placeholder={tr("amountPlaceholder")} value={form.amount} onChange={set("amount")} />
        </div>
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
            <label className="field-label" htmlFor="g-freq">{tr("frequencyLabel")}</label>
            <select id="g-freq" className="select" value={form.frequency} onChange={set("frequency")}>
              <option value="daily">{tr("freqDaily")}</option>
              <option value="weekly">{tr("freqWeekly")}</option>
              <option value="monthly">{tr("freqMonthly")}</option>
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
            <label className="field-label" htmlFor="g-members">{tr("membersLabel")}</label>
            <select id="g-members" className="select" value={form.members} onChange={set("members")}>
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>{tr("membersOption", n)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="notice notice--gold" style={{ marginBottom: 16 }}>
          <Icon name="info" size={20} />
          <span className="notice-text">{tr("createSummary", members, naira(amount), form.frequency, naira(members * amount))}</span>
        </div>

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {tr("createGroup")}
        </button>
      </form>
    </section>
  );
}

function JoinGroup({ tr, busy, banner, onBack, onJoin }) {
  const [code, setCode] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (code.trim()) onJoin(code);
  };
  return (
    <section className="screen">
      <BackButton onBack={onBack} tr={tr} />
      <PageHeader title={tr("joinTitle")} subtitle={tr("joinSubtitle")} />
      {banner}
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="join-code">{tr("inviteCode").replace(/:$/, "")}</label>
          <input
            id="join-code"
            className="input input--big input--code"
            placeholder="7KQ2XM"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !code.trim()}>
          {tr("joinGroup")}
        </button>
      </form>
    </section>
  );
}
