// Customer-facing bot copy (uz Latin = default, ru, en). Shop names match `store.name` in messages/*.json.
// Plain text only (no parse_mode): nothing user-supplied is ever interpolated as markup.

export type BotLocale = 'uz' | 'ru' | 'en'

/** Telegram `from.language_code` -> bot locale: ru* -> ru, en* -> en, anything else -> uz. */
export function botLocale(languageCode: unknown): BotLocale {
  const c = typeof languageCode === 'string' ? languageCode.toLowerCase() : ''
  if (c.startsWith('ru')) return 'ru'
  if (c.startsWith('en')) return 'en'
  return 'uz'
}

export type BotCopy = {
  shop: string
  welcome: (siteUrl: string | null) => string
  askContact: string
  shareButton: string
  linkExpired: (loginUrl: string | null) => string
  startOnSiteFirst: (loginUrl: string | null) => string
  notOwnContact: string
  badPhone: string
  phoneReceived: string
  confirmPrompt: string
  signedIn: string
  /** Sign-in alert. No button on purpose: signing out everywhere is /logout (with a confirm step). */
  newSignIn: (time: string) => string
  wrongCode: string
  /** After a wrong pick: no new sign-in from this Telegram user for a minute. */
  tooManyAttempts: string
  mismatch: string
  requestExpired: string
  signedOutAll: string
  noAccount: string
  relinked: string
  /** Mini App phone share accepted (no website sign-in pending). */
  phoneLinked: string
  openShopButton: string
  /** /orders or a location from someone without a linked account. */
  askPhoneInShop: string
  ordersHeader: string
  noOrders: string
  locationPick: string
  newAddressButton: string
  locationSaved: string
  locationFailed: string
  /** /help: the command list. */
  help: string
  /** /logout confirm step and its outcomes. */
  logoutConfirm: string
  logoutYes: string
  logoutNo: string
  logoutCancelled: string
  /** /notifications */
  notifyStatus: (on: boolean) => string
  notifyTurnOn: string
  notifyTurnOff: string
  /** /language */
  languagePrompt: string
  languageSaved: string
  /** /account */
  accountInfo: (a: { name: string; phone: string; language: string; notify: boolean }) => string
  profileButton: string
  /** A message the shop sent from the admin (also stored in the website account, Messages page). */
  shopMessage: (text: string) => string
  messagesButton: string
}

/** Language names in their own language (language picker buttons and /account). */
export const LANGUAGE_NAMES: Record<BotLocale, string> = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' }
export const LANGUAGE_FLAGS: Record<BotLocale, string> = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' }

const line = (url: string | null) => (url ? `\n${url}` : '')

