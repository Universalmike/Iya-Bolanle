import React from "react";
import Icon from "./Icon";
import { ui } from "./i18n";
import { Notice, PageHeader } from "./components";
import { naira } from "./format";

const BILL_ICONS = { electricity: "bolt", water: "water", internet: "wifi", cable: "tv", other: "receipt" };
const BILL_TYPE_LABELS = { electricity: "billTypeElectricity", water: "billTypeWater", internet: "billTypeInternet", cable: "billTypeCable" };

const formatBillDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });

export default function BillsScreen({
  lang, fileInputRef, onImageUpload, isScanning, scannedBill, notice, onDismissNotice,
  amount, onAmountChange, onPay, isPaying,
}) {
  const tr = (key, ...args) => ui(key, lang, ...args);
  const amountValue = Number(String(amount).replace(/[₦,\s]/g, ""));
  const canPay = Number.isFinite(amountValue) && amountValue > 0 && !isPaying;
  const pickPhoto = () => fileInputRef.current?.click();

  const rows = scannedBill
    ? [
        ["accountNumber", scannedBill.accountNumber],
        ["meterNumber", scannedBill.meterNumber],
        ["customerName", scannedBill.customerName],
        // The period is already shown under the provider when the bill type is known.
        ["billPeriod", BILL_TYPE_LABELS[scannedBill.billType] ? null : scannedBill.billPeriod],
        ["package", scannedBill.package],
        ["dueDate", scannedBill.dueDate && formatBillDate(scannedBill.dueDate) + (scannedBill.overdue ? ` · ${tr("overdue")}` : ""), scannedBill.overdue],
      ].filter(([, value]) => value)
    : [];

  return (
    <section className="screen">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onImageUpload}
        hidden
      />

      <PageHeader
        title={scannedBill && !isScanning ? tr("billsTitle") : tr("billTitle")}
        subtitle={scannedBill && !isScanning ? tr("billsCheckSubtitle") : tr("billSubtitle")}
      />

      {notice && !isScanning && (
        <div style={{ marginBottom: 14 }}>
          <Notice kind={notice.kind} onDismiss={onDismissNotice} lang={lang}>{notice.text}</Notice>
        </div>
      )}

      {isScanning && (
        <div className="scanning" role="status">
          <div className="spinner" aria-hidden="true"></div>
          <h2>{tr("scanningTitle")}</h2>
          <p>{tr("scanningHint")}</p>
        </div>
      )}

      {!scannedBill && !isScanning && (
        <>
          <button type="button" className="upload-area" onClick={pickPhoto}>
            <span className="upload-icon"><Icon name="camera" size={32} /></span>
            <span className="upload-title">{tr("uploadTitle")}</span>
            <span className="upload-hint">{tr("uploadHint")}</span>
          </button>

          <div className="bill-types">
            {Object.entries(BILL_TYPE_LABELS).map(([type, key]) => (
              <div key={type} className="card bill-type">
                <span className="bill-type-icon"><Icon name={BILL_ICONS[type]} size={20} /></span>
                {tr(key)}
              </div>
            ))}
          </div>

          <div className="info-box">
            <h2>{tr("howItWorks")}</h2>
            <ol>
              <li>{tr("billStep1")}</li>
              <li>{tr("billStep2")}</li>
              <li>{tr("billStep3")}</li>
              <li>{tr("billStep4")}</li>
            </ol>
          </div>
        </>
      )}

      {scannedBill && !isScanning && (
        <>
          <article className="card bill-card">
            <div className="bill-head">
              <span className="bill-type-icon" style={{ width: 48, height: 48, borderRadius: 14 }}>
                <Icon name={BILL_ICONS[scannedBill.billType] || "receipt"} size={24} />
              </span>
              <div>
                <div className="bill-provider">{scannedBill.provider}</div>
                {BILL_TYPE_LABELS[scannedBill.billType] && (
                  <div className="meta">
                    {tr(BILL_TYPE_LABELS[scannedBill.billType])}
                    {scannedBill.billPeriod ? ` · ${scannedBill.billPeriod}` : ""}
                  </div>
                )}
              </div>
            </div>
            {scannedBill.amount && (
              <div className="bill-amount-block">
                <span className="meta">{tr("amountDue")}</span>
                <span className="bill-amount">{naira(scannedBill.amount)}</span>
              </div>
            )}
            <dl className="bill-rows">
              {rows.map(([key, value, late]) => (
                <div key={key} className="bill-row">
                  <dt>{tr(key)}</dt>
                  <dd className={late ? "is-late" : undefined}>{value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <div className="field">
            <label className="field-label" htmlFor="bill-amount">{tr("amountToPay")}</label>
            <input
              id="bill-amount"
              className="input input--big"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder={tr("amountPlaceholder")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onPay} disabled={!canPay}>
              {isPaying ? tr("paying") : canPay ? tr("payNow", naira(amountValue)) : tr("enterAmount")}
            </button>
            <button type="button" className="btn btn-secondary btn-block" onClick={pickPhoto}>
              <Icon name="camera" size={18} />
              {tr("scanAnother")}
            </button>
          </div>
          <p className="fine-print">{tr("billSecurity")}</p>
        </>
      )}
    </section>
  );
}
