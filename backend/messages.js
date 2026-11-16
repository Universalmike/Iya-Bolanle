// All SARA reply text, keyed by message then language.
// NOTE: non-English strings should be reviewed by native speakers.

const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;

const messages = {
  balance: {
    english: (name, bal) => `Hey ${name}! Your current balance is ${naira(bal)}. Need anything else?`,
    pidgin: (name, bal) => `Oga ${name}! Your money balance na ${naira(bal)} o. Wetin you wan do again?`,
    yoruba: (name, bal) => `E ku ise ${name}! Owo to wa ninu apo re je ${naira(bal)}. Se mo le se ohun miiran fun e?`,
    igbo: (name, bal) => `Ndewo ${name}! Ego gi ugbu a bu ${naira(bal)}. O nwere ihe ozo i choro?`,
    hausa: (name, bal) => `Sannu ${name}! Kudin ka yanzu shine ${naira(bal)}. Kana bukatar wani abu?`,
  },

  confirmTransfer: {
    english: (amt, to) => `Send ${naira(amt)} to ${to}? Reply YES to confirm or NO to cancel.`,
    pidgin: (amt, to) => `You wan send ${naira(amt)} give ${to}? Talk YES make I send am, or NO to cancel.`,
    yoruba: (amt, to) => `Se ki n fi ${naira(amt)} ranse si ${to}? So BEENI lati jerisi tabi RARA lati fagile.`,
    igbo: (amt, to) => `Ka m ziga ${naira(amt)} nye ${to}? Zaa EE ka i kwado ya, ma o bu MBA ka i kagbuo ya.`,
    hausa: (amt, to) => `In tura ${naira(amt)} zuwa ga ${to}? Ka ce EH don tabbatarwa, ko A'A don sokewa.`,
  },
  confirmAirtime: {
    english: (amt, phone) => `Buy ${naira(amt)} airtime for ${phone ?? "your number"}? Reply YES to confirm or NO to cancel.`,
    pidgin: (amt, phone) => `You wan buy ${naira(amt)} airtime for ${phone ?? "your number"}? Talk YES or NO.`,
    yoruba: (amt, phone) => `Se ki n ra airtime ${naira(amt)} fun ${phone ?? "nomba re"}? So BEENI tabi RARA.`,
    igbo: (amt, phone) => `Ka m zuta airtime ${naira(amt)} maka ${phone ?? "nomba gi"}? Zaa EE ma o bu MBA.`,
    hausa: (amt, phone) => `In sayi airtime na ${naira(amt)} don ${phone ?? "lambar ka"}? Ka ce EH ko A'A.`,
  },

  transferSuccess: {
    english: (amt, to, bal) => `All done! ${naira(amt)} has been sent to ${to}. Your new balance is ${naira(bal)}.`,
    pidgin: (amt, to, bal) => `E don do! I don send ${naira(amt)} give ${to} o. Your new balance na ${naira(bal)}.`,
    yoruba: (amt, to, bal) => `O ti pari! Mo ti fi ${naira(amt)} ranse si ${to}. Owo to ku fun e ni ${naira(bal)}.`,
    igbo: (amt, to, bal) => `O gwula! Ezigala m ${naira(amt)} nye ${to}. Ego gi foduru ugbu a bu ${naira(bal)}.`,
    hausa: (amt, to, bal) => `An gama! An tura ${naira(amt)} zuwa ga ${to}. Sabon kudin ka shine ${naira(bal)}.`,
  },
  airtimeSuccess: {
    english: (amt, bal) => `Done! I've topped up ${naira(amt)} airtime for you. Your new balance is ${naira(bal)}.`,
    pidgin: (amt, bal) => `Ehen! I don buy ${naira(amt)} airtime for you o. Your new balance na ${naira(bal)}.`,
    yoruba: (amt, bal) => `O dara! Mo ti ra airtime ${naira(amt)} fun e. Owo to ku fun e ni ${naira(bal)}.`,
    igbo: (amt, bal) => `O di mma! Azutala m airtime ${naira(amt)} maka gi. Ego gi foduru ugbu a bu ${naira(bal)}.`,
    hausa: (amt, bal) => `An gama! Na saya maka airtime na ${naira(amt)}. Sabon kudin ka shine ${naira(bal)}.`,
  },

  insufficientFunds: {
    english: (bal, amt) => `Sorry, you don't have enough funds. Your balance is ${naira(bal)} but you need ${naira(amt)}.`,
    pidgin: (bal, amt) => `Sorry o, your money no reach. You get ${naira(bal)} but you need ${naira(amt)}.`,
    yoruba: (bal, amt) => `Ma binu, owo re ko to. O ni ${naira(bal)} sugbon o nilo ${naira(amt)}.`,
    igbo: (bal, amt) => `Ndo, ego gi erughi. I nwere ${naira(bal)} mana i choro ${naira(amt)}.`,
    hausa: (bal, amt) => `Yi hakuri, kudin ka bai isa ba. Kana da ${naira(bal)} amma kana bukatar ${naira(amt)}.`,
  },

  cancelled: {
    english: () => `Okay, I've cancelled that. Nothing was sent.`,
    pidgin: () => `No wahala, I don cancel am. I no send anything.`,
    yoruba: () => `O dara, mo ti fagile. Ko si owo ti a fi ranse.`,
    igbo: () => `O di mma, akagbuola m ya. O nweghi ihe ezigara.`,
    hausa: () => `To, na soke shi. Ba a tura komai ba.`,
  },
  expired: {
    english: () => `That request has expired for your safety. Please ask again.`,
    pidgin: () => `That request don expire for your safety. Abeg ask again.`,
    yoruba: () => `Ibeere yen ti pari akoko re fun aabo re. Jowo beere lekan si.`,
    igbo: () => `Aririo ahu agafeela oge ya maka nchekwa gi. Biko rio ozo.`,
    hausa: () => `Wannan bukata ta kare saboda tsaron ka. Don Allah ka sake tambaya.`,
  },
  nothingToConfirm: {
    english: () => `There's nothing waiting for confirmation. What would you like to do?`,
    pidgin: () => `Nothing dey wait for confirmation. Wetin you wan do?`,
    yoruba: () => `Ko si nkankan to n duro de ijerisi. Kini o fe se?`,
    igbo: () => `O nweghi ihe na-echere nkwado. Gini ka i choro ime?`,
    hausa: () => `Babu abin da ke jiran tabbatarwa. Me kake so ka yi?`,
  },

  askTransferAmount: {
    english: (to) => `How much do you want to send${to ? ` to ${to}` : ""}? Example: "send 1000 to john"`,
    pidgin: (to) => `How much you wan send${to ? ` give ${to}` : ""}? Example: "send 1000 to john"`,
    yoruba: (to) => `Elo ni o fe fi ranse${to ? ` si ${to}` : ""}? Apeere: "send 1000 to john"`,
    igbo: (to) => `Ego ole ka i choro iziga${to ? ` nye ${to}` : ""}? Ihe atu: "send 1000 to john"`,
    hausa: (to) => `Nawa kake so ka tura${to ? ` zuwa ga ${to}` : ""}? Misali: "send 1000 to john"`,
  },
  askRecipient: {
    english: () => `Who do you want to send money to? Example: "send 1000 to john"`,
    pidgin: () => `Na who you wan send money give? Example: "send 1000 to john"`,
    yoruba: () => `Tani o fe fi owo ranse si? Apeere: "send 1000 to john"`,
    igbo: () => `Onye ka i choro iziga ego? Ihe atu: "send 1000 to john"`,
    hausa: () => `Wa kake so ka tura wa kudi? Misali: "send 1000 to john"`,
  },
  askAirtimeAmount: {
    english: () => `How much airtime do you want? Example: "buy 200 airtime"`,
    pidgin: () => `How much airtime you want? Example: "buy 200 airtime"`,
    yoruba: () => `Elo ni airtime ti o fe? Apeere: "buy 200 airtime"`,
    igbo: () => `Ego ole ka airtime i choro di? Ihe atu: "buy 200 airtime"`,
    hausa: () => `Airtime na nawa kake so? Misali: "buy 200 airtime"`,
  },
  recipientNotFound: {
    english: (to) => `I couldn't find a user called '${to}'. Please check the username.`,
    pidgin: (to) => `I no see any user wey dem dey call '${to}'. Abeg check the username.`,
    yoruba: (to) => `Mi o ri olumulo kankan ti a n pe ni '${to}'. Jowo sayewo oruko naa.`,
    igbo: (to) => `Ahughi m onye a na-akpo '${to}'. Biko lelee aha ahu.`,
    hausa: (to) => `Ban sami mai amfani mai suna '${to}' ba. Don Allah ka duba sunan.`,
  },
  selfTransfer: {
    english: () => `You can't send money to yourself.`,
    pidgin: () => `You no fit send money give yourself.`,
    yoruba: () => `O ko le fi owo ranse si ara re.`,
    igbo: () => `I nweghi ike iziga onwe gi ego.`,
    hausa: () => `Ba za ka iya tura wa kanka kudi ba.`,
  },
  amountTooSmall: {
    english: (min) => `The minimum amount is ${naira(min)}.`,
    pidgin: (min) => `The smallest amount wey you fit use na ${naira(min)}.`,
    yoruba: (min) => `Iye ti o kere ju ni ${naira(min)}.`,
    igbo: (min) => `Ego kacha nta bu ${naira(min)}.`,
    hausa: (min) => `Mafi karancin kudi shine ${naira(min)}.`,
  },
  amountTooLarge: {
    english: (max) => `The maximum amount for one transaction is ${naira(max)}.`,
    pidgin: (max) => `The highest amount for one transaction na ${naira(max)}.`,
    yoruba: (max) => `Iye ti o ga ju fun idunadura kan ni ${naira(max)}.`,
    igbo: (max) => `Ego kacha ukwuu maka otu azumahia bu ${naira(max)}.`,
    hausa: (max) => `Mafi yawan kudi na ciniki daya shine ${naira(max)}.`,
  },

  greeting: {
    english: (name) => `Hi ${name}! How can I help with your money today?`,
    pidgin: (name) => `How far ${name}! Wetin I fit do for you today?`,
    yoruba: (name) => `Bawo ni ${name}! Bawo ni mo se le ran e lowo loni?`,
    igbo: (name) => `Ndewo ${name}! Kedu ka m ga-esi nyere gi aka taa?`,
    hausa: (name) => `Sannu ${name}! Yaya zan taimake ka yau?`,
  },
  help: {
    english: () => `I can check your balance, buy airtime, send money, show your history, or give financial advice. Try "send 1000 to john".`,
    pidgin: () => `I fit check your balance, buy airtime, send money, show your history, or give you money advice. Try "send 1000 to john".`,
    yoruba: () => `Mo le wo owo re, ra airtime, fi owo ranse, fi itan idunadura han e, tabi fun e ni imoran owo.`,
    igbo: () => `Enwere m ike ilele ego gi, zuta airtime, ziga ego, gosi gi akuko azumahia gi, ma o bu nye gi ndumodu gbasara ego.`,
    hausa: () => `Zan iya duba kudin ka, sayi airtime, tura kudi, nuna tarihin ka, ko ba ka shawara kan kudi.`,
  },

  historyEmpty: {
    english: () => `You don't have any transactions yet.`,
    pidgin: () => `You never do any transaction yet.`,
    yoruba: () => `O ko tii ni idunadura kankan.`,
    igbo: () => `I nwebeghi azumahia o bula.`,
    hausa: () => `Ba ka da wani ciniki tukuna.`,
  },
  historyHeader: {
    english: () => `📊 Here's your recent transaction history:`,
    pidgin: () => `📊 See your recent transactions:`,
    yoruba: () => `📊 Eyi ni awon idunadura re to sese:`,
    igbo: () => `📊 Lee azumahia gi ndi na-adi nso:`,
    hausa: () => `📊 Ga tarihin cinikin ka na kwanan nan:`,
  },
};

// t("balance", "yoruba", name, bal) — falls back to English for unknown languages.
export const t = (key, language, ...args) => {
  const entry = messages[key];
  if (!entry) throw new Error(`Unknown message key: ${key}`);
  return (entry[language] || entry.english)(...args);
};

export { naira };