const uz: BotCopy = {
  shop: 'Elektronika doʻkoni',
  welcome: (site) =>
    'Assalomu alaykum! Bu «Elektronika doʻkoni» boti.\n\n' +
    'Saytda shaxsiy kabinetga kirish uchun «Telegram orqali kirish» tugmasini bosing — bot shu yerda ochiladi va qolganini oʻzi soʻraydi.' +
    line(site),
  askContact: 'Kirish uchun telefon raqamingizni yuboring: pastdagi «Raqamimni yuborish» tugmasini bosing.',
  shareButton: 'Raqamimni yuborish',
  linkExpired: (url) => 'Bu kirish havolasining muddati tugagan. Saytda qaytadan boshlang.' + line(url),
  startOnSiteFirst: (url) => 'Avval saytda «Telegram orqali kirish» tugmasini bosing, keyin raqamingizni yuboring.' + line(url),
  notOwnContact: 'Faqat oʻzingizning raqamingizni yuborish mumkin. Pastdagi «Raqamimni yuborish» tugmasini bosing.',
  badPhone: 'Kechirasiz, kirish faqat Oʻzbekiston raqami (+998) bilan ishlaydi. Buyurtmani saytda kirmasdan ham berishingiz mumkin.',
  phoneReceived: 'Rahmat, raqamingiz qabul qilindi.',
  confirmPrompt:
    'Kimdir sizning Telegramingiz orqali «Elektronika doʻkoni» saytiga kirmoqda. ' +
    'Faqat hozir saytga OʻZINGIZ kirayotgan boʻlsangiz davom eting. Birov yuborgan havola orqali kirishni hech qachon tasdiqlamang.\n\n' +
    'Saytda koʻrinib turgan kodni tanlang:',
  signedIn: 'Tayyor, siz saytga kirdingiz — saytga qayting.',
  newSignIn: (time) =>
    `«Elektronika doʻkoni» saytiga yangi kirish: ${time} (Toshkent vaqti).\n\nBu siz emasmisiz? Barcha qurilmalardan chiqish uchun /logout buyrugʻini yuboring.`,
  wrongCode: 'Kodlar mos kelmadi — kirish bekor qilindi. Saytda qaytadan boshlang.',
  tooManyAttempts: 'Urinishlar juda koʻp. Bir daqiqadan keyin qaytadan urinib koʻring.',
  mismatch: 'Bu kirish soʻrovi sizga tegishli emas.',
  requestExpired: 'Bu kirish soʻrovining muddati tugagan. Saytda qaytadan boshlang.',
  signedOutAll: 'Barcha qurilmalardan chiqildi',
  noAccount: 'Bu Telegram hisobiga bogʻlangan akkaunt yoʻq',
  relinked:
    'Bu Telegram hisobi «Elektronika doʻkoni» akkauntidan uzildi: telefon raqamingiz boshqa Telegram hisobiga bogʻlandi. ' +
    'Agar buni siz qilgan boʻlsangiz, hech narsa qilish shart emas.',
  phoneLinked: 'Raqamingiz bogʻlandi ✓ Endi doʻkonga qayting va buyurtmani rasmiylashtiring — buyurtma holati haqida xabarlar shu yerga keladi.',
  openShopButton: '🛍 Doʻkonni ochish',
  askPhoneInShop: 'Buyurtmalaringizni koʻrish uchun doʻkonni oching va buyurtma berishda telefon raqamingizni ulashing.',
  ordersHeader: 'Soʻnggi buyurtmalaringiz:',
  noOrders: 'Hozircha buyurtmalaringiz yoʻq.',
  locationPick: 'Bu joylashuvni qaysi manzilga biriktiramiz?',
  newAddressButton: '➕ Yangi manzil',
  locationSaved: 'Joylashuv saqlandi ✓',
  locationFailed: 'Joylashuvni saqlab boʻlmadi.',
  help:
    'Buyruqlar:\n' +
    '/start — doʻkonni ochish\n' +
    '/orders — soʻnggi buyurtmalarim\n' +
    '/notifications — buyurtma xabarlarini yoqish/oʻchirish\n' +
    '/language — bot tili\n' +
    '/account — bogʻlangan akkaunt\n' +
    '/logout — saytdan barcha qurilmalarda chiqish\n' +
    '/help — yordam',
  logoutConfirm: 'Saytdan barcha qurilmalarda (shu jumladan Telegram ichidagi doʻkonda) chiqilsinmi? Keyin qaytadan kirishingiz kerak boʻladi.',
  logoutYes: 'Ha, chiqish',
  logoutNo: 'Bekor qilish',
  logoutCancelled: 'Bekor qilindi — siz tizimda qoldingiz.',
  notifyStatus: (on) =>
    on
      ? 'Buyurtma xabarlari: yoqilgan ✅\nBuyurtma holati oʻzgarganda va doʻkon yangiliklari haqida shu yerga xabar yuboramiz.'
      : 'Buyurtma xabarlari: oʻchirilgan 🔕\nBuyurtma holati va doʻkon yangiliklari haqida xabar yubormaymiz (ular saytdagi akkauntingizda qoladi, holatni /orders orqali koʻrishingiz mumkin).',
  notifyTurnOn: '🔔 Yoqish',
  notifyTurnOff: '🔕 Oʻchirish',
  languagePrompt: 'Bot tilini tanlang:',
  languageSaved: 'Bot tili: Oʻzbekcha ✓',
  accountInfo: (a) =>
    `Bogʻlangan akkaunt:\nIsm: ${a.name}\nTelefon: ${a.phone}\nBot tili: ${a.language}\nBuyurtma xabarlari: ${a.notify ? 'yoqilgan' : 'oʻchirilgan'}`,
  profileButton: '👤 Profilni ochish',
  shopMessage: (text) => `✉️ «Elektronika doʻkoni»dan xabar:\n\n${text}`,
  messagesButton: 'Xabarlarni ochish',
}

