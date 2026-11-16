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
  billImageInvalid: {
    english: () => `I can't open that picture. Please send a JPG or PNG photo under 4MB.`,
    pidgin: () => `I no fit open that picture. Abeg send JPG or PNG photo wey no pass 4MB.`,
    yoruba: () => `Mi o le si aworan yen. Jowo fi aworan JPG tabi PNG ti ko ju 4MB lo ranse.`,
    igbo: () => `Enweghi m ike imeghe foto ahu. Biko ziga foto JPG ma obu PNG nke na-erughi 4MB.`,
    hausa: () => `Ba zan iya bude wannan hoton ba. Don Allah ka aiko hoton JPG ko PNG da bai wuce 4MB ba.`,
  },
  billScannerUnavailable: {
    english: () => `The bill scanner isn't available right now. Please try again later.`,
    pidgin: () => `Bill scanner no dey work now. Abeg try again later.`,
    yoruba: () => `Ero ti n ka iwe owo ko si lowo bayii. Jowo gbiyanju nigba miiran.`,
    igbo: () => `Igwe na-agu akwukwo ugwo adighi ugbu a. Biko gbalia ma emechaa.`,
    hausa: () => `Na'urar duba takardar biya ba ta samuwa yanzu. Don Allah ka sake gwadawa anjima.`,
  },
  tooManyScans: {
    english: (mins) => `You've scanned a lot of bills. Please wait ${mins} minute(s) and try again.`,
    pidgin: (mins) => `You don scan plenty bills. Abeg wait ${mins} minute(s) then try again.`,
    yoruba: (mins) => `O ti ka opolopo iwe owo. Jowo duro fun iseju ${mins} ki o to tun gbiyanju.`,
    igbo: (mins) => `I guola otutu akwukwo ugwo. Biko chere nkeji ${mins} wee gbalia ozo.`,
    hausa: (mins) => `Ka duba takardu da yawa. Don Allah ka jira minti ${mins} sannan ka sake gwadawa.`,
  },
  billScanFailed: {
    english: () => `I couldn't read the bill just now. Please try again.`,
    pidgin: () => `I no fit read the bill now. Abeg try again.`,
    yoruba: () => `Mi o le ka iwe owo naa bayii. Jowo gbiyanju lekan si.`,
    igbo: () => `Enweghi m ike igu akwukwo ugwo ahu ugbu a. Biko gbalia ozo.`,
    hausa: () => `Ban iya karanta takardar yanzu ba. Don Allah ka sake gwadawa.`,
  },
  notABill: {
    english: () => `That doesn't look like a bill. Please take a photo of the bill itself.`,
    pidgin: () => `That one no be bill o. Abeg snap the bill itself.`,
    yoruba: () => `Iyen ko dabi iwe owo. Jowo ya aworan iwe owo naa gan-an.`,
    igbo: () => `Nke ahu adighi ka akwukwo ugwo. Biko see foto akwukwo ugwo ahu n'onwe ya.`,
    hausa: () => `Wannan ba ya kama da takardar biya ba. Don Allah ka dauki hoton takardar kanta.`,
  },
  billUnreadable: {
    english: () => `I couldn't read the provider and account number clearly. Please take a sharper photo in good light, with the whole bill in view.`,
    pidgin: () => `I no fit see the company and account number well. Abeg snap am again for better light, make the whole bill show.`,
    yoruba: () => `Mi o ri oruko ile ise ati nomba account naa daadaa. Jowo ya aworan to mo kedere ni ibi ti ina wa, ki gbogbo iwe naa han.`,
    igbo: () => `Ahughi m aha ulo oru na nomba akaunti nke oma. Biko see foto doro anya n'ebe enwere ihe, ka akwukwo ahu niile puta.`,
    hausa: () => `Ban ga sunan kamfanin da lambar asusu sosai ba. Don Allah ka dauki hoto mai kyau a wurin da haske, duk takardar ta bayyana.`,
  },
  billScanned: {
    english: (provider, type, amt) => `I've read your ${provider} ${type} bill. Amount due: ${naira(amt)}. Check the details, then tap Pay.`,
    pidgin: (provider, type, amt) => `I don read your ${provider} ${type} bill. Wetin you go pay na ${naira(amt)}. Check am well, then press Pay.`,
    yoruba: (provider, type, amt) => `Mo ti ka iwe owo ${type} ${provider} re. Iye to ye ko san je ${naira(amt)}. Wo alaye re, ki o si te Pay.`,
    igbo: (provider, type, amt) => `Aguola m akwukwo ugwo ${type} ${provider} gi. Ego i ga-akwu bu ${naira(amt)}. Lelee nkowa ya, wee pia Pay.`,
    hausa: (provider, type, amt) => `Na karanta takardar biyan ${type} ta ${provider}. Kudin da za ka biya shine ${naira(amt)}. Duba bayanan, sannan ka danna Pay.`,
  },
  billScannedNoAmount: {
    english: (provider, type) => `I've read your ${provider} ${type} bill, but there's no amount on it. Enter how much you want to pay.`,
    pidgin: (provider, type) => `I don read your ${provider} ${type} bill, but amount no dey there. Put how much you wan pay.`,
    yoruba: (provider, type) => `Mo ti ka iwe owo ${type} ${provider} re, sugbon ko si iye owo lori re. Te iye ti o fe san.`,
    igbo: (provider, type) => `Aguola m akwukwo ugwo ${type} ${provider} gi, mana o nweghi ego edere na ya. Tinye ego i choro ikwu.`,
    hausa: (provider, type) => `Na karanta takardar biyan ${type} ta ${provider}, amma babu adadin kudi a kai. Shigar da nawa kake so ka biya.`,
  },
  billOverdue: {
    english: (date) => `⚠️ It was due on ${date}.`,
    pidgin: (date) => `⚠️ E suppose don pay since ${date}.`,
    yoruba: (date) => `⚠️ O ye ko ti san ni ${date}.`,
    igbo: (date) => `⚠️ O kwesiri ka akwuo ya na ${date}.`,
    hausa: (date) => `⚠️ Ya kamata a biya a ${date}.`,
  },
  billMaybePaid: {
    english: (amt, date) => `Heads up: you paid what looks like this same bill (${naira(amt)}) on ${date}.`,
    pidgin: (amt, date) => `Shine your eye: e be like you don pay this same bill (${naira(amt)}) on ${date}.`,
    yoruba: (amt, date) => `Kiyesi: o dabi pe o ti san iwe owo yii kan naa (${naira(amt)}) ni ${date}.`,
    igbo: (amt, date) => `Lezie anya: o yiri ka i kwuola otu akwukwo ugwo a (${naira(amt)}) na ${date}.`,
    hausa: (amt, date) => `Lura: kamar ka riga ka biya wannan takardar (${naira(amt)}) a ${date}.`,
  },
  billAlreadyPaid: {
    english: () => `This bill has already been paid.`,
    pidgin: () => `Dem don pay this bill already.`,
    yoruba: () => `A ti san iwe owo yii tele.`,
    igbo: () => `Akwuola ugwo a ugbua.`,
    hausa: () => `An riga an biya wannan takardar.`,
  },
  billExpired: {
    english: () => `This scan has expired. Please scan the bill again.`,
    pidgin: () => `This scan don expire. Abeg scan the bill again.`,
    yoruba: () => `Ayewo yii ti pe ju. Jowo tun ka iwe owo naa.`,
    igbo: () => `Ngugo a agafeela oge. Biko gua akwukwo ugwo ahu ozo.`,
    hausa: () => `Lokacin wannan dubawa ya kare. Don Allah ka sake duba takardar.`,
  },
  billAmountNeeded: {
    english: () => `Please enter the amount you want to pay.`,
    pidgin: () => `Abeg put the amount wey you wan pay.`,
    yoruba: () => `Jowo te iye owo ti o fe san.`,
    igbo: () => `Biko tinye ego i choro ikwu.`,
    hausa: () => `Don Allah shigar da adadin da kake so ka biya.`,
  },
  billAmountInvalid: {
    english: (max) => `Please enter an amount between ${naira(1)} and ${naira(max)}.`,
    pidgin: (max) => `Abeg put amount between ${naira(1)} and ${naira(max)}.`,
    yoruba: (max) => `Jowo te iye owo laarin ${naira(1)} si ${naira(max)}.`,
    igbo: (max) => `Biko tinye ego n'etiti ${naira(1)} na ${naira(max)}.`,
    hausa: (max) => `Don Allah shigar da adadi tsakanin ${naira(1)} da ${naira(max)}.`,
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
    english: (name, code) => `Great! Your esusu group "${name}" has been created. Share the invite code ${code} so others can join.`,
    pidgin: (name, code) => `Correct! Your esusu group "${name}" don ready. Share the invite code ${code} make others join.`,
    yoruba: (name, code) => `O dara! A ti da egbe esusu re "${name}" sile. Pin koodu ifiwepe ${code} ki awon miiran le darapo.`,
    igbo: (name, code) => `O di mma! Emepela otu esusu gi "${name}". Kesaa koodu oku ${code} ka ndi ozo sonye.`,
    hausa: (name, code) => `Madalla! An kirkiri kungiyar adashe "${name}". Raba lambar gayyata ${code} don wasu su shiga.`,
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

  // ----- Esusu rounds -----
  inviteCodeInvalid: {
    english: () => `No group found with that invite code. Please check it and try again.`,
    pidgin: () => `I no see any group with that invite code. Abeg check am again.`,
    yoruba: () => `A ko ri egbe kankan pelu koodu ifiwepe yen. Jowo sayewo re.`,
    igbo: () => `Enweghi otu nwere koodu oku ahu. Biko lelee ya ozo.`,
    hausa: () => `Ba a sami kungiya mai wannan lambar gayyata ba. Don Allah ka duba ta.`,
  },
  groupAlreadyStarted: {
    english: () => `This group has already started, so that's no longer possible.`,
    pidgin: () => `This group don already start, so e no fit happen again.`,
    yoruba: () => `Egbe yii ti bere tele, nitorina eyi ko see se mo.`,
    igbo: () => `Otu a ebidola, ya mere nke a agaghi ekwe omume ozo.`,
    hausa: () => `Wannan kungiya ta riga ta fara, don haka hakan ba zai yiwu ba.`,
  },
  groupStarted: {
    english: (name, first, due) => `"${name}" has started! ${first} collects first. Round 1 contributions are due by ${due}.`,
    pidgin: (name, first, due) => `"${name}" don start! ${first} go collect first. Round 1 money suppose enter before ${due}.`,
    yoruba: (name, first, due) => `"${name}" ti bere! ${first} ni yoo koko gba. Owo iyipo kinni gbodo wole ki ${due} to de.`,
    igbo: (name, first, due) => `"${name}" ebidola! ${first} ga-ebu ugo nara. A ga-atinye ego agba nke mbu tupu ${due}.`,
    hausa: (name, first, due) => `"${name}" ta fara! ${first} ne zai fara karba. Ana bukatar kudin zagaye na farko kafin ${due}.`,
  },
  notCreator: {
    english: () => `Only the person who created the group can do that.`,
    pidgin: () => `Na only the person wey create the group fit do am.`,
    yoruba: () => `Eni to da egbe sile nikan lo le se eyi.`,
    igbo: () => `Naani onye mepere otu a nwere ike ime nke a.`,
    hausa: () => `Wanda ya kirkiri kungiyar ne kadai zai iya yin haka.`,
  },
  needTwoMembers: {
    english: () => `A group needs at least 2 members before it can start.`,
    pidgin: () => `Group need at least 2 members before e fit start.`,
    yoruba: () => `Egbe nilo o kere ju omo egbe meji ki o to bere.`,
    igbo: () => `Otu choro opekata mpe mmadu abuo tupu o bido.`,
    hausa: () => `Kungiya tana bukatar akalla mambobi 2 kafin ta fara.`,
  },
  groupNotStarted: {
    english: () => `This group hasn't started yet. Contributions open once it starts.`,
    pidgin: () => `This group never start. You go fit pay once e start.`,
    yoruba: () => `Egbe yii ko tii bere. A o le san owo titi yoo fi bere.`,
    igbo: () => `Otu a ebidobeghi. I nwere ike itinye ego ozigbo o bidoro.`,
    hausa: () => `Wannan kungiya ba ta fara ba tukuna. Za a iya biya da zarar ta fara.`,
  },
  groupIsCompleted: {
    english: () => `This group has finished all its rounds.`,
    pidgin: () => `This group don finish all im rounds.`,
    yoruba: () => `Egbe yii ti pari gbogbo iyipo re.`,
    igbo: () => `Otu a emechaala agba ya nile.`,
    hausa: () => `Wannan kungiya ta kammala dukkan zagayen ta.`,
  },
  alreadyPaidRound: {
    english: (round) => `You've already paid for round ${round}. Wait for the next round.`,
    pidgin: (round) => `You don already pay for round ${round}. Wait for the next round.`,
    yoruba: (round) => `O ti san owo iyipo ${round} tele. Duro de iyipo to kan.`,
    igbo: (round) => `I kwuola ugwo agba ${round}. Chere agba na-abia.`,
    hausa: (round) => `Ka riga ka biya na zagaye na ${round}. Jira zagaye na gaba.`,
  },
  roundProgress: {
    english: (paid, total) => `${paid} of ${total} members have paid this round.`,
    pidgin: (paid, total) => `${paid} out of ${total} members don pay for this round.`,
    yoruba: (paid, total) => `Omo egbe ${paid} ninu ${total} ti san owo iyipo yii.`,
    igbo: (paid, total) => `Mmadu ${paid} n'ime ${total} akwuola ugwo agba a.`,
    hausa: (paid, total) => `Mambobi ${paid} cikin ${total} sun biya a wannan zagaye.`,
  },
  payoutMade: {
    english: (who, amt, round) => `Everyone has paid round ${round}, so ${who} has received ${naira(amt)}! 🎉`,
    pidgin: (who, amt, round) => `Everybody don pay round ${round}, so ${who} don collect ${naira(amt)}! 🎉`,
    yoruba: (who, amt, round) => `Gbogbo eniyan ti san owo iyipo ${round}, nitorina ${who} ti gba ${naira(amt)}! 🎉`,
    igbo: (who, amt, round) => `Onye obula akwuola ugwo agba ${round}, ya mere ${who} anatala ${naira(amt)}! 🎉`,
    hausa: (who, amt, round) => `Kowa ya biya zagaye na ${round}, don haka ${who} ya karbi ${naira(amt)}! 🎉`,
  },
  groupFinished: {
    english: (name) => `That was the last round, so "${name}" is complete. Well done, everyone!`,
    pidgin: (name) => `Na the last round be that, so "${name}" don finish. Well done una!`,
    yoruba: (name) => `Iyipo to gbeyin niyen, nitorina "${name}" ti pari. E ku ise o!`,
    igbo: (name) => `Nke ahu bu agba ikpeazu, ya mere "${name}" agwula. Unu emeela!`,
    hausa: (name) => `Wannan shine zagaye na karshe, don haka "${name}" ta kammala. Madalla da ku duka!`,
  },
  leftGroup: {
    english: (name) => `You've left "${name}".`,
    pidgin: (name) => `You don comot from "${name}".`,
    yoruba: (name) => `O ti kuro ninu "${name}".`,
    igbo: (name) => `I hapula "${name}".`,
    hausa: (name) => `Ka bar "${name}".`,
  },
  groupCancelled: {
    english: (name) => `"${name}" has been cancelled.`,
    pidgin: (name) => `"${name}" don cancel.`,
    yoruba: (name) => `A ti fagile "${name}".`,
    igbo: (name) => `Akagbuola "${name}".`,
    hausa: (name) => `An soke "${name}".`,
  },
  cannotLeaveStarted: {
    english: () => `Members can't leave or be removed once the group has started.`,
    pidgin: () => `Once group don start, nobody fit comot or be removed.`,
    yoruba: () => `Ni kete ti egbe ba ti bere, eniyan ko le kuro tabi ki a yo o.`,
    igbo: () => `Ozigbo otu bidoro, onweghi onye nwere ike ihapu ma o bu a wepu ya.`,
    hausa: () => `Da zarar kungiya ta fara, ba wanda zai iya fita ko a cire shi.`,
  },
  cannotRemoveSelf: {
    english: () => `You can't remove yourself. Use Leave instead, which cancels the group.`,
    pidgin: () => `You no fit remove yourself. Use Leave, e go cancel the group.`,
    yoruba: () => `O ko le yo ara re. Lo Leave dipo, eyi to fagile egbe naa.`,
    igbo: () => `I nweghi ike iwepu onwe gi. Jiri Leave, nke ga-akagbu otu ahu.`,
    hausa: () => `Ba za ka iya cire kanka ba. Yi amfani da Leave, wanda zai soke kungiyar.`,
  },
  memberRemoved: {
    english: (who) => `${who} has been removed from the group.`,
    pidgin: (who) => `${who} don comot from the group.`,
    yoruba: (who) => `A ti yo ${who} kuro ninu egbe.`,
    igbo: (who) => `Ewepula ${who} n'otu ahu.`,
    hausa: (who) => `An cire ${who} daga kungiyar.`,
  },
  memberNotFound: {
    english: (who) => `${who} isn't a member of this group.`,
    pidgin: (who) => `${who} no be member of this group.`,
    yoruba: (who) => `${who} ki i se omo egbe yii.`,
    igbo: (who) => `${who} anoghi n'otu a.`,
    hausa: (who) => `${who} ba mamba na wannan kungiya ba ne.`,
  },
  positionsShuffled: {
    english: (name) => `The collection order for "${name}" has been shuffled.`,
    pidgin: (name) => `I don shuffle the collection order for "${name}".`,
    yoruba: (name) => `A ti da ilana gbigba owo "${name}" po.`,
    igbo: (name) => `Agbanweela usoro nnata ego nke "${name}".`,
    hausa: (name) => `An jujjuya tsarin karbar kudi na "${name}".`,
  },

  // ----- Esusu in chat -----
  esusuNoGroups: {
    english: () => `You're not in any esusu group yet. Open the Esusu tab to create or join one.`,
    pidgin: () => `You never join any esusu group. Open the Esusu tab make you create or join one.`,
    yoruba: () => `O ko tii wa ninu egbe esusu kankan. Si Esusu lati da tabi darapo mo okan.`,
    igbo: () => `I sonyebeghi n'otu isusu obula. Mepee Esusu ka i mepee ma o bu sonye n'otu.`,
    hausa: () => `Ba ka cikin wata kungiyar adashe tukuna. Bude Esusu don kirkira ko shiga daya.`,
  },
  esusuNoActive: {
    english: () => `None of your esusu groups is collecting contributions right now.`,
    pidgin: () => `None of your esusu group dey collect money now.`,
    yoruba: () => `Ko si egbe esusu re kankan to n gba owo lowolowo.`,
    igbo: () => `O nweghi otu isusu gi na-anara ego ugbu a.`,
    hausa: () => `Babu kungiyar adashe ta ka da ke karbar kudi yanzu.`,
  },
  esusuPickGroup: {
    english: (names) => `Which group? You're in: ${names.join(", ")}. Say e.g. "pay my ajo ${names[0]}".`,
    pidgin: (names) => `Which group? You dey: ${names.join(", ")}. Talk like "pay my ajo ${names[0]}".`,
    yoruba: (names) => `Egbe wo? O wa ninu: ${names.join(", ")}. So bi "pay my ajo ${names[0]}".`,
    igbo: (names) => `Otu kedu? I no na: ${names.join(", ")}. Kwuo dika "pay my ajo ${names[0]}".`,
    hausa: (names) => `Wace kungiya? Kana cikin: ${names.join(", ")}. Ka ce misali "pay my ajo ${names[0]}".`,
  },
  confirmEsusu: {
    english: (amt, name, round) => `Pay ${naira(amt)} to "${name}" for round ${round}? Reply YES to confirm or NO to cancel.`,
    pidgin: (amt, name, round) => `You wan pay ${naira(amt)} for "${name}" round ${round}? Talk YES or NO.`,
    yoruba: (amt, name, round) => `Se ki n san ${naira(amt)} si "${name}" fun iyipo ${round}? So BEENI tabi RARA.`,
    igbo: (amt, name, round) => `Ka m kwuo ${naira(amt)} na "${name}" maka agba ${round}? Zaa EE ma o bu MBA.`,
    hausa: (amt, name, round) => `In biya ${naira(amt)} zuwa "${name}" don zagaye na ${round}? Ka ce EH ko A'A.`,
  },
  esusuStatusForming: {
    english: (name, count, total, code) => `"${name}": waiting for members (${count} of ${total}). Invite code: ${code}.`,
    pidgin: (name, count, total, code) => `"${name}": still dey wait for members (${count} of ${total}). Invite code: ${code}.`,
    yoruba: (name, count, total, code) => `"${name}": n duro de omo egbe (${count} ninu ${total}). Koodu ifiwepe: ${code}.`,
    igbo: (name, count, total, code) => `"${name}": na-echere ndi otu (${count} n'ime ${total}). Koodu oku: ${code}.`,
    hausa: (name, count, total, code) => `"${name}": ana jiran mambobi (${count} cikin ${total}). Lambar gayyata: ${code}.`,
  },
  esusuStatusCompleted: {
    english: (name) => `"${name}": completed. Everyone has collected.`,
    pidgin: (name) => `"${name}": e don finish. Everybody don collect.`,
    yoruba: (name) => `"${name}": o ti pari. Gbogbo eniyan ti gba.`,
    igbo: (name) => `"${name}": agwula. Onye obula anatala.`,
    hausa: (name) => `"${name}": an kammala. Kowa ya karba.`,
  },
  // s = { name, round, total, position, collected, paid, paidCount, due, late }
  esusuStatusActive: {
    english: (s) => `"${s.name}": round ${s.round} of ${s.total}, ${s.paidCount} paid so far. ` +
      (s.collected ? `You've already collected. ` : s.position === s.round ? `It's your turn to collect this round! ` : `You collect in round ${s.position}. `) +
      (s.paid ? `You've paid this round.` : s.late ? `⚠️ Your payment was due ${s.due}. You're late.` : `Your payment is due by ${s.due}.`),
    pidgin: (s) => `"${s.name}": round ${s.round} of ${s.total}, ${s.paidCount} don pay. ` +
      (s.collected ? `You don collect already. ` : s.position === s.round ? `Na your turn to collect this round! ` : `You go collect for round ${s.position}. `) +
      (s.paid ? `You don pay for this round.` : s.late ? `⚠️ Your payment suppose enter ${s.due}. You don late.` : `Pay before ${s.due}.`),
    yoruba: (s) => `"${s.name}": iyipo ${s.round} ninu ${s.total}, eniyan ${s.paidCount} ti san. ` +
      (s.collected ? `O ti gba tire. ` : s.position === s.round ? `Iwo lo kan lati gba ni iyipo yii! ` : `Iwo yoo gba ni iyipo ${s.position}. `) +
      (s.paid ? `O ti san ti iyipo yii.` : s.late ? `⚠️ O ye ko ti san ni ${s.due}. O ti pe.` : `San ki ${s.due} to de.`),
    igbo: (s) => `"${s.name}": agba ${s.round} n'ime ${s.total}, mmadu ${s.paidCount} akwuola. ` +
      (s.collected ? `I natala nke gi. ` : s.position === s.round ? `O bu oge gi inata n'agba a! ` : `I ga-anata n'agba ${s.position}. `) +
      (s.paid ? `I kwuola ugwo agba a.` : s.late ? `⚠️ I kwesiri ikwu ugwo na ${s.due}. I noola azu.` : `Kwuo tupu ${s.due}.`),
    hausa: (s) => `"${s.name}": zagaye na ${s.round} cikin ${s.total}, mutum ${s.paidCount} sun biya. ` +
      (s.collected ? `Ka riga ka karba. ` : s.position === s.round ? `Lokacin ka ne na karba a wannan zagaye! ` : `Za ka karba a zagaye na ${s.position}. `) +
      (s.paid ? `Ka biya na wannan zagaye.` : s.late ? `⚠️ Ya kamata ka biya a ${s.due}. Ka makara.` : `Ka biya kafin ${s.due}.`),
  },
};

// Words used inside other messages
const BILL_TYPES = {
  electricity: { english: "electricity", pidgin: "light", yoruba: "ina monamona", igbo: "oku eletrik", hausa: "wutar lantarki" },
  water: { english: "water", pidgin: "water", yoruba: "omi", igbo: "mmiri", hausa: "ruwa" },
  internet: { english: "internet", pidgin: "internet", yoruba: "intaneeti", igbo: "intanet", hausa: "intanet" },
  cable: { english: "cable TV", pidgin: "cable TV", yoruba: "telifisan", igbo: "TV", hausa: "talabijin" },
  other: { english: "", pidgin: "", yoruba: "", igbo: "", hausa: "" },
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
