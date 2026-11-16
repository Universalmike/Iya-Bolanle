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
  historyFailed: {
    english: () => `I couldn't fetch your transaction history. Please try again.`,
    pidgin: () => `I no fit bring your transaction history. Abeg try again.`,
    yoruba: () => `Mi o le mu itan idunadura re wa. Jowo gbiyanju lekan si.`,
    igbo: () => `Enweghi m ike iweta akuko azumahia gi. Biko gbalia ozo.`,
    hausa: () => `Ban iya kawo tarihin cinikin ka ba. Don Allah ka sake gwadawa.`,
  },

  // ----- Language -----
  languageChanged: {
    english: (name) => `Okay! I'll speak ${name} from now on.`,
    pidgin: (name) => `No wahala! I go dey talk ${name} from now.`,
    yoruba: (name) => `O dara! Maa maa so ${name} lati isisiyi lo.`,
    igbo: (name) => `O di mma! M ga-asu ${name} site ugbu a gaa n'ihu.`,
    hausa: (name) => `To! Zan rika magana da ${name} daga yanzu.`,
  },
  languageAuto: {
    english: () => `Okay! I'll reply in whatever language you use.`,
    pidgin: () => `No wahala! Any language wey you talk, na im I go take answer you.`,
    yoruba: () => `O dara! Maa fi ede ti o ba lo da o lohun.`,
    igbo: () => `O di mma! M ga-aza gi n'asusu obula i jiri.`,
    hausa: () => `To! Zan amsa maka da duk harshen da ka yi amfani da shi.`,
  },
  invalidLanguage: {
    english: () => `Please choose English, Pidgin, Yoruba, Igbo, Hausa or Auto.`,
    pidgin: () => `Abeg choose English, Pidgin, Yoruba, Igbo, Hausa or Auto.`,
    yoruba: () => `Jowo yan English, Pidgin, Yoruba, Igbo, Hausa tabi Auto.`,
    igbo: () => `Biko horo English, Pidgin, Yoruba, Igbo, Hausa ma o bu Auto.`,
    hausa: () => `Don Allah ka zabi English, Pidgin, Yoruba, Igbo, Hausa ko Auto.`,
  },

  // ----- Auth -----
  welcome: {
    english: (name) => `Hi ${name}! I'm SARA. I speak English, Pidgin, Yoruba, Igbo, and Hausa. I can help with payments, savings, and financial advice!`,
    pidgin: (name) => `How far ${name}! Na me be SARA. I sabi English, Pidgin, Yoruba, Igbo and Hausa. I fit help you with payment, savings and money advice!`,
    yoruba: (name) => `Bawo ni ${name}! Emi ni SARA. Mo n so English, Pidgin, Yoruba, Igbo ati Hausa. Mo le ran e lowo pelu isanwo, ifowopamo ati imoran owo!`,
    igbo: (name) => `Ndewo ${name}! Abu m SARA. Ana m asu English, Pidgin, Yoruba, Igbo na Hausa. Enwere m ike inyere gi aka n'ikwu ugwo, ichekwa ego na ndumodu gbasara ego!`,
    hausa: (name) => `Sannu ${name}! Ni ce SARA. Ina magana da English, Pidgin, Yoruba, Igbo da Hausa. Zan iya taimaka maka da biyan kudi, ajiya da shawarar kudi!`,
  },
  welcomeBack: {
    english: (name, bal) => `Welcome back, ${name}! Your balance is ${naira(bal)}. How can I help?`,
    pidgin: (name, bal) => `Welcome back, ${name}! Your balance na ${naira(bal)}. Wetin I fit do for you?`,
    yoruba: (name, bal) => `E kaabo pada, ${name}! Owo re je ${naira(bal)}. Bawo ni mo se le ran e lowo?`,
    igbo: (name, bal) => `Nnoo ozo, ${name}! Ego gi bu ${naira(bal)}. Kedu ka m ga-esi nyere gi aka?`,
    hausa: (name, bal) => `Barka da dawowa, ${name}! Kudin ka shine ${naira(bal)}. Yaya zan taimake ka?`,
  },
  usernameInvalid: {
    english: () => `Username must be 3-20 characters: letters, numbers, _ or . only.`,
    pidgin: () => `Username suppose get 3 to 20 characters: letters, numbers, _ or . only.`,
    yoruba: () => `Oruko olumulo gbodo je ami 3 si 20: leta, nomba, _ tabi . nikan.`,
    igbo: () => `Aha njirimara kwesiri inwe mkpuruedemede 3 ruo 20: mkpuruedemede, onuogugu, _ ma o bu . naani.`,
    hausa: () => `Sunan mai amfani ya kasance haruffa 3 zuwa 20: haruffa, lambobi, _ ko . kawai.`,
  },
  passwordTooShort: {
    english: (min) => `Password must be at least ${min} characters.`,
    pidgin: (min) => `Password suppose get at least ${min} characters.`,
    yoruba: (min) => `Oro igbaniwole gbodo ni o kere ju ami ${min}.`,
    igbo: (min) => `Okwuntughe kwesiri inwe opekata mpe mkpuruedemede ${min}.`,
    hausa: (min) => `Kalmar sirri ta kasance aqalla haruffa ${min}.`,
  },
  passwordTooLong: {
    english: (max) => `Password must be at most ${max} characters.`,
    pidgin: (max) => `Password no suppose pass ${max} characters.`,
    yoruba: (max) => `Oro igbaniwole ko gbodo ju ami ${max} lo.`,
    igbo: (max) => `Okwuntughe ekwesighi ika mkpuruedemede ${max}.`,
    hausa: (max) => `Kalmar sirri kada ta wuce haruffa ${max}.`,
  },
  usernameTaken: {
    english: () => `That username already exists. Please choose another.`,
    pidgin: () => `Person don already take that username. Abeg choose another one.`,
    yoruba: () => `Elomiran ti lo oruko olumulo yen. Jowo yan omiran.`,
    igbo: () => `Onye ozo ejirila aha njirimara ahu. Biko horo ozo.`,
    hausa: () => `Wani ya riga ya dauki wannan sunan. Don Allah ka zabi wani.`,
  },
  signupSuccess: {
    english: () => `Account created successfully! You can now log in.`,
    pidgin: () => `Your account don ready! You fit login now.`,
    yoruba: () => `A ti se akanti re! O le wole bayi.`,
    igbo: () => `Emepela akauntu gi! I nwere ike ibanye ugbu a.`,
    hausa: () => `An bude asusun ka! Za ka iya shiga yanzu.`,
  },
  signupFailed: {
    english: () => `Signup failed. Please try again.`,
    pidgin: () => `Signup no work. Abeg try again.`,
    yoruba: () => `Iforukosile ko yori. Jowo gbiyanju lekan si.`,
    igbo: () => `Ndebanye aha agaghi nke oma. Biko gbalia ozo.`,
    hausa: () => `Rajista ba ta yi nasara ba. Don Allah ka sake gwadawa.`,
  },
  tooManySignups: {
    english: (min) => `Too many signups. Try again in ${min} minutes.`,
    pidgin: (min) => `Too many signup. Try again after ${min} minutes.`,
    yoruba: (min) => `Iforukosile ti po ju. Gbiyanju lehin iseju ${min}.`,
    igbo: (min) => `Ndebanye aha adiela otutu. Gbalia ozo mgbe nkeji ${min} gachara.`,
    hausa: (min) => `Rajista ta yi yawa. Ka sake gwadawa bayan minti ${min}.`,
  },
  credentialsRequired: {
    english: () => `Please enter both username and password.`,
    pidgin: () => `Abeg put your username and password.`,
    yoruba: () => `Jowo te oruko olumulo ati oro igbaniwole re.`,
    igbo: () => `Biko tinye aha njirimara na okwuntughe gi.`,
    hausa: () => `Don Allah ka saka sunan mai amfani da kalmar sirri.`,
  },
  invalidCredentials: {
    english: () => `Invalid username or password.`,
    pidgin: () => `Username or password no correct.`,
    yoruba: () => `Oruko olumulo tabi oro igbaniwole ko tona.`,
    igbo: () => `Aha njirimara ma o bu okwuntughe ezighi ezi.`,
    hausa: () => `Sunan mai amfani ko kalmar sirri ba daidai ba ne.`,
  },
  tooManyLogins: {
    english: (min) => `Too many failed attempts. Try again in ${min} minutes.`,
    pidgin: (min) => `You don try too many times. Try again after ${min} minutes.`,
    yoruba: (min) => `O ti gbiyanju ju. Gbiyanju lehin iseju ${min}.`,
    igbo: (min) => `I nwaala ugboro ole na ole. Gbalia ozo mgbe nkeji ${min} gachara.`,
    hausa: (min) => `Ka gwada sau da yawa. Ka sake gwadawa bayan minti ${min}.`,
  },
  loginFailed: {
    english: () => `Login failed. Please try again.`,
    pidgin: () => `Login no work. Abeg try again.`,
    yoruba: () => `Iwole ko yori. Jowo gbiyanju lekan si.`,
    igbo: () => `Nbanye agaghi nke oma. Biko gbalia ozo.`,
    hausa: () => `Shiga ba ta yi nasara ba. Don Allah ka sake gwadawa.`,
  },
  accountNotFound: {
    english: () => `Account not found. Please log in again.`,
    pidgin: () => `I no see your account. Abeg login again.`,
    yoruba: () => `A ko ri akanti re. Jowo wole lekan si.`,
    igbo: () => `Achoghi akauntu gi. Biko banye ozo.`,
    hausa: () => `Ba a sami asusun ka ba. Don Allah ka sake shiga.`,
  },

  // ----- General -----
  missingText: {
    english: () => `Please type or say something.`,
    pidgin: () => `Abeg type or talk something.`,
    yoruba: () => `Jowo ko tabi so nkan.`,
    igbo: () => `Biko dee ma o bu kwuo ihe.`,
    hausa: () => `Don Allah ka rubuta ko ka fadi wani abu.`,
  },
  serverError: {
    english: () => `Something went wrong on my side. Please try again.`,
    pidgin: () => `Something spoil for my side. Abeg try again.`,
    yoruba: () => `Nkan baje ni odo mi. Jowo gbiyanju lekan si.`,
    igbo: () => `Ihe mebiri n'aka m. Biko gbalia ozo.`,
    hausa: () => `Wani abu ya lalace a bangare na. Don Allah ka sake gwadawa.`,
  },

  // ----- AI advice -----
  aiUnavailable: {
    english: () => `I'd love to give you financial advice, but my AI brain needs to be activated first. Ask your admin to add a Gemini API key!`,
    pidgin: () => `I wan give you advice, but my AI brain never activate yet. Tell your admin make e add Gemini API key!`,
    yoruba: () => `Mo fẹ́ fún ọ ní ìmọ̀ràn, ṣùgbọ́n kò tí ì múlẹ̀. Sọ fún admin láti fi API key sí!`,
    igbo: () => `Achọrọ m inye gị ndụmọdụ, mana AI m amalitebeghị. Gwa admin ka o tinye Gemini API key!`,
    hausa: () => `Ina so in ba ka shawara, amma AI na bai fara aiki ba. Gaya wa admin ya sanya Gemini API key!`,
  },
  aiError: {
    english: () => `Sorry, I'm having trouble connecting to my AI brain. Try again in a moment!`,
    pidgin: () => `Sorry o! My AI brain no dey work well now. Try again small!`,
    yoruba: () => `Má bínú! AI mi kò ṣiṣẹ́ dáadáa báyìí. Gbìyànjú padà!`,
    igbo: () => `Ndo! AI m anaghị arụ ọrụ ugbu a. Gbalịa ọzọ!`,
    hausa: () => `Yi hakuri! AI na baya aiki sosai yanzu. Sake gwadawa!`,
  },

  // ----- Bills -----
  billImageMissing: {
    english: () => `Please upload a photo of your bill.`,
    pidgin: () => `Abeg upload picture of your bill.`,
    yoruba: () => `Jowo gbe aworan iwe owo re soke.`,
    igbo: () => `Biko bulite foto akwukwo ugwo gi.`,
    hausa: () => `Don Allah ka loda hoton takardar biyan ka.`,
  },
  billScanned: {
    english: (type, amt) => `I've scanned your ${type} bill! Amount: ${naira(amt)}`,
    pidgin: (type, amt) => `I don scan your ${type} bill! The amount na ${naira(amt)}`,
    yoruba: (type, amt) => `Mo ti ka iwe owo ${type} re! Iye re je ${naira(amt)}`,
    igbo: (type, amt) => `Agukwala m akwukwo ugwo ${type} gi! Ego ya bu ${naira(amt)}`,
    hausa: (type, amt) => `Na duba takardar biyan ${type} ka! Kudin shine ${naira(amt)}`,
  },
  billInvalid: {
    english: () => `Those bill details don't look right. Please scan the bill again.`,
    pidgin: () => `The bill details no correct. Abeg scan the bill again.`,
    yoruba: () => `Alaye iwe owo yen ko dabi eni pe o tona. Jowo tun ka a.`,
    igbo: () => `Nkowa akwukwo ugwo ahu adighi ka o ziri ezi. Biko gua ya ozo.`,
    hausa: () => `Bayanan takardar ba su yi daidai ba. Don Allah ka sake duba ta.`,
  },
  billPaid: {
    english: (provider, amt, bal) => `Done! Your ${provider} bill of ${naira(amt)} has been paid. New balance: ${naira(bal)}.`,
    pidgin: (provider, amt, bal) => `E don do! I don pay your ${provider} bill of ${naira(amt)}. Your new balance na ${naira(bal)}.`,
    yoruba: (provider, amt, bal) => `O ti pari! A ti san owo ${provider} re ti ${naira(amt)}. Owo to ku fun e ni ${naira(bal)}.`,
    igbo: (provider, amt, bal) => `O gwula! Akwuola m ugwo ${provider} gi nke ${naira(amt)}. Ego gi foduru bu ${naira(bal)}.`,
    hausa: (provider, amt, bal) => `An gama! An biya kudin ${provider} na ${naira(amt)}. Sabon kudin ka shine ${naira(bal)}.`,
  },
  paymentFailed: {
    english: () => `Payment failed. Please try again.`,
    pidgin: () => `Payment no go. Abeg try again.`,
    yoruba: () => `Isanwo ko yori. Jowo gbiyanju lekan si.`,
    igbo: () => `Ikwu ugwo agaghi nke oma. Biko gbalia ozo.`,
    hausa: () => `Biyan kudi bai yi nasara ba. Don Allah ka sake gwadawa.`,
  },

  // ----- Esusu -----
  groupNameInvalid: {
    english: () => `Group name must be 1-50 characters.`,
    pidgin: () => `Group name suppose get 1 to 50 characters.`,
    yoruba: () => `Oruko egbe gbodo je ami 1 si 50.`,
    igbo: () => `Aha otu kwesiri inwe mkpuruedemede 1 ruo 50.`,
    hausa: () => `Sunan kungiya ya kasance haruffa 1 zuwa 50.`,
  },
  esusuAmountInvalid: {
    english: (max) => `Amount per person must be between ₦1 and ${naira(max)}.`,
    pidgin: (max) => `Amount for each person suppose dey between ₦1 and ${naira(max)}.`,
    yoruba: (max) => `Iye owo fun eniyan kookan gbodo wa laarin ₦1 ati ${naira(max)}.`,
    igbo: (max) => `Ego onye obula kwesiri ino n'etiti ₦1 na ${naira(max)}.`,
    hausa: (max) => `Kudin kowane mutum ya kasance tsakanin ₦1 da ${naira(max)}.`,
  },
  esusuFrequencyInvalid: {
    english: () => `Frequency must be daily, weekly or monthly.`,
    pidgin: () => `Choose daily, weekly or monthly.`,
    yoruba: () => `Yan ojoojumo (daily), osoose (weekly) tabi osoosu (monthly).`,
    igbo: () => `Horo kwa ubochi (daily), kwa izu (weekly) ma o bu kwa onwa (monthly).`,
    hausa: () => `Ka zabi kullum (daily), mako-mako (weekly) ko wata-wata (monthly).`,
  },
  esusuMembersInvalid: {
    english: (min, max) => `A group needs between ${min} and ${max} members.`,
    pidgin: (min, max) => `Group suppose get between ${min} and ${max} members.`,
    yoruba: (min, max) => `Egbe gbodo ni omo egbe laarin ${min} si ${max}.`,
    igbo: (min, max) => `Otu kwesiri inwe ndi otu n'etiti ${min} na ${max}.`,
    hausa: (min, max) => `Kungiya tana bukatar mambobi tsakanin ${min} da ${max}.`,
  },
  groupCreated: {
    english: (name) => `Great! Your esusu group "${name}" has been created!`,
    pidgin: (name) => `Correct! Your esusu group "${name}" don ready!`,
    yoruba: (name) => `O dara! A ti da egbe esusu re "${name}" sile!`,
    igbo: (name) => `O di mma! Emepela otu esusu gi "${name}"!`,
    hausa: (name) => `Madalla! An kirkiri kungiyar adashe "${name}"!`,
  },
  groupNameTaken: {
    english: () => `A group with that name already exists.`,
    pidgin: () => `Group wey get that name don already dey.`,
    yoruba: () => `Egbe kan ti ni oruko yen tele.`,
    igbo: () => `Otu nwere aha ahu adilarila.`,
    hausa: () => `Akwai kungiya mai wannan sunan tuni.`,
  },
  groupCreateFailed: {
    english: () => `Could not create the group. Please try again.`,
    pidgin: () => `I no fit create the group. Abeg try again.`,
    yoruba: () => `Mi o le da egbe naa sile. Jowo gbiyanju lekan si.`,
    igbo: () => `Enweghi m ike imeputa otu ahu. Biko gbalia ozo.`,
    hausa: () => `Ban iya kirkirar kungiyar ba. Don Allah ka sake gwadawa.`,
  },
  groupNotFound: {
    english: (name) => `Group "${name}" not found.`,
    pidgin: (name) => `I no see group "${name}".`,
    yoruba: (name) => `A ko ri egbe "${name}".`,
    igbo: (name) => `Achoghi otu "${name}".`,
    hausa: (name) => `Ba a sami kungiyar "${name}" ba.`,
  },
  alreadyMember: {
    english: () => `You're already in this group!`,
    pidgin: () => `You don already join this group!`,
    yoruba: () => `O ti wa ninu egbe yii tele!`,
    igbo: () => `I nolarila n'otu a!`,
    hausa: () => `Kana cikin wannan kungiya tuni!`,
  },
  groupFull: {
    english: () => `Sorry, this group is full!`,
    pidgin: () => `Sorry, this group don full!`,
    yoruba: () => `Ma binu, egbe yii ti kun!`,
    igbo: () => `Ndo, otu a ejupuola!`,
    hausa: () => `Yi hakuri, wannan kungiya ta cika!`,
  },
  joinedGroup: {
    english: (name, pos) => `Welcome to "${name}"! You're member #${pos}.`,
    pidgin: (name, pos) => `Welcome to "${name}"! You be member number ${pos}.`,
    yoruba: (name, pos) => `E kaabo si "${name}"! Iwo ni omo egbe ${pos}.`,
    igbo: (name, pos) => `Nnoo na "${name}"! I bu onye otu nke ${pos}.`,
    hausa: (name, pos) => `Barka da zuwa "${name}"! Kai ne mamba na ${pos}.`,
  },
  joinFailed: {
    english: () => `Could not join the group. Please try again.`,
    pidgin: () => `I no fit join you to the group. Abeg try again.`,
    yoruba: () => `Mi o le fi o kun egbe naa. Jowo gbiyanju lekan si.`,
    igbo: () => `Enweghi m ike itinye gi n'otu ahu. Biko gbalia ozo.`,
    hausa: () => `Ban iya saka ka cikin kungiyar ba. Don Allah ka sake gwadawa.`,
  },
  notMember: {
    english: () => `You're not a member of this group!`,
    pidgin: () => `You no be member of this group!`,
    yoruba: () => `O ki i se omo egbe yii!`,
    igbo: () => `I so ghi n'otu a!`,
    hausa: () => `Ba ka cikin wannan kungiya!`,
  },
  groupBadAmount: {
    english: () => `This group has an invalid contribution amount.`,
    pidgin: () => `The contribution amount for this group no correct.`,
    yoruba: () => `Iye owo idasi egbe yii ko tona.`,
    igbo: () => `Ego ntinye otu a ezighi ezi.`,
    hausa: () => `Kudin gudummawar wannan kungiya ba daidai ba ne.`,
  },
  contributed: {
    english: (amt, name, bal) => `Done! You've contributed ${naira(amt)} to "${name}". New balance: ${naira(bal)}.`,
    pidgin: (amt, name, bal) => `E don do! You don put ${naira(amt)} for "${name}". Your new balance na ${naira(bal)}.`,
    yoruba: (amt, name, bal) => `O ti pari! O ti da ${naira(amt)} si "${name}". Owo to ku fun e ni ${naira(bal)}.`,
    igbo: (amt, name, bal) => `O gwula! I tinyela ${naira(amt)} na "${name}". Ego gi foduru bu ${naira(bal)}.`,
    hausa: (amt, name, bal) => `An gama! Ka saka ${naira(amt)} a "${name}". Sabon kudin ka shine ${naira(bal)}.`,
  },
  contributeFailed: {
    english: () => `Contribution failed. Please try again.`,
    pidgin: () => `Contribution no go. Abeg try again.`,
    yoruba: () => `Idasi ko yori. Jowo gbiyanju lekan si.`,
    igbo: () => `Ntinye agaghi nke oma. Biko gbalia ozo.`,
    hausa: () => `Gudummawa ba ta yi nasara ba. Don Allah ka sake gwadawa.`,
  },
  groupsFetchFailed: {
    english: () => `Could not load your groups.`,
    pidgin: () => `I no fit load your groups.`,
    yoruba: () => `Mi o le gbe awon egbe re wa.`,
    igbo: () => `Enweghi m ike iweta otu gi.`,
    hausa: () => `Ban iya kawo kungiyoyin ka ba.`,
  },
};

// Words used inside other messages
const BILL_TYPES = {
  electricity: { english: "electricity", pidgin: "light", yoruba: "ina monamona", igbo: "oku eletrik", hausa: "wutar lantarki" },
  water: { english: "water", pidgin: "water", yoruba: "omi", igbo: "mmiri", hausa: "ruwa" },
};
export const billTypeName = (type, language) => BILL_TYPES[type]?.[language] ?? BILL_TYPES[type]?.english ?? type;

export const LANGUAGE_NAMES = { english: "English", pidgin: "Pidgin", yoruba: "Yorùbá", igbo: "Igbo", hausa: "Hausa" };

// t("balance", "yoruba", name, bal) — falls back to English for unknown languages.
export const t = (key, language, ...args) => {
  const entry = messages[key];
  if (!entry) throw new Error(`Unknown message key: ${key}`);
  return (entry[language] || entry.english)(...args);
};

export { naira, messages };
