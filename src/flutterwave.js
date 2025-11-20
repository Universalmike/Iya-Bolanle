// src/flutterwave.js
import axios from "axios";

const BASE_URL = "https://api.flutterwave.com/v3";
const SECRET_KEY = import.meta.env.VITE_FLUTTERWAVE_SECRET;

export const getBalance = async (accountNumber) => {
  try {
    const resp = await axios.get(`${BASE_URL}/balances`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` }
    });
    // Find account by number if multiple accounts returned
    if (resp.data?.data) {
      const acc = resp.data.data.find(a => a.account_number === accountNumber);
      return acc?.available_balance ?? 0;
    }
    return 0;
  } catch (err) {
    console.error("Flutterwave balance error:", err.message);
    return null;
  }
};

export const sendTransfer = async (accountNumber, bankCode, amount) => {
  try {
    const resp = await axios.post(`${BASE_URL}/transfers`, {
      account_number: accountNumber,
      bank_code: bankCode,
      amount,
      narration: "Owo assistant transfer",
      currency: "NGN",
      reference: "OWO_" + Date.now(),
    }, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` }
    });
    return resp.data;
  } catch (err) {
    console.error("Flutterwave transfer error:", err.message);
    return null;
  }
};

export const buyAirtime = async (phone, amount) => {
  try {
    const resp = await axios.post(`${BASE_URL}/payments`, {
      tx_ref: "OWO_AIRTIME_" + Date.now(),
      amount,
      currency: "NGN",
      payment_type: "airtime",
      phone_number: phone,
    }, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` }
    });
    return resp.data;
  } catch (err) {
    console.error("Flutterwave airtime error:", err.message);
    return null;
  }
};