const ru: BotCopy = {
  shop: 'Магазин электроники',
  welcome: (site) =>
    'Здравствуйте! Это бот «Магазина электроники».\n\n' +
    'Чтобы войти в личный кабинет, нажмите на сайте «Войти через Telegram» — бот откроется здесь и сам всё спросит.' +
    line(site),
  askContact: 'Чтобы войти, отправьте свой номер телефона — нажмите кнопку «Отправить мой номер» внизу.',
  shareButton: 'Отправить мой номер',
  linkExpired: (url) => 'Срок действия этой ссылки для входа истёк. Начните заново на сайте.' + line(url),
  startOnSiteFirst: (url) => 'Сначала нажмите на сайте «Войти через Telegram», а затем отправьте номер.' + line(url),
  notOwnContact: 'Можно отправить только свой номер. Нажмите кнопку «Отправить мой номер» внизу.',
  badPhone: 'К сожалению, войти можно только с узбекским номером (+998). Заказ на сайте можно оформить и без входа.',
  phoneReceived: 'Спасибо, номер получен.',
  confirmPrompt:
    'Кто-то входит на сайт «Магазин электроники» через ваш Telegram. ' +
    'Продолжайте, только если прямо сейчас на сайт входите ВЫ сами. Никогда не подтверждайте вход по ссылке, которую вам кто-то прислал.\n\n' +
    'Выберите код, который видите на сайте:',
  signedIn: 'Готово, вы вошли — возвращайтесь на сайт.',
  newSignIn: (time) =>
    `Новый вход в «Магазин электроники» в ${time} (по Ташкенту).\n\nЭто были не вы? Отправьте /logout, чтобы выйти на всех устройствах.`,
  wrongCode: 'Коды не совпали — вход отменён. Начните заново на сайте.',
  tooManyAttempts: 'Слишком много попыток. Попробуйте снова через минуту.',
  mismatch: 'Этот запрос на вход не ваш.',
  requestExpired: 'Срок действия запроса на вход истёк. Начните заново на сайте.',
  signedOutAll: 'Вы вышли на всех устройствах',
  noAccount: 'К этому Telegram не привязан аккаунт',
  relinked:
    'Этот Telegram отключён от аккаунта в «Магазине электроники»: ваш номер телефона привязали к другому аккаунту Telegram. ' +
    'Если это сделали вы, ничего делать не нужно.',
  phoneLinked: 'Номер привязан ✓ Вернитесь в магазин и оформите заказ — уведомления о статусе заказа будут приходить сюда.',
  openShopButton: '🛍 Открыть магазин',
  askPhoneInShop: 'Чтобы видеть свои заказы, откройте магазин и поделитесь номером телефона при оформлении заказа.',
  ordersHeader: 'Ваши последние заказы:',
  noOrders: 'У вас пока нет заказов.',
  locationPick: 'К какому адресу привязать эту точку?',
  newAddressButton: '➕ Новый адрес',
  locationSaved: 'Точка сохранена ✓',
  locationFailed: 'Не удалось сохранить точку.',
  help:
    'Команды:\n' +
    '/start — открыть магазин\n' +
    '/orders — мои последние заказы\n' +
    '/notifications — включить/выключить уведомления о заказах\n' +
    '/language — язык бота\n' +
    '/account — привязанный аккаунт\n' +
    '/logout — выйти с сайта на всех устройствах\n' +
    '/help — помощь',
  logoutConfirm: 'Выйти с сайта на всех устройствах (включая магазин внутри Telegram)? Потом нужно будет войти заново.',
  logoutYes: 'Да, выйти',
  logoutNo: 'Отмена',
  logoutCancelled: 'Отменено — вы остались в аккаунте.',
  notifyStatus: (on) =>
    on
      ? 'Уведомления о заказах: включены ✅\nМы напишем сюда, когда статус заказа изменится, и о новостях магазина.'
      : 'Уведомления о заказах: выключены 🔕\nМы не будем писать о статусе заказов и новостях магазина (они остаются в аккаунте на сайте, статус можно посмотреть через /orders).',
  notifyTurnOn: '🔔 Включить',
  notifyTurnOff: '🔕 Выключить',
  languagePrompt: 'Выберите язык бота:',
  languageSaved: 'Язык бота: Русский ✓',
  accountInfo: (a) =>
    `Привязанный аккаунт:\nИмя: ${a.name}\nТелефон: ${a.phone}\nЯзык бота: ${a.language}\nУведомления о заказах: ${a.notify ? 'включены' : 'выключены'}`,
  profileButton: '👤 Открыть профиль',
  shopMessage: (text) => `✉️ Сообщение от «Магазина электроники»:\n\n${text}`,
  messagesButton: 'Открыть сообщения',
}

const en: BotCopy = {
  shop: 'Electronics Store',
  welcome: (site) =>
    'Hi! This is the Electronics Store bot.\n\n' +
    'To sign in to your account, tap "Sign in with Telegram" on the website — the bot opens right here and walks you through it.' +
    line(site),
  askContact: 'To sign in, share your phone number: tap "Share my phone number" below.',
  shareButton: 'Share my phone number',
  linkExpired: (url) => 'This sign-in link has expired. Please start again on the website.' + line(url),
  startOnSiteFirst: (url) => 'Start signing in on the website first ("Sign in with Telegram"), then share your number here.' + line(url),
  notOwnContact: 'You can only share your own number. Tap "Share my phone number" below.',
  badPhone: 'Sorry, sign-in only works with an Uzbek phone number (+998). You can still order on the website without signing in.',
  phoneReceived: 'Thanks, got your number.',
  confirmPrompt:
    'Someone is signing in to Electronics Store with your Telegram. ' +
    'Only continue if YOU are signing in on the website right now. Never confirm a link someone sent you.\n\n' +
    'Tap the code you see on the website:',
  signedIn: "You're signed in — go back to the website.",
  newSignIn: (time) => `New sign-in to Electronics Store at ${time} (Tashkent).\n\nNot you? Send /logout to sign out on all devices.`,
  wrongCode: "The codes didn't match — sign-in cancelled. Start again on the website.",
  tooManyAttempts: 'Too many attempts. Please try again in a minute.',
  mismatch: "This sign-in request isn't yours.",
  requestExpired: 'This sign-in request has expired. Start again on the website.',
  signedOutAll: 'Signed out on all devices',
  noAccount: 'No account is linked to this Telegram',
  relinked:
    'This Telegram account was disconnected from your Electronics Store account because your phone number was linked to another Telegram account. ' +
    'If that was you, there is nothing to do.',
  phoneLinked: 'Phone number linked ✓ Go back to the shop to place your order — order status updates will arrive here.',
  openShopButton: '🛍 Open shop',
  askPhoneInShop: 'Open the shop and share your phone number at checkout to see your orders here.',
  ordersHeader: 'Your latest orders:',
  noOrders: 'You have no orders yet.',
  locationPick: 'Which address should this location be attached to?',
  newAddressButton: '➕ New address',
  locationSaved: 'Location saved ✓',
  locationFailed: 'Could not save the location.',
  help:
    'Commands:\n' +
    '/start — open the shop\n' +
    '/orders — my latest orders\n' +
    '/notifications — turn order updates on/off\n' +
    '/language — bot language\n' +
    '/account — linked account\n' +
    '/logout — sign out of the website on all devices\n' +
    '/help — help',
  logoutConfirm: 'Sign out of the website on all devices (including the shop inside Telegram)? You will need to sign in again.',
  logoutYes: 'Yes, sign out',
  logoutNo: 'Cancel',
  logoutCancelled: 'Cancelled — you are still signed in.',
  notifyStatus: (on) =>
    on
      ? 'Order updates: on ✅\nWe message you here when your order status changes, and about shop news.'
      : 'Order updates: off 🔕\nWe will not message you about order status or shop news (they stay in your website account; check orders with /orders).',
  notifyTurnOn: '🔔 Turn on',
  notifyTurnOff: '🔕 Turn off',
  languagePrompt: 'Choose the bot language:',
  languageSaved: 'Bot language: English ✓',
  accountInfo: (a) =>
    `Linked account:\nName: ${a.name}\nPhone: ${a.phone}\nBot language: ${a.language}\nOrder updates: ${a.notify ? 'on' : 'off'}`,
  profileButton: '👤 Open profile',
  shopMessage: (text) => `✉️ Message from Electronics Store:\n\n${text}`,
  messagesButton: 'Open messages',
}

export const BOT_COPY: Record<BotLocale, BotCopy> = { uz, ru, en }

export const botCopy = (locale: BotLocale): BotCopy => BOT_COPY[locale]

/** HH:MM in Tashkent (UTC+5 all year, no DST). */
export function tashkentTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600_000)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
}
